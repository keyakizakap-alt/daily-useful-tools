/* ============================================================
   とびいし — 国民の祝日の算出
   ------------------------------------------------------------
   祝日法（昭和23年法律第178号）の規則として実装する。日付の直書き
   リストは持たず、年単位の特例だけを上書き表として持つ。
   DOM に依存しない純粋関数のみ。ブラウザからは <script src> で
   グローバル TobiishiHolidays として、Node からは require() で読む。
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TobiishiHolidays = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================================================
     対応範囲
     ------------------------------------------------------------
     2020年より前を対象にしないのは、ハッピーマンデー導入（2000・
     2003年）、天皇誕生日の移動（2019年）、体育の日→スポーツの日の
     改称（2020年）といった規則差を抱え込まないため。
     上限は春分・秋分の近似式の有効範囲（1980〜2099年）の内側。
     ============================================================ */

  var MIN_YEAR = 2020;
  var MAX_YEAR = 2050;

  /* ============================================================
     日付ユーティリティ（すべて UTC 基準）
     ------------------------------------------------------------
     ローカルタイムゾーンで Date を作ると、JST 以外の環境で日付が
     1日ずれる。本モジュールは Date.UTC だけを使う。
     ============================================================ */

  var MS_PER_DAY = 86400000;
  var DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  // (year, month 1-12, day) → 'YYYY-MM-DD'
  function iso(year, month, day) {
    return pad(year, 4) + '-' + pad(month, 2) + '-' + pad(day, 2);
  }

  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  // 'YYYY-MM-DD' → { year, month, day } / 形式も実在日も検査する
  function parseIso(value) {
    if (typeof value !== 'string') return null;
    var m = ISO_RE.exec(value);
    if (!m) return null;
    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    // 実在しない日（2月30日など）を弾く
    var d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return { year: year, month: month, day: day };
  }

  function isValidIso(value) {
    return parseIso(value) !== null;
  }

  // 'YYYY-MM-DD' → 1970-01-01 からの日数（通日）
  function toDayNumber(value) {
    var p = parseIso(value);
    if (!p) return NaN;
    return Math.round(Date.UTC(p.year, p.month - 1, p.day) / MS_PER_DAY);
  }

  // 通日 → 'YYYY-MM-DD'
  function fromDayNumber(n) {
    var d = new Date(n * MS_PER_DAY);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function addDays(value, delta) {
    return fromDayNumber(toDayNumber(value) + delta);
  }

  // 'YYYY-MM-DD' → 曜日（0=日曜）
  function dayOfWeek(value) {
    var p = parseIso(value);
    if (!p) return NaN;
    return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  }

  function dowLabel(dow) {
    return DOW_LABELS[dow] || '';
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /* ============================================================
     祝日の規則
     ============================================================ */

  var RULES = [
    { name: '元日',         type: 'fixed',     month: 1,  day: 1 },
    { name: '成人の日',     type: 'nthMonday', month: 1,  nth: 2 },
    { name: '建国記念の日', type: 'fixed',     month: 2,  day: 11 },
    { name: '天皇誕生日',   type: 'fixed',     month: 2,  day: 23 },
    { name: '春分の日',     type: 'equinox',   month: 3,  base: 20.8431 },
    { name: '昭和の日',     type: 'fixed',     month: 4,  day: 29 },
    { name: '憲法記念日',   type: 'fixed',     month: 5,  day: 3 },
    { name: 'みどりの日',   type: 'fixed',     month: 5,  day: 4 },
    { name: 'こどもの日',   type: 'fixed',     month: 5,  day: 5 },
    { name: '海の日',       type: 'nthMonday', month: 7,  nth: 3 },
    { name: '山の日',       type: 'fixed',     month: 8,  day: 11 },
    { name: '敬老の日',     type: 'nthMonday', month: 9,  nth: 3 },
    { name: '秋分の日',     type: 'equinox',   month: 9,  base: 23.2488 },
    { name: 'スポーツの日', type: 'nthMonday', month: 10, nth: 2 },
    { name: '文化の日',     type: 'fixed',     month: 11, day: 3 },
    { name: '勤労感謝の日', type: 'fixed',     month: 11, day: 23 }
  ];

  // 年単位の特例（東京五輪に伴う3祝日の移動）。祝日名 → その年の日付。
  var OVERRIDES = {
    2020: { '海の日': '2020-07-23', 'スポーツの日': '2020-07-24', '山の日': '2020-08-10' },
    2021: { '海の日': '2021-07-22', 'スポーツの日': '2021-07-23', '山の日': '2021-08-08' }
  };

  /* ============================================================
     規則から日付を求める
     ============================================================ */

  // その月の第 nth 月曜
  function nthMonday(year, month, nth) {
    var firstDow = dayOfWeek(iso(year, month, 1));   // 0=日
    var firstMonday = 1 + ((8 - firstDow) % 7);      // 月曜(1)までの距離
    return iso(year, month, firstMonday + (nth - 1) * 7);
  }

  // 春分・秋分の近似式（有効 1980〜2099年）
  // day = floor(base + 0.242194 × (Y − 1980) − floor((Y − 1980) / 4))
  function equinoxDay(year, base) {
    var y = year - 1980;
    return Math.floor(base + 0.242194 * y - Math.floor(y / 4));
  }

  function ruleDate(rule, year) {
    if (rule.type === 'fixed') return iso(year, rule.month, rule.day);
    if (rule.type === 'nthMonday') return nthMonday(year, rule.month, rule.nth);
    return iso(year, rule.month, equinoxDay(year, rule.base));
  }

  /* ============================================================
     年 → 休日の配列
     ------------------------------------------------------------
     1. 規則（＋特例）から「国民の祝日」を求める
     2. 日曜の祝日について「振替休日」を求める
        （祝日法 第3条第2項: その後の、国民の祝日でない最初の日）
     3. 祝日に挟まれた平日について「国民の休日」を求める
        （同 第3条第3項。基準にするのは祝日のみ。振替休日や
          他の国民の休日は基準にしない）
     手順の順番に意味がある。2 を先に行うことで、すでに振替休日に
     なっている日を 3 の対象から除ける。
     ============================================================ */

  function isSupportedYear(year) {
    return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
  }

  var cache = {};

  function holidaysInYear(year) {
    if (!isSupportedYear(year)) return [];
    if (cache[year]) return cache[year].map(function (h) { return { date: h.date, name: h.name, kind: h.kind }; });

    var override = OVERRIDES[year] || {};
    var statutory = {};   // 国民の祝日のみ（date → name）
    var i;

    for (i = 0; i < RULES.length; i++) {
      var rule = RULES[i];
      var date = Object.prototype.hasOwnProperty.call(override, rule.name)
        ? override[rule.name]
        : ruleDate(rule, year);
      statutory[date] = rule.name;
    }

    var holidays = {};    // date → { name, kind }
    var dates = Object.keys(statutory);
    for (i = 0; i < dates.length; i++) {
      holidays[dates[i]] = { name: statutory[dates[i]], kind: '祝日' };
    }

    // 2. 振替休日
    for (i = 0; i < dates.length; i++) {
      if (dayOfWeek(dates[i]) !== 0) continue;
      var cursor = addDays(dates[i], 1);
      // 祝日が連続する5月などでも、祝日でない最初の日まで後ろへずれる
      while (Object.prototype.hasOwnProperty.call(statutory, cursor)) cursor = addDays(cursor, 1);
      if (!Object.prototype.hasOwnProperty.call(holidays, cursor)) {
        holidays[cursor] = { name: '振替休日', kind: '振替休日', origin: statutory[dates[i]] };
      }
    }

    // 3. 国民の休日
    for (i = 0; i < dates.length; i++) {
      var candidate = addDays(dates[i], 1);
      if (Object.prototype.hasOwnProperty.call(holidays, candidate)) continue;  // 祝日・振替休日は対象外
      if (dayOfWeek(candidate) === 0) continue;                                 // 日曜は対象外
      if (!Object.prototype.hasOwnProperty.call(statutory, addDays(candidate, 1))) continue;
      holidays[candidate] = { name: '国民の休日', kind: '国民の休日' };
    }

    var list = Object.keys(holidays).sort().map(function (date) {
      return { date: date, name: holidays[date].name, kind: holidays[date].kind };
    });
    cache[year] = list;
    return list.map(function (h) { return { date: h.date, name: h.name, kind: h.kind }; });
  }

  // 年の範囲 → { 'YYYY-MM-DD': { name, kind } }
  // 外から来るキーで引くマップはプロトタイプを持たせない（engine.js の
  // 他のマップと作り方を揃える）
  function holidayMap(fromYear, toYear) {
    var map = Object.create(null);
    for (var y = fromYear; y <= toYear; y++) {
      var list = holidaysInYear(y);
      for (var i = 0; i < list.length; i++) {
        map[list[i].date] = { name: list[i].name, kind: list[i].kind };
      }
    }
    return map;
  }

  return {
    MIN_YEAR: MIN_YEAR,
    MAX_YEAR: MAX_YEAR,
    DOW_LABELS: DOW_LABELS,
    RULES: RULES,
    OVERRIDES: OVERRIDES,
    isSupportedYear: isSupportedYear,
    holidaysInYear: holidaysInYear,
    holidayMap: holidayMap,
    equinoxDay: equinoxDay,
    nthMonday: nthMonday,
    // 日付ユーティリティ（engine / app から共用）
    iso: iso,
    parseIso: parseIso,
    isValidIso: isValidIso,
    toDayNumber: toDayNumber,
    fromDayNumber: fromDayNumber,
    addDays: addDays,
    dayOfWeek: dayOfWeek,
    dowLabel: dowLabel,
    daysInMonth: daysInMonth
  };
});
