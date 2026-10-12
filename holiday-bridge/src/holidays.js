/* ============================================================
   やすみつなぎ — 祝日エンジン
   ------------------------------------------------------------
   「国民の祝日に関する法律」（祝日法）のルールを展開して、
   指定年の休日（祝日・振替休日・国民の休日）を算出する。

   設計上の約束:
   - 日付は 'YYYY-MM-DD' の文字列で受け渡す。
   - 内部計算は UTC の Date のみを使う（ローカルタイムでは
     new Date('2026-03-20') が環境により前日になるため）。
   - 純関数。グローバル状態を持たず、DOM に触れない。
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.YasumiHolidays = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';


  /** 対応年の範囲。山の日が施行された 2016 年から、春分秋分の近似式が
   *  成立する 2099 年まで。 */
  const SUPPORTED_YEARS = Object.freeze({ min: 2016, max: 2099 });

  /** 休日の種別。 */
  const KIND = Object.freeze({
    HOLIDAY: 'holiday', // 本来の祝日
    SUBSTITUTE: 'substitute', // 振替休日
    CITIZENS: 'citizens', // 国民の休日
  });

  const MS_PER_DAY = 86400000;

  /* ------------------------------------------------------------
     日付ユーティリティ（すべて UTC 基準）
     ------------------------------------------------------------ */

  /** 年月日から UTC の Date を作る。month は 1〜12。 */
  function utcDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day));
  }

  /** Date を 'YYYY-MM-DD' にする。 */
  function toISO(date) {
    const y = String(date.getUTCFullYear()).padStart(4, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** 'YYYY-MM-DD' を UTC の Date にする。実在しない日付は null。 */
  function fromISO(iso) {
    if (typeof iso !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const date = utcDate(y, mo, d);
    // 2/30 のような繰り上がりを検出する
    if (date.getUTCMonth() + 1 !== mo || date.getUTCDate() !== d) return null;
    return date;
  }

  /** iso から days 日後の 'YYYY-MM-DD'。 */
  function addDays(iso, days) {
    const date = fromISO(iso);
    if (!date) return null;
    return toISO(new Date(date.getTime() + days * MS_PER_DAY));
  }

  /** iso の曜日。0=日曜 … 6=土曜。 */
  function dayOfWeek(iso) {
    const date = fromISO(iso);
    return date ? date.getUTCDay() : null;
  }

  /** from から to まで（両端を含む）の日数。 */
  function diffDays(fromIso, toIso) {
    const a = fromISO(fromIso);
    const b = fromISO(toIso);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY) + 1;
  }

  /* ------------------------------------------------------------
     祝日の算出
     ------------------------------------------------------------ */

  /** その年・その月の第 n 月曜の「日」を返す。 */
  function nthMondayOfMonth(year, month, nth) {
    const firstDow = utcDate(year, month, 1).getUTCDay();
    const offsetToMonday = (1 - firstDow + 7) % 7;
    return 1 + offsetToMonday + (nth - 1) * 7;
  }

  /** 春分の日（1980〜2099 年で成立する近似式）。 */
  function vernalEquinoxDay(year) {
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  /** 秋分の日（1980〜2099 年で成立する近似式）。 */
  function autumnalEquinoxDay(year) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  /**
   * その年の「本来の祝日」を返す（振替休日・国民の休日は含まない）。
   * @param {number} year
   * @returns {{date: string, name: string}[]} 日付昇順
   */
  function statutoryHolidays(year) {
    /** @type {[number, number, string][]} [月, 日, 名称] */
    const list = [
      [1, 1, '元日'],
      [1, nthMondayOfMonth(year, 1, 2), '成人の日'],
      [2, 11, '建国記念の日'],
      [3, vernalEquinoxDay(year), '春分の日'],
      [4, 29, '昭和の日'],
      [5, 3, '憲法記念日'],
      [5, 4, 'みどりの日'],
      [5, 5, 'こどもの日'],
      [8, 11, '山の日'],
      [9, nthMondayOfMonth(year, 9, 3), '敬老の日'],
      [9, autumnalEquinoxDay(year), '秋分の日'],
      [11, 3, '文化の日'],
      [11, 23, '勤労感謝の日'],
    ];

    // 天皇誕生日: 2016〜2018 年は 12/23、2019 年はなし（代替わりの年）、2020 年以降は 2/23
    if (year <= 2018) list.push([12, 23, '天皇誕生日']);
    else if (year >= 2020) list.push([2, 23, '天皇誕生日']);

    // 海の日・スポーツの日（体育の日）・山の日は、年によって日付が動く
    if (year === 2020) {
      // 東京五輪の特例（令和 2 年）
      list.push([7, 23, '海の日'], [7, 24, 'スポーツの日']);
      replaceDay(list, 8, '山の日', 10);
    } else if (year === 2021) {
      // 五輪延期に伴う特例（令和 3 年）
      list.push([7, 22, '海の日'], [7, 23, 'スポーツの日']);
      replaceDay(list, 8, '山の日', 8);
    } else {
      list.push([7, nthMondayOfMonth(year, 7, 3), '海の日']);
      list.push([10, nthMondayOfMonth(year, 10, 2), year <= 2019 ? '体育の日' : 'スポーツの日']);
    }

    // 2019 年の代替わりに伴う休日
    if (year === 2019) {
      list.push([5, 1, '天皇の即位の日'], [10, 22, '即位礼正殿の儀の行われる日']);
    }

    return list
      .map(([month, day, name]) => ({ date: toISO(utcDate(year, month, day)), name }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /** list の中の（月, 名称）に一致する要素の「日」を差し替える。 */
  function replaceDay(list, month, name, newDay) {
    for (const entry of list) {
      if (entry[0] === month && entry[2] === name) {
        entry[1] = newDay;
        return;
      }
    }
  }

  /* ------------------------------------------------------------
     振替休日・国民の休日
     ------------------------------------------------------------ */

  /**
   * 指定年の休日（祝日＋振替休日＋国民の休日）を日付昇順で返す。
   *
   * 祝日法の構造どおり、次の順序で積み上げる。順序を変えると結果が変わる。
   *   1. 本来の祝日
   *   2. 振替休日（祝日が日曜のとき、以後の最初の「祝日でない日」）
   *   3. 国民の休日（前後が「本来の祝日」である平日）
   *
   * @param {number} year
   * @returns {{date: string, name: string, kind: string}[]}
   * @throws {RangeError} 対応範囲外の年
   */
  function holidaysOfYear(year) {
    if (!Number.isInteger(year) || year < SUPPORTED_YEARS.min || year > SUPPORTED_YEARS.max) {
      throw new RangeError(
        `対応している年は ${SUPPORTED_YEARS.min}〜${SUPPORTED_YEARS.max} 年です（指定: ${year}）`
      );
    }

    const statutory = statutoryHolidays(year);
    /** 本来の祝日の日付集合。国民の休日の判定に使う。 */
    const statutorySet = new Set(statutory.map((h) => h.date));

    /** @type {Map<string, {date: string, name: string, kind: string}>} */
    const result = new Map();
    for (const h of statutory) {
      // 同じ日に複数の祝日が重なることは現行法では起きないが、起きても落ちないようにする
      if (!result.has(h.date)) result.set(h.date, { ...h, kind: KIND.HOLIDAY });
    }

    // 2. 振替休日: 日曜の祝日について、翌日以降で最初の「祝日でない日」を休日にする。
    //    前年末の祝日（12/31 が日曜など）から振替が年初に来ることはないため、年内のみ見る。
    for (const h of statutory) {
      if (dayOfWeek(h.date) !== 0) continue;
      let candidate = addDays(h.date, 1);
      // 連続する祝日を飛び越える。最大 10 日見れば現行法では必ず空く。
      for (let guard = 0; guard < 10 && statutorySet.has(candidate); guard += 1) {
        candidate = addDays(candidate, 1);
      }
      if (!result.has(candidate)) {
        result.set(candidate, { date: candidate, name: '振替休日', kind: KIND.SUBSTITUTE });
      }
    }

    // 3. 国民の休日: 前日・翌日がともに本来の祝日である、祝日でない平日（日曜以外）。
    for (const h of statutory) {
      const candidate = addDays(h.date, 1);
      const next = addDays(candidate, 1);
      if (!statutorySet.has(next)) continue; // 1 日おいて祝日が来る並びだけが対象
      if (statutorySet.has(candidate)) continue; // 間の日が祝日なら対象外
      if (dayOfWeek(candidate) === 0) continue; // 日曜は国民の休日にしない
      if (!result.has(candidate)) {
        result.set(candidate, { date: candidate, name: '国民の休日', kind: KIND.CITIZENS });
      }
    }

    return [...result.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /**
   * 期間 [startISO, endISO]（両端含む）にかかる休日を Map で返す。
   * 年をまたぐ期間でも、必要な年ぶんだけ算出してまとめる。
   *
   * @param {string} startISO
   * @param {string} endISO
   * @returns {Map<string, {date: string, name: string, kind: string}>}
   */
  function holidayMap(startISO, endISO) {
    const start = fromISO(startISO);
    const end = fromISO(endISO);
    if (!start || !end) throw new TypeError('日付は YYYY-MM-DD 形式で指定してください');
    if (start > end) throw new RangeError('開始日が終了日より後になっています');

    const map = new Map();
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      for (const h of holidaysOfYear(year)) {
        if (h.date >= startISO && h.date <= endISO) map.set(h.date, h);
      }
    }
    return map;
  }

  return {
    KIND: KIND,
    SUPPORTED_YEARS: SUPPORTED_YEARS,
    addDays: addDays,
    autumnalEquinoxDay: autumnalEquinoxDay,
    dayOfWeek: dayOfWeek,
    diffDays: diffDays,
    fromISO: fromISO,
    holidayMap: holidayMap,
    holidaysOfYear: holidaysOfYear,
    toISO: toISO,
    utcDate: utcDate,
    vernalEquinoxDay: vernalEquinoxDay,
  };
});
