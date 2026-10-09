/* ============================================================
   とびいし — 連休プランの探索と年間編成
   ------------------------------------------------------------
   DOM に依存しない純粋関数のみ。祝日は holidays.js の出力を
   「マップ」として引数で受け取り、このモジュールからは暦の規則に
   触らない（計画のロジックと暦の知識を分ける）。
   ブラウザからは <script src> でグローバル Tobiishi として、
   Node からは require() で読む。
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./holidays.js'));
  } else {
    root.Tobiishi = factory(root.TobiishiHolidays);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (H) {
  'use strict';

  /* ============================================================
     上限（計算の暴走を防ぐためのガード）
     ============================================================ */

  var LIMITS = {
    maxSpanDays: 1830,     // 対象期間は最大5年
    maxTakePerPlan: 30,    // 1プランで使える有給の上限
    maxBudget: 40,         // 年間編成の予算の上限
    maxBlackouts: 50,      // 取得できない期間の登録件数
    maxPickedPlans: 100,   // 年間プランに入れられる件数
    maxDpPlans: 8000,      // 動的計画法に渡す候補の上限
    padDays: 14            // 期間の前後に持たせる余白
  };

  var OFF_KIND_LABELS = {
    holiday: '祝日',
    substitute: '振替休日',
    'extra-holiday': '国民の休日',
    company: '会社休業',
    weekly: '週休',
    paid: '有給'
  };

  var HOLIDAY_KIND_TO_OFF_KIND = {
    '祝日': 'holiday',
    '振替休日': 'substitute',
    '国民の休日': 'extra-holiday'
  };

  var DEFAULT_COMPANY_OFF = [
    { id: 'newyear', label: '年末年始休業', spans: [{ month: 12, from: 29, to: 31 }, { month: 1, from: 1, to: 3 }] },
    { id: 'obon', label: 'お盆休み', spans: [{ month: 8, from: 13, to: 16 }] }
  ];

  // 曜日は順序尺度ではなく集合の要素なので、範囲外を丸めてはいけない
  // （9 を「土曜」に、-1 を「日曜」に寄せると、利用者が選んでいない
  //   曜日を休みにしてしまう）。範囲外・非整数は -1 を返して捨てる。
  function toDow(value) {
    // null / '' / false は Number() で 0（日曜）になってしまうため、
    // 数値と数字1文字の文字列だけを受け付ける
    if (typeof value === 'number') {
      return Number.isInteger(value) && value >= 0 && value <= 6 ? value : -1;
    }
    if (typeof value === 'string' && /^[0-6]$/.test(value)) return Number(value);
    return -1;
  }

  function clampInt(value, min, max, fallback) {
    var n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  /* ============================================================
     期間の正規化
     ============================================================ */

  // { from, to } を妥当な範囲に収める。不正なら null
  function normalizeRange(from, to) {
    if (!H.isValidIso(from) || !H.isValidIso(to)) return null;
    var a = H.toDayNumber(from);
    var b = H.toDayNumber(to);
    if (b < a) { var t = a; a = b; b = t; }
    if (b - a + 1 > LIMITS.maxSpanDays) b = a + LIMITS.maxSpanDays - 1;
    return { from: H.fromDayNumber(a), to: H.fromDayNumber(b) };
  }

  // 日付範囲の配列 → 通日の集合
  function spansToDaySet(spans) {
    var set = Object.create(null);
    if (!Array.isArray(spans)) return set;
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      if (!span || !H.isValidIso(span.from) || !H.isValidIso(span.to)) continue;
      var a = H.toDayNumber(span.from);
      var b = H.toDayNumber(span.to);
      if (b < a) { var t = a; a = b; b = t; }
      if (b - a > LIMITS.maxSpanDays) b = a + LIMITS.maxSpanDays;
      for (var n = a; n <= b; n++) set[n] = span.label || '';
    }
    return set;
  }

  // 会社休業（年末年始・お盆）を、対象期間にかかる年の分だけ日付範囲へ展開する
  function expandCompanyOff(enabledIds, fromYear, toYear) {
    var spans = [];
    if (!Array.isArray(enabledIds) || enabledIds.length === 0) return spans;
    for (var i = 0; i < DEFAULT_COMPANY_OFF.length; i++) {
      var preset = DEFAULT_COMPANY_OFF[i];
      if (enabledIds.indexOf(preset.id) < 0) continue;
      for (var y = fromYear - 1; y <= toYear + 1; y++) {
        for (var j = 0; j < preset.spans.length; j++) {
          var s = preset.spans[j];
          var last = Math.min(s.to, H.daysInMonth(y, s.month));
          spans.push({
            from: H.iso(y, s.month, s.from),
            to: H.iso(y, s.month, last),
            label: preset.label
          });
        }
      }
    }
    return spans;
  }

  /* ============================================================
     タイムラインの構築
     ------------------------------------------------------------
     対象期間の前後に余白（既定14日）を持たせる。余白が無いと、
     期間の端にかかる連休（年末年始など）の長さを数え間違える。
     ============================================================ */

  function buildTimeline(options) {
    var opts = options || {};
    var range = normalizeRange(opts.from, opts.to);
    if (!range) return { days: [], index: Object.create(null), from: null, to: null, scopeStart: 0, scopeEnd: -1 };

    var weeklyOff = Array.isArray(opts.weeklyOff) ? opts.weeklyOff : [0, 6];
    var weekly = Object.create(null);
    for (var w = 0; w < weeklyOff.length; w++) {
      var dow = toDow(weeklyOff[w]);
      if (dow >= 0) weekly[dow] = true;
    }

    var fromYear = H.parseIso(range.from).year;
    var toYear = H.parseIso(range.to).year;
    var holidays = opts.holidays || H.holidayMap(fromYear - 1, toYear + 1);

    var companySpans = (Array.isArray(opts.companyOff) ? opts.companyOff : [])
      .concat(expandCompanyOff(opts.companyOffPresets, fromYear, toYear));
    var company = spansToDaySet(companySpans);
    var blackout = spansToDaySet(
      Array.isArray(opts.blackout) ? opts.blackout.slice(0, LIMITS.maxBlackouts) : []
    );

    var pad = clampInt(opts.pad, 0, 60, LIMITS.padDays);
    var scopeFrom = H.toDayNumber(range.from);
    var scopeTo = H.toDayNumber(range.to);
    var days = [];
    var index = Object.create(null);

    for (var n = scopeFrom - pad; n <= scopeTo + pad; n++) {
      var date = H.fromDayNumber(n);
      var dw = H.dayOfWeek(date);
      var holiday = holidays[date];
      var offKind = null;
      var offLabel = '';

      // 判定順: 祝日系 → 会社休業 → 週休
      if (holiday) {
        offKind = HOLIDAY_KIND_TO_OFF_KIND[holiday.kind] || 'holiday';
        offLabel = holiday.name;
      } else if (company[n] !== undefined) {
        offKind = 'company';
        offLabel = company[n] || OFF_KIND_LABELS.company;
      } else if (weekly[dw]) {
        offKind = 'weekly';
        offLabel = OFF_KIND_LABELS.weekly;
      }

      var inScope = n >= scopeFrom && n <= scopeTo;
      var off = offKind !== null;
      index[date] = days.length;
      days.push({
        date: date,
        dow: dw,
        off: off,
        offKind: offKind,
        offLabel: offLabel,
        inScope: inScope,
        blackoutLabel: blackout[n] !== undefined ? (blackout[n] || '取得できない期間') : '',
        takeable: !off && inScope && blackout[n] === undefined
      });
    }

    return {
      days: days,
      index: index,
      from: range.from,
      to: range.to,
      scopeStart: pad,
      scopeEnd: days.length - 1 - pad
    };
  }

  /* ============================================================
     連休プランの探索
     ------------------------------------------------------------
     不変条件: 連休の区間 [a, b] が決まれば、その中の平日すべてを
     有給にする以外に選択肢はない（1日でも残せば区間が途切れる）。
     したがって「区間 → 有給の集合と枚数」は一意で、プランは区間で
     一意に識別できる。
     ============================================================ */

  function buildSegments(days, a, b, takenSet) {
    var segments = [];
    for (var i = a; i <= b; i++) {
      var day = days[i];
      var kind = takenSet[day.date] ? 'paid' : day.offKind;
      var label = takenSet[day.date] ? OFF_KIND_LABELS.paid : day.offLabel;
      var last = segments[segments.length - 1];
      if (last && last.kind === kind && last.label === label) {
        last.to = day.date;
        last.count++;
      } else {
        segments.push({ kind: kind, label: label, from: day.date, to: day.date, count: 1 });
      }
    }
    return segments;
  }

  function makePlan(days, a, b, take) {
    var takenSet = Object.create(null);
    for (var i = 0; i < take.length; i++) takenSet[take[i]] = true;
    var length = b - a + 1;
    return {
      id: days[a].date + '_' + days[b].date,
      start: days[a].date,
      end: days[b].date,
      startIdx: a,
      endIdx: b,
      length: length,
      take: take,
      cost: take.length,
      efficiency: take.length > 0 ? length / take.length : Infinity,
      segments: buildSegments(days, a, b, takenSet)
    };
  }

  function findPlans(timeline, options) {
    var opts = options || {};
    var maxTake = clampInt(opts.maxTake, 1, LIMITS.maxTakePerPlan, 5);
    var minLength = clampInt(opts.minLength, 2, 60, 3);
    var minEfficiency = Number(opts.minEfficiency);
    if (!Number.isFinite(minEfficiency)) minEfficiency = 0;

    var days = timeline.days;
    var n = days.length;
    var plans = [];
    var seen = Object.create(null);

    for (var s = 0; s < n; s++) {
      if (!days[s].takeable) continue;
      var take = [];
      for (var e = s; e < n; e++) {
        var day = days[e];
        if (day.off) continue;              // 休みは橋渡しされるだけ
        if (!day.takeable) break;           // 取得できない平日に当たったら打ち切り
        take.push(day.date);
        if (take.length > maxTake) break;

        // e を最後の有給とするプラン。両側へ休みが続く限り区間を伸ばす
        var a = s;
        while (a - 1 >= 0 && days[a - 1].off) a--;
        var b = e;
        while (b + 1 < n && days[b + 1].off) b++;

        var key = a + '_' + b;
        if (seen[key]) continue;
        var length = b - a + 1;
        if (length < minLength) continue;
        if (length / take.length < minEfficiency) continue;
        seen[key] = true;
        plans.push(makePlan(days, a, b, take.slice()));
      }
    }

    return plans;
  }

  // 有給ゼロで成立する連休（週休・祝日だけで minLength 日以上）
  function findNaturalRuns(timeline, minLengthOption) {
    var minLength = clampInt(minLengthOption, 2, 60, 3);
    var days = timeline.days;
    var runs = [];
    var i = 0;
    while (i < days.length) {
      if (!days[i].off) { i++; continue; }
      var a = i;
      while (i < days.length && days[i].off) i++;
      var b = i - 1;
      if (b - a + 1 < minLength) continue;
      // 区間の一部でも対象期間に入っていれば採用する
      var touches = false;
      for (var j = a; j <= b; j++) { if (days[j].inScope) { touches = true; break; } }
      if (!touches) continue;
      runs.push(makePlan(days, a, b, []));
    }
    return runs;
  }

  /* ============================================================
     並び替え
     ============================================================ */

  function comparePlans(mode) {
    if (mode === 'length') {
      return function (x, y) {
        return (y.length - x.length) || (x.cost - y.cost) || (x.startIdx - y.startIdx);
      };
    }
    if (mode === 'date') {
      return function (x, y) {
        return (x.startIdx - y.startIdx) || (y.length - x.length) || (x.cost - y.cost);
      };
    }
    // 既定: 効率（有給1日あたりの休日数）
    return function (x, y) {
      return (y.efficiency - x.efficiency) || (y.length - x.length) || (x.startIdx - y.startIdx);
    };
  }

  function rankPlans(plans, mode) {
    return plans.slice().sort(comparePlans(mode));
  }

  /* ============================================================
     年間編成（重み付き区間スケジューリング＋ナップサック）
     ------------------------------------------------------------
     dp[i][k] = 先頭 i 件まで・有給 k 日以内で得られる休日合計の最大値
     prev(i) は「区間が隣接しない」最後の件数。区間が隣り合うと実際
     には1つの連休に融合し長さを二重に数えてしまうため、間に最低1日
     の平日を要求する。融合後の区間自体が候補に含まれているので、
     隣接を禁じても最適解は失われない。
     ============================================================ */

  function composeYear(plans, budgetOption) {
    var budget = clampInt(budgetOption, 0, LIMITS.maxBudget, 5);
    var truncated = false;
    var pool = plans.filter(function (p) { return p.cost > 0 && p.cost <= budget; });
    if (pool.length > LIMITS.maxDpPlans) {
      pool = rankPlans(pool, 'efficiency').slice(0, LIMITS.maxDpPlans);
      truncated = true;
    }
    var sorted = pool.slice().sort(function (x, y) {
      return (x.endIdx - y.endIdx) || (x.startIdx - y.startIdx);
    });

    var P = sorted.length;
    var B = budget;
    if (P === 0 || B === 0) return { picked: [], totalLength: 0, totalCost: 0, truncated: truncated };

    var ends = new Int32Array(P);
    for (var i = 0; i < P; i++) ends[i] = sorted[i].endIdx;

    // prevCount[i] = 区間終端が sorted[i].startIdx - 2 以下である件数
    var prevCount = new Int32Array(P);
    for (i = 0; i < P; i++) {
      var limit = sorted[i].startIdx - 2;
      var lo = 0;
      var hi = P;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (ends[mid] <= limit) lo = mid + 1; else hi = mid;
      }
      prevCount[i] = lo;
    }

    var width = B + 1;
    var dp = new Int32Array((P + 1) * width);
    var pick = new Uint8Array((P + 1) * width);

    for (i = 1; i <= P; i++) {
      var plan = sorted[i - 1];
      var base = i * width;
      var prevRow = (i - 1) * width;
      var fromRow = prevCount[i - 1] * width;
      for (var k = 0; k <= B; k++) {
        var best = dp[prevRow + k];
        var taken = 0;
        if (plan.cost <= k) {
          var candidate = dp[fromRow + (k - plan.cost)] + plan.length;
          if (candidate > best) { best = candidate; taken = 1; }
        }
        dp[base + k] = best;
        pick[base + k] = taken;
      }
    }

    var picked = [];
    var row = P;
    var budgetLeft = B;
    while (row > 0) {
      if (pick[row * width + budgetLeft]) {
        var chosen = sorted[row - 1];
        picked.push(chosen);
        budgetLeft -= chosen.cost;
        row = prevCount[row - 1];
      } else {
        row--;
      }
    }
    picked.reverse();

    var totalCost = 0;
    var totalLength = 0;
    for (i = 0; i < picked.length; i++) {
      totalCost += picked[i].cost;
      totalLength += picked[i].length;
    }
    return { picked: picked, totalLength: totalLength, totalCost: totalCost, truncated: truncated };
  }

  /* ------------------------------------------------------------
     表示用の代表選び
     ------------------------------------------------------------
     「プラン＝区間」は探索・保存のための一意性で、利用者にとっての
     「連休は1回」とは単位が違う。重なるプランは同じ連休の取り方違い
     なので、順位の高いものから重ならないものだけを採って一覧に出す。
     内部の一意性（findPlans の戻り値）は変えない。
     ------------------------------------------------------------ */

  function pickDistinct(rankedPlans, limit) {
    var max = clampInt(limit, 1, 1000, 40);
    var picked = [];
    for (var i = 0; i < rankedPlans.length && picked.length < max; i++) {
      var plan = rankedPlans[i];
      var clashes = false;
      for (var j = 0; j < picked.length; j++) {
        if (overlaps(picked[j], plan)) { clashes = true; break; }
      }
      if (!clashes) picked.push(plan);
    }
    return picked;
  }

  /* ------------------------------------------------------------
     区間からプランを復元する
     ------------------------------------------------------------
     不変条件（区間 → 有給の集合は一意）により、保存しておいた区間の
     両端から元のプランを再構成できる。設定（週休・繁忙期・会社休業）
     が変わって成立しなくなった区間は null を返す。
     ------------------------------------------------------------ */

  function planFromRange(timeline, start, end) {
    var days = timeline.days;
    var a = timeline.index[start];
    var b = timeline.index[end];
    if (a === undefined || b === undefined || b < a) return null;

    // 区間が「ちょうど」であること: 外側に休みが続いていたら区間が足りていない
    if (a - 1 >= 0 && days[a - 1].off) return null;
    if (b + 1 < days.length && days[b + 1].off) return null;

    var take = [];
    for (var i = a; i <= b; i++) {
      var day = days[i];
      if (day.off) continue;
      if (!day.takeable) return null;   // 休めない平日が混ざった区間は成立しない
      take.push(day.date);
    }
    return makePlan(days, a, b, take);
  }

  // 選んだプランが重なっていないか（手動追加の検証に使う）
  function overlaps(planA, planB) {
    return planA.startIdx <= planB.endIdx + 1 && planB.startIdx <= planA.endIdx + 1;
  }

  /* ============================================================
     書式
     ============================================================ */

  function formatDate(date, withYear) {
    var p = H.parseIso(date);
    if (!p) return '';
    var body = p.month + '月' + p.day + '日（' + H.dowLabel(H.dayOfWeek(date)) + '）';
    return withYear ? p.year + '年' + body : body;
  }

  function formatShort(date, withYear) {
    var p = H.parseIso(date);
    if (!p) return '';
    var body = p.month + '/' + p.day + '(' + H.dowLabel(H.dayOfWeek(date)) + ')';
    return withYear ? p.year + '/' + body : body;
  }

  // 年をまたぐ連休（年末年始）は年を省くと別の年の候補と区別できないため、
  // 両端の年が違うときだけ年を添える
  function formatRange(plan) {
    var startYear = H.parseIso(plan.start).year;
    var endYear = H.parseIso(plan.end).year;
    var withYear = startYear !== endYear;
    return formatShort(plan.start, withYear) + '〜' + formatShort(plan.end, withYear);
  }

  // 「有給1日で4連休」のように、数値を日本語で言い直す
  function describeEfficiency(plan) {
    if (plan.cost === 0) return '有給なしで' + plan.length + '連休';
    return '有給' + plan.cost + '日で' + plan.length + '連休';
  }

  function efficiencyText(plan) {
    if (plan.cost === 0) return '—';
    return (Math.round(plan.efficiency * 10) / 10).toFixed(1) + '日';
  }

  // 申請用のテキスト。貼り付け先を選ばないよう、記号を使わない素のテキストにする
  function buildRequestText(plans, options) {
    var opts = options || {};
    var sorted = plans.slice().sort(function (x, y) { return x.startIdx - y.startIdx; });
    var lines = [];
    lines.push('有給休暇の取得予定' + (opts.title ? '（' + opts.title + '）' : ''));
    lines.push('');
    var totalCost = 0;
    for (var i = 0; i < sorted.length; i++) {
      var plan = sorted[i];
      totalCost += plan.cost;
      lines.push('■ ' + formatDate(plan.start, true) + ' 〜 ' + formatDate(plan.end, true)
        + '（' + plan.length + '連休 / 有給' + plan.cost + '日）');
      for (var j = 0; j < plan.take.length; j++) {
        lines.push('  ・' + formatDate(plan.take[j], true) + ' 有給取得希望');
      }
      lines.push('');
    }
    lines.push('使用する有給: 合計 ' + totalCost + '日');
    if (opts.note) lines.push(opts.note);
    return lines.join('\n');
  }

  /* ============================================================
     保存データの検証
     ------------------------------------------------------------
     読み込んだ JSON を信用しない。既知のキーのみ採用し、型・範囲・
     件数上限で検証して、不正値は既定値に落とす。
     ============================================================ */

  var SORT_MODES = ['efficiency', 'length', 'date'];
  var THEMES = ['light', 'dark', 'system'];
  var COMPANY_PRESET_IDS = DEFAULT_COMPANY_OFF.map(function (p) { return p.id; });

  function defaultState(today) {
    var base = H.isValidIso(today) ? today : '2026-01-01';
    var year = H.parseIso(base).year;
    if (!H.isSupportedYear(year)) year = H.MIN_YEAR;
    return {
      year: year,
      from: base,
      to: H.iso(year, 12, 31),
      weeklyOff: [0, 6],
      companyOffPresets: ['newyear'],
      blackout: [],
      maxTake: 3,
      budget: 5,
      minLength: 3,
      sort: 'efficiency',
      showAll: false,
      theme: 'system',
      remember: false,
      picked: []
    };
  }

  function sanitizeSpanList(raw, limit) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length && out.length < limit; i++) {
      var item = raw[i];
      if (!item || typeof item !== 'object') continue;
      if (!H.isValidIso(item.from) || !H.isValidIso(item.to)) continue;
      var from = item.from;
      var to = item.to;
      if (H.toDayNumber(to) < H.toDayNumber(from)) { var t = from; from = to; to = t; }
      var label = typeof item.label === 'string' ? item.label.slice(0, 40) : '';
      out.push({ from: from, to: to, label: label });
    }
    return out;
  }

  function sanitizeState(raw, today) {
    var base = defaultState(today);
    if (!raw || typeof raw !== 'object') return base;

    var year = clampInt(raw.year, H.MIN_YEAR, H.MAX_YEAR, base.year);
    var out = {
      year: year,
      from: H.isValidIso(raw.from) ? raw.from : base.from,
      to: H.isValidIso(raw.to) ? raw.to : base.to,
      weeklyOff: [],
      companyOffPresets: [],
      blackout: sanitizeSpanList(raw.blackout, LIMITS.maxBlackouts),
      maxTake: clampInt(raw.maxTake, 1, LIMITS.maxTakePerPlan, base.maxTake),
      budget: clampInt(raw.budget, 0, LIMITS.maxBudget, base.budget),
      minLength: clampInt(raw.minLength, 2, 60, base.minLength),
      sort: SORT_MODES.indexOf(raw.sort) >= 0 ? raw.sort : base.sort,
      showAll: raw.showAll === true,
      theme: THEMES.indexOf(raw.theme) >= 0 ? raw.theme : base.theme,
      remember: raw.remember === true,
      picked: []
    };

    if (H.toDayNumber(out.to) < H.toDayNumber(out.from)) {
      var swap = out.from; out.from = out.to; out.to = swap;
    }

    if (Array.isArray(raw.weeklyOff)) {
      for (var i = 0; i < raw.weeklyOff.length; i++) {
        var dow = toDow(raw.weeklyOff[i]);
        if (dow >= 0 && out.weeklyOff.indexOf(dow) < 0) out.weeklyOff.push(dow);
      }
      out.weeklyOff.sort(function (x, y) { return x - y; });
    } else {
      out.weeklyOff = base.weeklyOff.slice();
    }

    if (Array.isArray(raw.companyOffPresets)) {
      for (var j = 0; j < raw.companyOffPresets.length; j++) {
        var id = raw.companyOffPresets[j];
        if (COMPANY_PRESET_IDS.indexOf(id) >= 0 && out.companyOffPresets.indexOf(id) < 0) {
          out.companyOffPresets.push(id);
        }
      }
    } else {
      out.companyOffPresets = base.companyOffPresets.slice();
    }

    // 選択済みプランは「区間の両端」だけを保存する（不変条件により区間から復元できる）
    if (Array.isArray(raw.picked)) {
      for (var k = 0; k < raw.picked.length && out.picked.length < LIMITS.maxPickedPlans; k++) {
        var p = raw.picked[k];
        if (!p || typeof p !== 'object') continue;
        if (!H.isValidIso(p.start) || !H.isValidIso(p.end)) continue;
        if (H.toDayNumber(p.end) < H.toDayNumber(p.start)) continue;
        out.picked.push({ start: p.start, end: p.end });
      }
    }

    return out;
  }

  return {
    LIMITS: LIMITS,
    OFF_KIND_LABELS: OFF_KIND_LABELS,
    DEFAULT_COMPANY_OFF: DEFAULT_COMPANY_OFF,
    SORT_MODES: SORT_MODES,
    toDow: toDow,
    normalizeRange: normalizeRange,
    expandCompanyOff: expandCompanyOff,
    buildTimeline: buildTimeline,
    buildSegments: buildSegments,
    findPlans: findPlans,
    findNaturalRuns: findNaturalRuns,
    planFromRange: planFromRange,
    pickDistinct: pickDistinct,
    rankPlans: rankPlans,
    composeYear: composeYear,
    overlaps: overlaps,
    formatDate: formatDate,
    formatShort: formatShort,
    formatRange: formatRange,
    describeEfficiency: describeEfficiency,
    efficiencyText: efficiencyText,
    buildRequestText: buildRequestText,
    defaultState: defaultState,
    sanitizeState: sanitizeState,
    holidays: H
  };
});
