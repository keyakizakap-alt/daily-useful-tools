/* ============================================================
   やすみつなぎ — 連休プランナー
   ------------------------------------------------------------
   勤務曜日・会社休業日・祝日からカレンダーを組み立て、
   「有給を当てれば連休になる区間」を列挙し、有給残日数の
   予算内で年間の連休日数が最大になる組み合わせを選ぶ。

   純関数のみ。DOM にも localStorage にも触れない。
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./holidays.js'));
  } else {
    root.YasumiPlanner = factory(root.YasumiHolidays);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (H) {
  'use strict';

  const { addDays, dayOfWeek, diffDays, fromISO, holidayMap, toISO, utcDate, KIND } = H;



  /** 連休とみなす最小日数（企画会議の論点 #1）。 */
  const MIN_BRIDGE_DAYS = 3;

  /** 1 つの連休に当てる有給日数の上限の上限。 */
  const MAX_LEAVE_PER_BRIDGE_LIMIT = 10;

  /** 有給残日数として受け付ける上限。 */
  const MAX_LEAVE_BUDGET = 40;

  /** 休日の理由。表示の優先順でもある。 */
  const REASON = Object.freeze({
    COMPANY: 'company', // 会社休業日
    HOLIDAY: 'holiday', // 祝日
    SUBSTITUTE: 'substitute', // 振替休日
    CITIZENS: 'citizens', // 国民の休日
    WEEKEND: 'weekend', // 勤務曜日ではない日
  });

  const REASON_LABEL = Object.freeze({
    company: '会社休業日',
    holiday: '祝日',
    substitute: '振替休日',
    citizens: '国民の休日',
    weekend: '休み',
  });

  /** 休日の理由を日本語ラベルにする。 */
  function reasonLabel(reason) {
    return REASON_LABEL[reason] || '';
  }

  /** 既定の設定。勤務曜日は月〜金。 */
  function defaultSettings() {
    return {
      workdays: [false, true, true, true, true, true, false], // 0=日 … 6=土
      leaveDays: 10,
      companyOff: [],
      maxLeavePerBridge: 5,
      objective: 'long',
      noLeave: [],
      leaveLots: [],
    };
  }

  /* ------------------------------------------------------------
     カレンダーの構築
     ------------------------------------------------------------ */

  /**
   * 期間 [startISO, endISO]（両端含む）の各日を組み立てる。
   *
   * 休日の判定は「会社休業日 → 祝日 → 勤務曜日外」の優先順。
   * この順にすることで「8/13 は祝日ではなく会社休業日」と正しく表示できる。
   *
   * @param {string} startISO
   * @param {string} endISO
   * @param {{workdays: boolean[], companyOff?: string[]}} settings
   * @returns {{date: string, dow: number, off: boolean, reason: string|null, name: string|null}[]}
   */
  function buildCalendar(startISO, endISO, settings) {
    const start = fromISO(startISO);
    const end = fromISO(endISO);
    if (!start || !end) throw new TypeError('日付は YYYY-MM-DD 形式で指定してください');
    if (start > end) throw new RangeError('開始日が終了日より後になっています');

    const workdays = normalizeWorkdays(settings && settings.workdays);
    const holidays = holidayMap(startISO, endISO);
    const companyOff = new Set((settings && settings.companyOff) || []);
    // 繁忙期など、出勤日ではあるが有給を取れない日
    const noLeave = new Set((settings && settings.noLeave) || []);

    const days = [];
    for (let iso = startISO; iso <= endISO; iso = addDays(iso, 1)) {
      const dow = dayOfWeek(iso);
      let off = false;
      let reason = null;
      let name = null;

      if (companyOff.has(iso)) {
        off = true;
        reason = REASON.COMPANY;
        name = '会社休業日';
      } else if (holidays.has(iso)) {
        const h = holidays.get(iso);
        off = true;
        name = h.name;
        reason =
          h.kind === KIND.SUBSTITUTE
            ? REASON.SUBSTITUTE
            : h.kind === KIND.CITIZENS
              ? REASON.CITIZENS
              : REASON.HOLIDAY;
      } else if (!workdays[dow]) {
        off = true;
        reason = REASON.WEEKEND;
      }

      days.push({
        date: iso,
        dow,
        off,
        reason,
        name,
        // 休日はそもそも有給の対象外なので、出勤日についてだけ意味を持つ
        canTakeLeave: off ? false : !noLeave.has(iso),
      });
    }
    return days;
  }

  /** workdays を長さ 7 の boolean 配列に正規化する。不正なら既定値（月〜金）。 */
  function normalizeWorkdays(workdays) {
    if (!Array.isArray(workdays) || workdays.length !== 7) {
      return defaultSettings().workdays;
    }
    return workdays.map((v) => v === true);
  }

  /* ------------------------------------------------------------
     連休候補（ブリッジ）の列挙
     ------------------------------------------------------------ */

  /**
   * 有給を当てれば連休になる極大区間を列挙する。
   *
   * 区間 [i, j] を候補とする条件:
   *   1. 直前 i-1 が出勤日（または期間の先頭）
   *   2. 直後 j+1 が出勤日（または期間の末尾）
   *   3. 区間内の出勤日数 <= maxLeavePerBridge
   *   4. 区間の長さ >= MIN_BRIDGE_DAYS
   *   5. 区間内に「有給を取れない出勤日」（繁忙期など）を含まない
   *
   * 条件 1・2 により極大区間だけが残るため、候補どうしが互いに包含しない。
   *
   * @param {ReturnType<typeof buildCalendar>} days
   * @param {number} maxLeavePerBridge
   * @returns {{start: string, end: string, totalDays: number, leaveDates: string[],
   *            leaveCount: number, efficiency: number|null, labels: string[]}[]}
   */
  function findBridges(days, maxLeavePerBridge) {
    const maxLeave = clampInt(maxLeavePerBridge, 0, MAX_LEAVE_PER_BRIDGE_LIMIT, 5);
    const n = days.length;
    const bridges = [];

    for (let i = 0; i < n; i += 1) {
      // 条件 1: 直前が休日なら、この i から始まる区間は極大にならない
      if (i > 0 && days[i - 1].off) continue;

      const leaveDates = [];
      for (let j = i; j < n; j += 1) {
        if (!days[j].off) {
          // 条件 5: 繁忙期の出勤日は有給にできないため、ここで区間が途切れる
          if (days[j].canTakeLeave === false) break;
          if (leaveDates.length >= maxLeave) break; // 上限を超えるので、これ以上伸ばせない
          leaveDates.push(days[j].date);
        }
        // 条件 2: 直後が休日なら、まだ極大ではない（さらに伸ばせる）
        if (j + 1 < n && days[j + 1].off) continue;
        // 条件 4
        const totalDays = j - i + 1;
        if (totalDays < MIN_BRIDGE_DAYS) continue;

        bridges.push(makeBridge(days, i, j, leaveDates.slice()));
      }
    }
    return bridges;
  }

  function makeBridge(days, i, j, leaveDates) {
    const totalDays = j - i + 1;
    const labels = [];
    for (let k = i; k <= j; k += 1) {
      if (days[k].name && days[k].reason !== REASON.WEEKEND) labels.push(days[k].name);
    }
    return {
      start: days[i].date,
      end: days[j].date,
      startIndex: i,
      endIndex: j,
      totalDays,
      leaveDates,
      leaveCount: leaveDates.length,
      // 有給 0 日の連休に効率という概念はないため null にする（Infinity は並べ替えで扱いにくい）
      efficiency: leaveDates.length > 0 ? totalDays / leaveDates.length : null,
      labels,
    };
  }

  /* ------------------------------------------------------------
     年間プランの最適化（予算付き重み付き区間スケジューリング）
     ------------------------------------------------------------ */

  /** プランの優先の仕方。 */
  const OBJECTIVE = Object.freeze({
    LONG: 'long', // 長い連休を優先（連休日数の二乗の合計を最大化）
    COUNT: 'count', // 連休の回数・合計日数を優先（連休日数の合計を最大化）
  });

  /**
   * 候補の評価値。どちらの目的でも「連休に含まれる日数」を元にするが、
   * LONG は二乗で重みづけするため、同じ合計日数なら長くまとまる方が高くなる。
   *
   * 有給 1 日を土日の隣に置くと「3 連休」が 1 つでき、評価値は線形なら 3。
   * 一方、既にある 5 連休を 9 連休に伸ばすと、増える日数は 4 で評価値は線形なら +4 だが、
   * 線形では「3 連休を 2 回つくる（+6）」に負ける。長い休みを求める利用者の意図と合わないため、
   * 既定は二乗（9²−5²=56 > 3²×2=18）とした。
   */
  function bridgeWeight(bridge, objective) {
    return objective === OBJECTIVE.COUNT ? bridge.totalDays : bridge.totalDays * bridge.totalDays;
  }

  /**
   * 有給残日数の予算内で、最も良い連休の組み合わせを選ぶ。
   * 同じ評価値なら有給の消費が少ない方を選ぶ。
   *
   * dp[i][b] = 日索引 i 以降、残り有給 b 日で得られる最良の評価値
   *
   * @param {ReturnType<typeof buildCalendar>} days
   * @param {ReturnType<typeof findBridges>} bridges
   * @param {number} leaveBudget
   * @param {{objective?: string}} [options]
   * @returns {{bridges: any[], totalDays: number, leaveUsed: number, objective: string}}
   */
  function buildPlan(days, bridges, leaveBudget, options) {
    const objective =
      options && options.objective === OBJECTIVE.COUNT ? OBJECTIVE.COUNT : OBJECTIVE.LONG;
    const budget = clampInt(leaveBudget, 0, MAX_LEAVE_BUDGET, 0);
    const n = days.length;
    const width = budget + 1;

    // 開始日索引ごとに候補を束ねる
    /** @type {Map<number, any[]>} */
    const byStart = new Map();
    for (const b of bridges) {
      if (b.leaveCount > budget) continue; // 単体で予算を超える候補は選べない
      if (!byStart.has(b.startIndex)) byStart.set(b.startIndex, []);
      byStart.get(b.startIndex).push(b);
    }

    const bestScore = new Float64Array((n + 1) * width);
    const bestLeave = new Int32Array((n + 1) * width);
    // 選択の復元用。-1 は「この日から始まる候補を採らない」
    const choice = new Int32Array((n + 1) * width).fill(-1);
    const indexOf = new Map(bridges.map((b, idx) => [b, idx]));

    for (let i = n - 1; i >= 0; i -= 1) {
      const candidates = byStart.get(i);
      for (let b = 0; b <= budget; b += 1) {
        const here = i * width + b;
        const skip = (i + 1) * width + b;
        let topScore = bestScore[skip];
        let topLeave = bestLeave[skip];
        let topChoice = -1;

        if (candidates) {
          for (const bridge of candidates) {
            if (bridge.leaveCount > b) continue;
            const nextIndex = (bridge.endIndex + 1) * width + (b - bridge.leaveCount);
            const score = bridgeWeight(bridge, objective) + bestScore[nextIndex];
            const leave = bridge.leaveCount + bestLeave[nextIndex];
            if (score > topScore || (score === topScore && leave < topLeave)) {
              topScore = score;
              topLeave = leave;
              topChoice = indexOf.get(bridge);
            }
          }
        }
        bestScore[here] = topScore;
        bestLeave[here] = topLeave;
        choice[here] = topChoice;
      }
    }

    // 復元
    const picked = [];
    let i = 0;
    let b = budget;
    while (i < n) {
      const pickIndex = choice[i * width + b];
      if (pickIndex < 0) {
        i += 1;
        continue;
      }
      const bridge = bridges[pickIndex];
      picked.push(bridge);
      b -= bridge.leaveCount;
      i = bridge.endIndex + 1;
    }

    return {
      bridges: picked,
      totalDays: picked.reduce((sum, x) => sum + x.totalDays, 0),
      leaveUsed: picked.reduce((sum, x) => sum + x.leaveCount, 0),
      objective,
    };
  }

  /**
   * 効率ランキング用に候補を並べる。
   * 効率降順 → 連休日数降順 → 日付昇順。
   *
   * @param {ReturnType<typeof findBridges>} bridges
   * @returns {{paid: any[], free: any[]}} paid=有給を使う候補、free=有給 0 日の連休
   */
  function rankBridges(bridges) {
    const paid = bridges
      .filter((b) => b.leaveCount > 0)
      .slice()
      .sort(
        (a, b) =>
          b.efficiency - a.efficiency ||
          b.totalDays - a.totalDays ||
          (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)
      );
    const free = bridges
      .filter((b) => b.leaveCount === 0)
      .slice()
      .sort((a, b) => b.totalDays - a.totalDays || (a.start < b.start ? -1 : 1));
    return { paid, free };
  }

  /* ------------------------------------------------------------
     有給の付与ロットと失効
     ------------------------------------------------------------ */

  /** 同時に保持できる付与ロットの数。労基法 115 条の時効が 2 年のため、
   *  実務上は「繰越分」と「今年度分」の 2 つまでしか同時に存在しない。 */
  const MAX_LEAVE_LOTS = 2;

  /** 時効の年数（労働基準法 115 条）。付与日の 2 年後の前日で失効する。 */
  const LEAVE_EXPIRY_YEARS = 2;

  /**
   * 付与日から失効日（＝付与日の 2 年後の前日）を求める。
   * @param {string} grantedISO 付与日
   * @returns {string|null}
   */
  function expiryFromGrant(grantedISO) {
    const granted = fromISO(grantedISO);
    if (!granted) return null;
    const twoYearsLater = utcDate(
      granted.getUTCFullYear() + LEAVE_EXPIRY_YEARS,
      granted.getUTCMonth() + 1,
      granted.getUTCDate()
    );
    return addDays(toISO(twoYearsLater), -1);
  }

  /** 付与ロットを正規化する。不正なものは落とす。 */
  function normalizeLots(lots) {
    if (!Array.isArray(lots)) return [];
    const result = [];
    for (const lot of lots.slice(0, MAX_LEAVE_LOTS)) {
      if (!lot || typeof lot !== 'object') continue;
      const days = clampInt(lot.days, 0, MAX_LEAVE_BUDGET, 0);
      if (days <= 0) continue;
      const expiry = lot.expiry && fromISO(lot.expiry) ? lot.expiry : null;
      result.push({
        label: typeof lot.label === 'string' && lot.label ? lot.label : '有給',
        days,
        expiry,
      });
    }
    return result;
  }

  /** 付与ロットの合計日数。予算の上限で頭打ちにする。 */
  function totalLotDays(lots) {
    const total = normalizeLots(lots).reduce((sum, lot) => sum + lot.days, 0);
    return Math.min(total, MAX_LEAVE_BUDGET);
  }

  /**
   * プランで使う有給を、付与ロットに割り当てる。
   *
   * 割り当ては「その日に使えるロットのうち、失効日がいちばん early なもの」から消費する
   * （最早期限優先）。これは実務の消化順（繰越分から使う）と一致し、
   * 失効による無駄がもっとも少なくなる割り当てでもある。
   *
   * @param {string[]} leaveDates プランで有給を使う日（順不同）
   * @param {{label: string, days: number, expiry: string|null}[]} lots
   * @param {string} [periodEndISO] 対象期間の終了日。期間内に失効する分の判定に使う
   * @returns {{lots: object[], expiringUnused: number, earliestExpiry: string|null,
   *            unassigned: string[], totalDays: number, usedDays: number}}
   */
  function assignLeaveToLots(leaveDates, lots, periodEndISO) {
    const normalized = normalizeLots(lots).map((lot) => ({ ...lot, used: 0, unused: lot.days }));
    // 失効日が早い順。失効日なしは最後に回す
    const order = normalized
      .map((lot, index) => ({ lot, index }))
      .sort((a, b) => {
        const ax = a.lot.expiry;
        const bx = b.lot.expiry;
        if (ax === bx) return a.index - b.index;
        if (ax === null) return 1;
        if (bx === null) return -1;
        return ax < bx ? -1 : 1;
      });

    const unassigned = [];
    const sortedDates = [...(leaveDates || [])].sort();
    for (const date of sortedDates) {
      // その日にまだ有効で、残っているロットのうち、いちばん早く失効するもの
      const target = order.find(
        ({ lot }) => lot.unused > 0 && (lot.expiry === null || date <= lot.expiry)
      );
      if (!target) {
        unassigned.push(date);
        continue;
      }
      target.lot.used += 1;
      target.lot.unused -= 1;
    }

    // 対象期間の終わりまでに失効してしまう未使用分
    let expiringUnused = 0;
    let earliestExpiry = null;
    for (const lot of normalized) {
      if (lot.expiry === null) continue;
      if (earliestExpiry === null || lot.expiry < earliestExpiry) earliestExpiry = lot.expiry;
      if (!periodEndISO || lot.expiry <= periodEndISO) expiringUnused += lot.unused;
    }

    return {
      lots: normalized,
      expiringUnused,
      earliestExpiry,
      unassigned,
      totalDays: normalized.reduce((sum, lot) => sum + lot.days, 0),
      usedDays: normalized.reduce((sum, lot) => sum + lot.used, 0),
    };
  }

  /* ------------------------------------------------------------
     表示・書き出し
     ------------------------------------------------------------ */

  const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

  /** 'YYYY-MM-DD' を「3月20日(金)」にする。 */
  function formatDateJa(iso) {
    const date = fromISO(iso);
    if (!date) return '';
    return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日(${DOW_JA[date.getUTCDay()]})`;
  }

  /** 'YYYY-MM-DD' を「2027年3月20日(金)」にする。年をまたぐ期間で使う。 */
  function formatDateJaWithYear(iso) {
    const date = fromISO(iso);
    if (!date) return '';
    return `${date.getUTCFullYear()}年${formatDateJa(iso)}`;
  }

  /** 曜日索引を日本語 1 文字にする。 */
  function dowJa(dow) {
    return DOW_JA[dow] || '';
  }

  /**
   * 連休の期間を「3月20日(金)〜3月23日(月)」にする。
   * options.withYear を真にすると、開始側に年を付ける（「今日から12か月」のように
   * 対象期間が年をまたぐとき、1月1日がどちらの年か分かるようにするため）。
   */
  function formatRangeJa(bridge, options) {
    const head = options && options.withYear
      ? formatDateJaWithYear(bridge.start)
      : formatDateJa(bridge.start);
    return `${head}〜${formatDateJa(bridge.end)}`;
  }

  /**
   * プランをコピー用のプレーンテキストにする。
   *
   * @param {{bridges: any[], totalDays: number, leaveUsed: number}} plan
   * @param {{periodLabel?: string}} [options]
   * @returns {string}
   */
  function formatPlanText(plan, options) {
    const periodLabel = (options && options.periodLabel) || '';
    const lines = [];
    lines.push('やすみつなぎ — 連休プラン');
    if (periodLabel) lines.push(`対象期間: ${periodLabel}`);
    lines.push(`使う有給: ${plan.leaveUsed}日 / 連休の合計: ${plan.totalDays}日 / 連休の数: ${plan.bridges.length}件`);
    lines.push('');

    if (plan.bridges.length === 0) {
      lines.push('条件に合う連休が見つかりませんでした。');
    }
    for (const b of plan.bridges) {
      // 申請メモに貼る用途なので、年を省略せずに書く
      const head = `■ ${formatRangeJa(b, { withYear: true })}（${b.totalDays}連休）`;
      const leave =
        b.leaveCount > 0
          ? `  有給 ${b.leaveCount}日: ${b.leaveDates.map(formatDateJaWithYear).join(', ')}`
          : '  有給 0日（祝日と休みだけで成立）';
      lines.push(head);
      lines.push(leave);
      if (b.labels.length > 0) lines.push(`  含まれる祝日: ${[...new Set(b.labels)].join(', ')}`);
      lines.push('');
    }
    lines.push('※ 休日の確定は官報および勤務先の就業規則によります。');
    return lines.join('\n');
  }

  /* ------------------------------------------------------------
     カレンダー（.ics）への書き出し
     ------------------------------------------------------------ */

  /** iCalendar の TEXT 値で特別な意味を持つ文字を打ち消す（RFC 5545 §3.3.11）。 */
  function escapeICSText(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /**
   * 1 行を 75 オクテット以内に折る（RFC 5545 §3.1）。
   * 日本語が入るため、UTF-8 のマルチバイト境界で切らないようバイト数で数える。
   */
  function foldICSLine(line) {
    const encoder = new TextEncoder();
    const chars = [...line]; // サロゲートペアを 1 文字として扱う
    const out = [];
    let current = '';
    let bytes = 0;
    let limit = 75;

    for (const char of chars) {
      const size = encoder.encode(char).length;
      if (bytes + size > limit) {
        out.push(current);
        current = char;
        bytes = size + 1; // 継続行の先頭に入れる空白 1 オクテットぶん
        limit = 75;
      } else {
        current += char;
        bytes += size;
      }
    }
    out.push(current);
    return out.join('\r\n ');
  }

  /** 'YYYY-MM-DD' を iCalendar の DATE 値 'YYYYMMDD' にする。 */
  function icsDate(iso) {
    return iso.replace(/-/g, '');
  }

  /** Date を iCalendar の UTC 日時 'YYYYMMDDTHHMMSSZ' にする。 */
  function icsTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
    );
  }

  /**
   * プランを iCalendar（.ics）形式の文字列にする。
   * カレンダーアプリに取り込めるよう、連休そのものと、有給を取る日の両方を終日予定で書き出す。
   *
   * @param {{bridges: any[]}} plan
   * @param {{now?: Date, includeLeaveDays?: boolean}} [options]
   * @returns {string} CRLF 区切りの iCalendar 本文
   */
  function formatPlanICS(plan, options) {
    const now = (options && options.now) || new Date();
    const includeLeaveDays = !options || options.includeLeaveDays !== false;
    const stamp = icsTimestamp(now);
    const bridges = (plan && plan.bridges) || [];

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//daily-useful-tools//yasumi-tsunagi//JA',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:やすみつなぎ の連休プラン',
    ];

    const pushEvent = (uid, startISO, endExclusiveISO, summary, description) => {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}@yasumi-tsunagi.local`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(startISO)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(endExclusiveISO)}`);
      lines.push(`SUMMARY:${escapeICSText(summary)}`);
      if (description) lines.push(`DESCRIPTION:${escapeICSText(description)}`);
      // 予定を「空き時間」として扱う。終日の連休で他の予定がブロックされないようにする
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    };

    for (const bridge of bridges) {
      const summary =
        bridge.leaveCount > 0
          ? `${bridge.totalDays}連休（有給${bridge.leaveCount}日）`
          : `${bridge.totalDays}連休`;
      const parts = [];
      if (bridge.leaveCount > 0) {
        parts.push(`有給を取る日: ${bridge.leaveDates.map(formatDateJaWithYear).join(', ')}`);
      } else {
        parts.push('有給を使わずに成立する連休です。');
      }
      const labels = [...new Set(bridge.labels)];
      if (labels.length > 0) parts.push(`含まれる祝日: ${labels.join(', ')}`);
      parts.push('やすみつなぎ で作成（休日の確定は官報と就業規則によります）');

      // DTEND は排他的なので、終日予定では終了日の翌日を指定する
      pushEvent(
        `bridge-${bridge.start}-${bridge.end}`,
        bridge.start,
        addDays(bridge.end, 1),
        summary,
        parts.join('\n')
      );

      if (includeLeaveDays) {
        for (const date of bridge.leaveDates) {
          pushEvent(
            `leave-${date}`,
            date,
            addDays(date, 1),
            '有給',
            `${bridge.totalDays}連休（${formatRangeJa(bridge, { withYear: true })}）のための有給`
          );
        }
      }
    }

    lines.push('END:VCALENDAR');
    return lines.map(foldICSLine).join('\r\n') + '\r\n';
  }

  /* ------------------------------------------------------------
     入力の検証
     ------------------------------------------------------------ */

  /** 値を整数にして [min, max] に収める。数値にできなければ fallback。 */
  function clampInt(value, min, max, fallback) {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  /** 1 件ぶんの日付の書式。'8/13' / '2026/8/13' / '2026-08-13' を受ける。 */
  const DATE_PATTERN = '(?:\\d{4}[/-])?\\d{1,2}[/-]\\d{1,2}';

  /**
   * 単日または期間。
   * 先頭の日付を貪欲に取るため、'2026-08-13' は「2026 年 8 月 13 日」として読まれ、
   * 区切りの '-' と ISO 形式のハイフンが衝突しない。
   */
  const ENTRY_RE = new RegExp(`^(${DATE_PATTERN})(?:\\s*[-〜~–]\\s*(${DATE_PATTERN}))?$`);

  /** 全角数字と和暦風の表記を、解析しやすい形に揃える。 */
  function normalizeEntry(token) {
    return token
      .trim()
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[年月]/g, '/')
      .replace(/日/g, '')
      .replace(/\s*\/\s*/g, '/')
      .replace(/\/+$/, '');
  }

  /** 正規化済みの文字列に、4 桁の年が明示されているか。 */
  function hasExplicitYear(text) {
    return /^\d{4}[/-]/.test(text);
  }

  /**
   * 会社休業日の入力を解析する。
   *
   * 受け付ける書式（1 行 1 件、カンマ・読点区切りも可）:
   *   8/13          … その年の 8 月 13 日
   *   8/13-8/15     … 期間（両端含む）
   *   2026/8/13     … 年つき
   *   2026-08-13    … ISO 形式
   *   8月13日       … 日本語表記
   *   12/29-1/3     … 年をまたぐ期間（終了が開始より前なら翌年と解釈）
   *
   * options.notBefore を渡すと、**年の指定がない**日付がその日より前になる場合に
   * 翌年として解釈する。対象期間が「今日から 12 か月」のとき、年末年始の休業日を
   * 「1/3」と書いても過去の日付にならないようにするため（レビュー R-02）。
   * 年を明示した日付は、過去であってもそのまま扱う。
   *
   * @param {string} input
   * @param {number} defaultYear 年の指定がないときに使う年
   * @param {{notBefore?: string}} [options]
   * @returns {{dates: string[], errors: string[]}}
   */
  function parseCompanyOff(input, defaultYear, options) {
    const notBefore = (options && options.notBefore) || null;

    /** 年の指定がない日付を、notBefore 以降になるまで 1 年ずらす。 */
    const shiftIntoPeriod = (iso, normalized) => {
      if (!notBefore || !iso || hasExplicitYear(normalized) || iso >= notBefore) return iso;
      const next = parsePartialDate(normalized, defaultYear + 1);
      return next && next >= notBefore ? next : iso;
    };

    const dates = new Set();
    const errors = [];
    if (typeof input !== 'string' || input.trim() === '') return { dates: [], errors };

    const tokens = input
      .split(/[\n,、]/)
      .map((t) => t.trim())
      .filter((t) => t !== '');

    for (const token of tokens) {
      const matched = ENTRY_RE.exec(normalizeEntry(token));
      if (!matched) {
        errors.push(`「${token}」は読み取れませんでした（例: 8/13、8/13-8/15）`);
        continue;
      }

      const parsedFirst = parsePartialDate(matched[1], defaultYear);
      if (!parsedFirst) {
        errors.push(`「${token}」は実在しない日付です`);
        continue;
      }
      const first = shiftIntoPeriod(parsedFirst, matched[1]);
      if (matched[2] === undefined) {
        dates.add(first);
        continue;
      }

      let last = parsePartialDate(matched[2], defaultYear);
      if (!last) {
        errors.push(`「${token}」の終了日が実在しない日付です`);
        continue;
      }
      // 12/29-1/3 のように終了が開始より前なら、終了を翌年とみなす。
      // 開始日が notBefore で翌年にずれている場合も、同じ考え方で開始日より後に揃える。
      let guard = 0;
      while (last < first && guard < 2) {
        const reparsed = parsePartialDate(matched[2], Number(last.slice(0, 4)) + 1);
        if (!reparsed) break;
        last = reparsed;
        guard += 1;
      }
      if (last < first) {
        errors.push(`「${token}」の期間が逆になっています`);
        continue;
      }
      const span = diffDays(first, last);
      if (span === null || span > 366) {
        errors.push(`「${token}」の期間が長すぎます（366 日以内で指定してください）`);
        continue;
      }
      for (let iso = first; iso <= last; iso = addDays(iso, 1)) dates.add(iso);
    }

    return { dates: [...dates].sort(), errors };
  }

  /** 正規化済みの 'M/D' / 'YYYY/M/D' を 'YYYY-MM-DD' にする。読めなければ null。 */
  function parsePartialDate(text, defaultYear) {
    const matched = /^(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})$/.exec(text);
    if (!matched) return null;
    const year = matched[1] ? Number(matched[1]) : defaultYear;
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso =
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return fromISO(iso) ? iso : null; // 2/30 のような実在しない日を弾く
  }

  return {
    MAX_LEAVE_BUDGET: MAX_LEAVE_BUDGET,
    LEAVE_EXPIRY_YEARS: LEAVE_EXPIRY_YEARS,
    MAX_LEAVE_LOTS: MAX_LEAVE_LOTS,
    MAX_LEAVE_PER_BRIDGE_LIMIT: MAX_LEAVE_PER_BRIDGE_LIMIT,
    MIN_BRIDGE_DAYS: MIN_BRIDGE_DAYS,
    OBJECTIVE: OBJECTIVE,
    REASON: REASON,
    assignLeaveToLots: assignLeaveToLots,
    buildCalendar: buildCalendar,
    buildPlan: buildPlan,
    clampInt: clampInt,
    defaultSettings: defaultSettings,
    dowJa: dowJa,
    expiryFromGrant: expiryFromGrant,
    findBridges: findBridges,
    formatDateJa: formatDateJa,
    formatDateJaWithYear: formatDateJaWithYear,
    formatPlanICS: formatPlanICS,
    formatPlanText: formatPlanText,
    formatRangeJa: formatRangeJa,
    parseCompanyOff: parseCompanyOff,
    rankBridges: rankBridges,
    normalizeLots: normalizeLots,
    reasonLabel: reasonLabel,
    totalLotDays: totalLotDays,
  };
});
