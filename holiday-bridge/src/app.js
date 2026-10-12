/* ============================================================
   やすみつなぎ — UI 制御
   ------------------------------------------------------------
   計算は planner.js / holidays.js に任せ、ここでは
   DOM・localStorage・クリップボードだけを扱う。

   DOM への文字列の差し込みは textContent と createElement のみ。
   innerHTML は使わない（XSS 対策）。
   ============================================================ */
(function () {
  'use strict';

  const H = window.YasumiHolidays;
  const P = window.YasumiPlanner;

  const { SUPPORTED_YEARS, addDays, fromISO, toISO } = H;
  const {
    MAX_LEAVE_BUDGET,
    MAX_LEAVE_PER_BRIDGE_LIMIT,
    OBJECTIVE,
    REASON,
    buildCalendar,
    buildPlan,
    clampInt,
    defaultSettings,
    dowJa,
    findBridges,
    formatDateJa,
    formatDateJaWithYear,
    formatPlanText,
    formatRangeJa,
    parseCompanyOff,
    rankBridges,
    reasonLabel,
    assignLeaveToLots,
    expiryFromGrant,
    formatPlanICS,
    normalizeLots,
    totalLotDays,
  } = P;



  const STORAGE_KEY = 'holiday-bridge:v1';
  const THEME_KEY = 'holiday-bridge:theme';
  const DOW_FULL = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

  /* ------------------------------------------------------------
     状態
     ------------------------------------------------------------ */

  const state = {
    ...defaultSettings(),
    periodMode: 'rolling', // 'rolling' | 'year'
    year: new Date().getFullYear(),
    companyOffText: '',
    noLeaveText: '',
    lotsEnabled: false,
    lots: [
      { label: '繰越分', days: 0, expiry: '' },
      { label: '今年度分', days: 0, expiry: '' },
    ],
    tab: 'plan',
  };

  /** 直近の計算結果。 */
  let computed = {
    startISO: '',
    endISO: '',
    days: [],
    plan: { bridges: [], totalDays: 0, leaveUsed: 0 },
    ranked: { paid: [], free: [] },
    leaveSet: new Set(),
    assignment: null,
    periodLabel: '',
  };

  /* ------------------------------------------------------------
     要素の取得
     ------------------------------------------------------------ */

  const el = {};
  function cacheElements() {
    const ids = [
      'theme-toggle', 'year-field', 'year-input', 'leave-input', 'per-bridge-input',
      'workdays-row', 'company-off-input', 'company-off-error', 'company-off-notice',
      'settings-status', 'workdays-notice', 'reset-button', 'forget-button',
      'summary-grid', 'summary-period', 'expiry-notice', 'lot-breakdown',
      'plan-list', 'rank-list', 'free-list', 'calendar', 'ics-button',
      'no-leave-input', 'no-leave-error', 'lots-enabled', 'lots-rows',
      'grant-date', 'fill-expiry', 'period-expiry', 'period-expiry-help', 'advanced',
      'lot-0-days', 'lot-0-expiry', 'lot-1-days', 'lot-1-expiry',
      'lot-0-echo', 'lot-1-echo', 'grant-echo',
      'copy-button', 'copy-status', 'copy-fallback', 'copy-fallback-text',
      'tab-plan', 'tab-rank', 'tab-calendar', 'panel-plan', 'panel-rank', 'panel-calendar',
    ];
    for (const id of ids) {
      el[id] = document.getElementById(id);
    }
  }

  /* ------------------------------------------------------------
     保存・復元
     ------------------------------------------------------------ */

  /** localStorage は設定の保存だけに使う。失敗しても動作を止めない。 */
  function save() {
    try {
      const payload = {
        workdays: state.workdays,
        leaveDays: state.leaveDays,
        maxLeavePerBridge: state.maxLeavePerBridge,
        objective: state.objective,
        periodMode: state.periodMode,
        year: state.year,
        companyOffText: state.companyOffText,
        noLeaveText: state.noLeaveText,
        lotsEnabled: state.lotsEnabled,
        lots: state.lots,
        tab: state.tab,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* プライベートブラウジングなどで保存できない場合は無視する */
    }
  }

  function load() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // 壊れた保存値は捨てる
    }
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data.workdays) && data.workdays.length === 7) {
      state.workdays = data.workdays.map((v) => v === true);
    }
    state.leaveDays = clampInt(data.leaveDays, 0, MAX_LEAVE_BUDGET, state.leaveDays);
    state.maxLeavePerBridge = clampInt(
      data.maxLeavePerBridge, 0, MAX_LEAVE_PER_BRIDGE_LIMIT, state.maxLeavePerBridge
    );
    if (data.objective === OBJECTIVE.COUNT || data.objective === OBJECTIVE.LONG) {
      state.objective = data.objective;
    }
    if (['year', 'rolling', 'expiry'].includes(data.periodMode)) state.periodMode = data.periodMode;
    state.year = clampInt(data.year, SUPPORTED_YEARS.min, SUPPORTED_YEARS.max, state.year);
    if (typeof data.companyOffText === 'string') state.companyOffText = data.companyOffText.slice(0, 2000);
    if (typeof data.noLeaveText === 'string') state.noLeaveText = data.noLeaveText.slice(0, 2000);
    state.lotsEnabled = data.lotsEnabled === true;
    if (Array.isArray(data.lots)) {
      state.lots = state.lots.map((lot, i) => {
        const saved = data.lots[i];
        if (!saved || typeof saved !== 'object') return lot;
        return {
          label: lot.label,
          days: clampInt(saved.days, 0, MAX_LEAVE_BUDGET, 0),
          expiry: typeof saved.expiry === 'string' && fromISO(saved.expiry) ? saved.expiry : '',
        };
      });
    }
    if (['plan', 'rank', 'calendar'].includes(data.tab)) state.tab = data.tab;
  }

  function forget() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(THEME_KEY);
    } catch {
      /* 消せない環境では何もしない */
    }
  }

  /* ------------------------------------------------------------
     テーマ
     ------------------------------------------------------------ */

  const THEME_ORDER = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: 'テーマ: OS設定', light: 'テーマ: ライト', dark: 'テーマ: ダーク' };
  let theme = 'auto';

  function applyTheme() {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    el['theme-toggle'].textContent = THEME_LABEL[theme];
  }

  function initTheme() {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      if (THEME_ORDER.includes(saved)) theme = saved;
    } catch {
      /* 読めない場合は OS 設定に従う */
    }
    applyTheme();
  }

  function cycleTheme() {
    theme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    applyTheme();
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 無視 */
    }
  }

  /* ------------------------------------------------------------
     期間の決定
     ------------------------------------------------------------ */

  /** 'YYYY-MM-DD' を years 年ずらす。 */
  function shiftYears(iso, years) {
    const date = fromISO(iso);
    if (!date) return null;
    return toISO(new Date(Date.UTC(
      date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()
    )));
  }

  /** 有効な付与ロット（日数が 0 のものは持たない）。 */
  function activeLots() {
    if (!state.lotsEnabled) return [];
    return normalizeLots(
      state.lots.map((lot) => ({
        label: lot.label,
        days: lot.days,
        expiry: lot.expiry || null,
      }))
    );
  }

  /** 実際に使う有給の予算。内訳を指定していればその合計、していなければ単純な日数。 */
  function leaveBudget() {
    return state.lotsEnabled ? totalLotDays(activeLots()) : state.leaveDays;
  }

  /** いちばん早い失効日。内訳を指定していないか、失効日が未入力なら null。 */
  function earliestExpiryISO() {
    let earliest = null;
    for (const lot of activeLots()) {
      if (!lot.expiry) continue;
      if (earliest === null || lot.expiry < earliest) earliest = lot.expiry;
    }
    return earliest;
  }

  /** 今日の日付を 'YYYY-MM-DD'（ローカル日付）で返す。 */
  function todayISO() {
    const now = new Date();
    return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }

  /** state から対象期間を決める。対応範囲外なら理由つきで返す。 */
  function resolvePeriod() {
    if (state.periodMode === 'expiry') {
      const expiry = earliestExpiryISO();
      const start = todayISO();
      if (!expiry) {
        return {
          error: '「失効日まで」を使うには、下の「詳しく設定する」で有給の内訳と失効日を入れてください。',
        };
      }
      if (expiry < start) {
        return { error: `いちばん早い失効日（${formatDateJaWithYear(expiry)}）が今日より前です。失効日を見直してください。` };
      }
      const startYear = fromISO(start).getUTCFullYear();
      const endYear = fromISO(expiry).getUTCFullYear();
      if (startYear < SUPPORTED_YEARS.min || endYear > SUPPORTED_YEARS.max) {
        return { error: `対応している年は ${SUPPORTED_YEARS.min}〜${SUPPORTED_YEARS.max} 年です。` };
      }
      return {
        startISO: start,
        endISO: expiry,
        label: `${formatDateJaWithYear(start)}〜${formatDateJaWithYear(expiry)}（失効日まで）`,
        baseYear: startYear,
      };
    }

    if (state.periodMode === 'year') {
      const year = state.year;
      if (year < SUPPORTED_YEARS.min || year > SUPPORTED_YEARS.max) {
        return {
          error: `${SUPPORTED_YEARS.min}〜${SUPPORTED_YEARS.max} 年の範囲で指定してください。`,
        };
      }
      return {
        startISO: `${year}-01-01`,
        endISO: `${year}-12-31`,
        label: `${year}年1月1日〜${year}年12月31日`,
        baseYear: year,
      };
    }

    // 今日から 12 か月（翌年の同月同日の前日まで）
    const start = todayISO();
    const startDate = fromISO(start);
    const endExclusive = new Date(
      Date.UTC(startDate.getUTCFullYear() + 1, startDate.getUTCMonth(), startDate.getUTCDate())
    );
    const endISO = addDays(toISO(endExclusive), -1);

    if (startDate.getUTCFullYear() < SUPPORTED_YEARS.min || fromISO(endISO).getUTCFullYear() > SUPPORTED_YEARS.max) {
      return { error: `対応している年は ${SUPPORTED_YEARS.min}〜${SUPPORTED_YEARS.max} 年です。` };
    }
    return {
      startISO: start,
      endISO,
      label: `${formatDateJaWithYear(start)}〜${formatDateJaWithYear(endISO)}`,
      baseYear: startDate.getUTCFullYear(),
    };
  }

  /* ------------------------------------------------------------
     再計算
     ------------------------------------------------------------ */

  function recalc() {
    const period = resolvePeriod();
    if (period.error) {
      computed = {
        startISO: '', endISO: '', days: [],
        plan: { bridges: [], totalDays: 0, leaveUsed: 0 },
        ranked: { paid: [], free: [] },
        leaveSet: new Set(), assignment: null, periodLabel: '', error: period.error,
      };
      return;
    }

    currentPeriodLabel = period.label;

    // 年の指定がない休業日は、対象期間の開始日より前にならないよう翌年として解釈する
    const parsed = parseCompanyOff(state.companyOffText, period.baseYear, {
      notBefore: period.startISO,
    });
    showCompanyOffErrors(parsed.errors);

    // 期間外の休業日は計算に入らないため、黙って捨てずに知らせる
    const outside = parsed.dates.filter((d) => d < period.startISO || d > period.endISO);
    showCompanyOffNotice(outside);

    // 繁忙期（有給を取れない期間）
    const parsedNoLeave = parseCompanyOff(state.noLeaveText, period.baseYear, {
      notBefore: period.startISO,
    });
    showNoLeaveErrors(parsedNoLeave.errors);

    const days = buildCalendar(period.startISO, period.endISO, {
      workdays: state.workdays,
      companyOff: parsed.dates,
      noLeave: parsedNoLeave.dates,
    });
    const bridges = findBridges(days, state.maxLeavePerBridge);
    const plan = buildPlan(days, bridges, leaveBudget(), { objective: state.objective });
    const ranked = rankBridges(bridges);

    const leaveSet = new Set();
    for (const b of plan.bridges) for (const d of b.leaveDates) leaveSet.add(d);

    // 付与ロットへの割り当て（失効しそうな日数を出すため）
    const lots = activeLots();
    const assignment = lots.length > 0
      ? assignLeaveToLots([...leaveSet], lots, period.endISO)
      : null;

    computed = {
      startISO: period.startISO,
      endISO: period.endISO,
      days,
      plan,
      ranked,
      leaveSet,
      assignment,
      periodLabel: period.label,
      error: null,
    };
  }

  /** 対象期間の外にある休業日を、件数と先頭の日付で知らせる。 */
  function showCompanyOffNotice(outsideDates) {
    const box = el['company-off-notice'];
    if (!outsideDates || outsideDates.length === 0) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    const head = outsideDates.slice(0, 3).map(formatDateJa).join('・');
    const rest = outsideDates.length > 3 ? ` ほか${outsideDates.length - 3}日` : '';
    box.hidden = false;
    box.textContent =
      `${head}${rest} は対象期間（${computedPeriodLabelFallback()}）の外にあるため、計算には含めていません。`;
  }

  /** 警告文に使う期間の表示。recalc の途中でも呼べるようにしてある。 */
  let currentPeriodLabel = '';
  function computedPeriodLabelFallback() {
    return currentPeriodLabel || '対象期間';
  }

  /** 繁忙期の入力エラーを表示する。 */
  function showNoLeaveErrors(errors) {
    const box = el['no-leave-error'];
    if (!errors || errors.length === 0) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = errors.join(' / ');
  }

  function showCompanyOffErrors(errors) {
    const box = el['company-off-error'];
    if (!errors || errors.length === 0) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = errors.join(' / ');
  }

  /* ------------------------------------------------------------
     描画
     ------------------------------------------------------------ */

  /** タグ要素をつくる。 */
  function tag(text, className) {
    const span = document.createElement('span');
    span.className = `tag ${className}`;
    span.textContent = text;
    return span;
  }

  function renderSummary() {
    const grid = el['summary-grid'];
    grid.replaceChildren();
    el['summary-period'].textContent = '';

    if (computed.error) {
      const p = document.createElement('p');
      p.className = 'error';
      p.textContent = computed.error;
      grid.append(p);
      return;
    }

    const plan = computed.plan;
    const longest = plan.bridges.reduce((max, b) => Math.max(max, b.totalDays), 0);
    const stats = [
      ['使う有給', plan.leaveUsed, '日'],
      ['連休の合計', plan.totalDays, '日'],
      ['連休の数', plan.bridges.length, '件'],
      ['最長の連休', longest, '日'],
    ];
    for (const [label, value, unit] of stats) {
      const box = document.createElement('div');
      box.className = 'stat';
      const l = document.createElement('span');
      l.className = 'stat-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'stat-value';
      v.textContent = String(value);
      const u = document.createElement('span');
      u.className = 'u';
      u.textContent = unit;
      v.append(u);
      box.append(l, v);
      grid.append(box);
    }

    const objectiveLabel =
      state.objective === OBJECTIVE.COUNT ? '休みの回数を優先' : '長い連休を優先';
    el['summary-period'].textContent =
      `対象期間: ${computed.periodLabel}／優先: ${objectiveLabel}／有給の持ち数: ${leaveBudget()}日`;
  }

  /** 対象期間が年をまたぐか（またぐなら日付に年を付ける）。 */
  function periodSpansYears() {
    return Boolean(computed.startISO) && computed.startISO.slice(0, 4) !== computed.endISO.slice(0, 4);
  }

  /** 失効しそうな有給の警告と、ロットごとの消化内訳を描く。 */
  function renderExpiry() {
    const notice = el['expiry-notice'];
    const breakdown = el['lot-breakdown'];
    const assignment = computed.assignment;

    if (!assignment || computed.error) {
      notice.hidden = true;
      notice.textContent = '';
      breakdown.hidden = true;
      breakdown.textContent = '';
      return;
    }

    // ロットごとの消化内訳
    const parts = assignment.lots.map(
      (lot) => `${lot.label} ${lot.days}日中 ${lot.used}日を消化（残 ${lot.unused}日`
        + `${lot.expiry ? `／失効 ${formatDateJaWithYear(lot.expiry)}` : ''}）`
    );
    breakdown.hidden = parts.length === 0;
    breakdown.textContent = parts.join(' ／ ');

    const messages = [];
    if (assignment.expiringUnused > 0) {
      messages.push(
        `手持ちのうち ${assignment.expiringUnused}日 が、使われないまま失効します`
        + `（いちばん早い失効日: ${formatDateJaWithYear(assignment.earliestExpiry)}）。`
      );
    }
    if (assignment.unassigned.length > 0) {
      // 予算としては足りていても、失効日より後に置かれた有給は手持ちから出せない
      messages.push(
        `このプランは ${assignment.unassigned.length}日 ぶんを手持ちの有給でまかなえません`
        + '（失効日より後に置かれているためです）。'
      );
    }
    if (messages.length > 0) {
      messages.push(
        '対象期間を「失効日まで」に切り替えると、失効する前に使うプランになります。'
        + '繁忙期の指定や「1つの連休に使う有給の上限」の見直しも効きます。'
      );
      notice.hidden = false;
      notice.textContent = messages.join('');
    } else {
      notice.hidden = true;
      notice.textContent = '';
    }
  }

  /** 連休カードを 1 枚つくる。 */
  function bridgeCard(bridge, options) {
    const showEfficiency = !options || options.showEfficiency !== false;
    const withYear = periodSpansYears();
    const card = document.createElement('article');
    card.className = bridge.leaveCount === 0 ? 'bridge is-free' : 'bridge';

    const headline = document.createElement('div');
    headline.className = 'bridge-headline';
    const big = document.createElement('span');
    big.className = 'big';
    big.textContent = String(bridge.totalDays);
    headline.append(big, document.createTextNode('連休'));
    const leaveIn = document.createElement('span');
    leaveIn.className = 'leave-in';
    leaveIn.textContent = bridge.leaveCount === 0 ? '有給 0日' : `有給 ${bridge.leaveCount}日で`;
    headline.append(leaveIn);

    const range = document.createElement('div');
    range.className = 'bridge-range';
    range.textContent = formatRangeJa(bridge, { withYear });

    const detail = document.createElement('p');
    detail.className = 'bridge-detail';

    if (bridge.leaveCount > 0) {
      detail.append(tag(`有給 ${bridge.leaveCount}日`, 'tag-leave'));
      detail.append(
        document.createTextNode(
          bridge.leaveDates.map(withYear ? formatDateJaWithYear : formatDateJa).join('・')
        )
      );
    } else {
      detail.append(document.createTextNode('祝日と休みだけで成立します。'));
    }

    const extra = document.createElement('p');
    extra.className = 'bridge-detail';
    const labels = [...new Set(bridge.labels)];
    if (labels.length > 0) extra.append(tag(labels.join('・'), 'tag-holiday'));
    if (showEfficiency && bridge.efficiency !== null) {
      extra.append(tag(`効率 有給1日あたり${bridge.efficiency.toFixed(1)}日`, 'tag-eff'));
    }

    card.append(headline, range, detail);
    if (extra.childNodes.length > 0) card.append(extra);
    return card;
  }

  /** 空の状態を表示する。 */
  function emptyNote(text) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = text;
    return p;
  }

  function renderPlan() {
    const list = el['plan-list'];
    list.replaceChildren();

    if (computed.error) {
      list.append(emptyNote(computed.error));
      return;
    }
    if (computed.plan.bridges.length === 0) {
      list.append(
        emptyNote('条件に合う連休（3日以上）が見つかりませんでした。有給の日数や上限を増やしてみてください。')
      );
      return;
    }
    for (const bridge of computed.plan.bridges) list.append(bridgeCard(bridge));
  }

  const RANK_LIMIT = 20;
  const FREE_LIMIT = 20;

  function renderRank() {
    const paidList = el['rank-list'];
    const freeList = el['free-list'];
    paidList.replaceChildren();
    freeList.replaceChildren();

    if (computed.error) {
      paidList.append(emptyNote(computed.error));
      return;
    }

    const { paid, free } = computed.ranked;
    if (paid.length === 0) {
      paidList.append(emptyNote('有給を使って3日以上になる連休は見つかりませんでした。'));
    } else {
      for (const bridge of paid.slice(0, RANK_LIMIT)) paidList.append(bridgeCard(bridge));
      if (paid.length > RANK_LIMIT) {
        paidList.append(emptyNote(`ほかに ${paid.length - RANK_LIMIT} 件の候補があります（効率の高い上位 ${RANK_LIMIT} 件を表示しています）。`));
      }
    }

    if (free.length === 0) {
      freeList.append(emptyNote('有給を使わずに成立する3連休以上はありませんでした。'));
    } else {
      for (const bridge of free.slice(0, FREE_LIMIT)) freeList.append(bridgeCard(bridge, { showEfficiency: false }));
      if (free.length > FREE_LIMIT) {
        freeList.append(emptyNote(`ほかに ${free.length - FREE_LIMIT} 件あります。`));
      }
    }
  }

  function renderCalendar() {
    const root = el.calendar;
    root.replaceChildren();

    if (computed.error) {
      root.append(emptyNote(computed.error));
      return;
    }

    // 月ごとに日をまとめる
    /** @type {Map<string, any[]>} */
    const months = new Map();
    for (const day of computed.days) {
      const key = day.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(day);
    }

    for (const [key, days] of months) {
      const [year, month] = key.split('-').map(Number);
      const section = document.createElement('section');
      section.className = 'month';

      const title = document.createElement('h3');
      title.textContent = `${year}年${month}月`;
      section.append(title);

      const grid = document.createElement('div');
      grid.className = 'month-grid';
      for (let i = 0; i < 7; i += 1) {
        const head = document.createElement('div');
        head.className = 'dow-head';
        head.textContent = dowJa(i);
        head.setAttribute('aria-hidden', 'true');
        grid.append(head);
      }

      // 月初の曜日まで空セルを置く
      for (let i = 0; i < days[0].dow; i += 1) {
        const pad = document.createElement('div');
        pad.className = 'cell pad';
        pad.setAttribute('aria-hidden', 'true');
        grid.append(pad);
      }

      for (const day of days) {
        const isLeave = computed.leaveSet.has(day.date);
        const cell = document.createElement('div');
        const classes = ['cell'];
        if (isLeave) classes.push('is-leave');
        else if (day.reason === REASON.COMPANY) classes.push('off-company');
        else if (day.off && day.reason !== REASON.WEEKEND) classes.push('off-holiday');
        else if (day.off) classes.push('off-weekend');
        cell.className = classes.join(' ');

        const num = document.createElement('span');
        num.textContent = String(Number(day.date.slice(8, 10)));
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = isLeave
          ? '★'
          : day.reason === REASON.COMPANY
            ? '休'
            : day.off && day.reason !== REASON.WEEKEND
              ? '祝'
              : '';
        cell.append(num, mark);

        // 読み上げ用の説明。色と記号に頼らずに内容が分かるようにする
        const parts = [`${month}月${Number(day.date.slice(8, 10))}日`, DOW_FULL[day.dow]];
        if (isLeave) parts.push('有給を使う日');
        if (day.name) parts.push(day.name);
        else if (day.off) parts.push(reasonLabel(day.reason));
        else parts.push('出勤日');
        cell.setAttribute('aria-label', parts.join(' '));
        cell.setAttribute('role', 'listitem');

        grid.append(cell);
      }

      grid.setAttribute('role', 'list');
      grid.setAttribute('aria-label', `${year}年${month}月のカレンダー`);
      section.append(grid);
      root.append(section);
    }
  }

  function renderTabs() {
    const map = {
      plan: ['tab-plan', 'panel-plan'],
      rank: ['tab-rank', 'panel-rank'],
      calendar: ['tab-calendar', 'panel-calendar'],
    };
    for (const [name, [tabId, panelId]] of Object.entries(map)) {
      const selected = name === state.tab;
      el[tabId].setAttribute('aria-selected', String(selected));
      el[tabId].tabIndex = selected ? 0 : -1;
      el[panelId].hidden = !selected;
    }
  }

  function renderControls() {
    el['leave-input'].value = String(state.leaveDays);
    el['per-bridge-input'].value = String(state.maxLeavePerBridge);
    el['year-input'].value = String(state.year);
    el['company-off-input'].value = state.companyOffText;
    el['no-leave-input'].value = state.noLeaveText;
    el['year-field'].hidden = state.periodMode !== 'year';

    // 有給の内訳
    el['lots-enabled'].checked = state.lotsEnabled;
    el['lots-rows'].setAttribute('aria-disabled', String(!state.lotsEnabled));
    state.lots.forEach((lot, i) => {
      el[`lot-${i}-days`].value = String(lot.days);
      el[`lot-${i}-days`].disabled = !state.lotsEnabled;
      el[`lot-${i}-expiry`].value = lot.expiry;
      el[`lot-${i}-expiry`].disabled = !state.lotsEnabled;
      // 日付入力の表示順はブラウザの言語設定で変わる（11/30/2026 のように見える環境がある）。
      // 取り違えを防ぐため、解釈した日付を日本語で併記する。
      el[`lot-${i}-echo`].textContent = lot.expiry ? `= ${formatDateJaWithYear(lot.expiry)}` : '';
    });
    el['grant-echo'].textContent = el['grant-date'].value && fromISO(el['grant-date'].value)
      ? `= ${formatDateJaWithYear(el['grant-date'].value)}`
      : '';
    // 内訳を使うときは、単純な日数の入力を読み取り専用にして食い違いを防ぐ
    el['leave-input'].disabled = state.lotsEnabled;
    el['leave-input'].value = String(leaveBudget());

    // 「失効日まで」は失効日が分かるときだけ選べる
    const hasExpiry = earliestExpiryISO() !== null;
    el['period-expiry'].disabled = !hasExpiry;
    el['period-expiry-help'].hidden = hasExpiry;

    syncSegmented('period', state.periodMode);
    syncSegmented('objective', state.objective);
    for (const btn of el['workdays-row'].querySelectorAll('[data-dow]')) {
      const dow = Number(btn.dataset.dow);
      const working = state.workdays[dow] === true;
      btn.setAttribute('aria-pressed', String(working));
      btn.querySelector('.dow-state').textContent = working ? '出勤' : '休み';
      btn.setAttribute('aria-label', `${DOW_FULL[dow]} ${working ? '出勤' : '休み'}`);
    }
  }

  /** 勤務曜日がすべて休みのときに案内を出す（設定ミスの可能性が高い）。 */
  function renderWorkdayNotice() {
    const box = el['workdays-notice'];
    const allOff = state.workdays.every((w) => w !== true);
    if (!allOff) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent =
      'すべての曜日が「休み」になっています。対象期間の全体が 1 つの連休として計算されます。'
      + '勤務する曜日を選ぶと、有給を置く日の提案が出ます。';
  }

  function render() {
    renderControls();
    renderWorkdayNotice();
    renderSummary();
    renderExpiry();
    renderPlan();
    renderRank();
    renderCalendar();
    renderTabs();
    clearCopyStatus();
    setSettingsStatus('');
  }

  function update() {
    recalc();
    render();
    save();
  }

  /* ------------------------------------------------------------
     コピー
     ------------------------------------------------------------ */

  /** 設定パネル内の通知を出す。 */
  function setSettingsStatus(message) {
    el['settings-status'].textContent = message;
  }

  function clearCopyStatus() {
    el['copy-status'].textContent = '';
    el['copy-fallback'].hidden = true;
  }

  async function copyPlan() {
    const text = formatPlanText(computed.plan, { periodLabel: computed.periodLabel });
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      el['copy-status'].textContent = 'プランをコピーしました。';
      el['copy-fallback'].hidden = true;
    } catch {
      // 権限がない・file:// で使えないなどの場合は、手動で選択できる形で見せる
      el['copy-status'].textContent = 'このブラウザでは自動コピーができませんでした。';
      el['copy-fallback'].hidden = false;
      el['copy-fallback-text'].value = text;
      el['copy-fallback-text'].focus();
      el['copy-fallback-text'].select();
    }
  }

  /** プランを .ics ファイルとしてダウンロードさせる。 */
  function downloadICS() {
    if (computed.error || computed.plan.bridges.length === 0) {
      el['copy-status'].textContent = '書き出せる連休がありません。';
      return;
    }
    const text = formatPlanICS(computed.plan);
    let url = null;
    try {
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'yasumi-tsunagi.ics';
      document.body.append(link);
      link.click();
      link.remove();
      el['copy-status'].textContent =
        'yasumi-tsunagi.ics を書き出しました。カレンダーアプリで開くと取り込めます。';
      el['copy-fallback'].hidden = true;
    } catch {
      // Blob やダウンロードが使えない場合は、本文を見せて手動で保存してもらう
      el['copy-status'].textContent = 'このブラウザでは書き出せなかったため、内容を表示します。';
      el['copy-fallback'].hidden = false;
      el['copy-fallback-text'].value = text;
      el['copy-fallback-text'].focus();
      el['copy-fallback-text'].select();
    } finally {
      // すぐに失効させるとダウンロードが始まらない環境があるため、少し待ってから解放する
      if (url) window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }

  /* ------------------------------------------------------------
     イベント
     ------------------------------------------------------------ */

  function buildWorkdayButtons() {
    const row = el['workdays-row'];
    row.replaceChildren();
    for (let dow = 0; dow < 7; dow += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dow';
      btn.dataset.dow = String(dow);
      btn.setAttribute('aria-pressed', 'false');

      const name = document.createElement('span');
      name.className = 'dow-name';
      name.textContent = dowJa(dow);
      const stateLabel = document.createElement('span');
      stateLabel.className = 'dow-state';
      stateLabel.textContent = '';
      btn.append(name, stateLabel);

      btn.addEventListener('click', () => {
        state.workdays = state.workdays.map((v, i) => (i === dow ? !v : v));
        update();
      });
      row.append(btn);
    }
  }

  /**
   * role="radiogroup" のセグメント切り替えに、ARIA の期待どおりの操作を与える。
   * 矢印キーと Home / End で選択を移し、選択中のボタンだけを Tab の対象にする
   * （レビュー R-04）。
   *
   * @param {string} attribute 'period' または 'objective'（data 属性の名前）
   * @param {(value: string) => void} onSelect
   */
  function bindSegmentedGroup(attribute, onSelect) {
    const buttons = [...document.querySelectorAll(`[data-${attribute}]`)];
    const valueOf = (button) => button.dataset[attribute];

    const select = (index, moveFocus) => {
      const button = buttons[index];
      if (!button) return;
      onSelect(valueOf(button));
      if (moveFocus) button.focus();
    };

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(index, false));
      button.addEventListener('keydown', (event) => {
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          next = (index + 1) % buttons.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          next = (index - 1 + buttons.length) % buttons.length;
        } else if (event.key === 'Home') {
          next = 0;
        } else if (event.key === 'End') {
          next = buttons.length - 1;
        } else {
          return;
        }
        event.preventDefault();
        select(next, true);
      });
    });
  }

  /** 選択状態に合わせて aria-checked と tabindex を更新する。 */
  function syncSegmented(attribute, current) {
    for (const button of document.querySelectorAll(`[data-${attribute}]`)) {
      const selected = button.dataset[attribute] === current;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }

  const TAB_ORDER = ['plan', 'rank', 'calendar'];

  function bindEvents() {
    el['theme-toggle'].addEventListener('click', cycleTheme);

    bindSegmentedGroup('period', (value) => {
      state.periodMode = value;
      update();
    });
    bindSegmentedGroup('objective', (value) => {
      state.objective = value;
      update();
    });

    // 数値は入力中から反映する。自由記述（会社休業日）は入力途中にエラーを出さないため change のまま
    el['leave-input'].addEventListener('input', () => {
      state.leaveDays = clampInt(el['leave-input'].value, 0, MAX_LEAVE_BUDGET, state.leaveDays);
      update();
    });
    el['per-bridge-input'].addEventListener('input', () => {
      state.maxLeavePerBridge = clampInt(
        el['per-bridge-input'].value, 0, MAX_LEAVE_PER_BRIDGE_LIMIT, state.maxLeavePerBridge
      );
      update();
    });
    el['year-input'].addEventListener('input', () => {
      state.year = clampInt(el['year-input'].value, SUPPORTED_YEARS.min, SUPPORTED_YEARS.max, state.year);
      update();
    });
    el['company-off-input'].addEventListener('change', () => {
      state.companyOffText = el['company-off-input'].value.slice(0, 2000);
      update();
    });

    el['reset-button'].addEventListener('click', () => {
      Object.assign(state, defaultSettings(), {
        periodMode: 'rolling',
        year: new Date().getFullYear(),
        companyOffText: '',
        noLeaveText: '',
        lotsEnabled: false,
        lots: [
          { label: '繰越分', days: 0, expiry: '' },
          { label: '今年度分', days: 0, expiry: '' },
        ],
        tab: state.tab,
      });
      update();
      setSettingsStatus('条件を初期値に戻しました。');
    });
    el['forget-button'].addEventListener('click', () => {
      forget();
      // 削除の結果は、タブの選択に関係なく見える位置に出す（レビュー R-03）
      setSettingsStatus('この端末に保存していた設定を削除しました。');
    });

    el['copy-button'].addEventListener('click', copyPlan);
    el['ics-button'].addEventListener('click', downloadICS);

    el['no-leave-input'].addEventListener('change', () => {
      state.noLeaveText = el['no-leave-input'].value.slice(0, 2000);
      update();
    });

    el['lots-enabled'].addEventListener('change', () => {
      state.lotsEnabled = el['lots-enabled'].checked;
      // 内訳をやめたときは、合計をそのまま単純な日数として引き継ぐ
      if (!state.lotsEnabled) {
        const total = totalLotDays(
          state.lots.map((lot) => ({ label: lot.label, days: lot.days, expiry: lot.expiry || null }))
        );
        if (total > 0) state.leaveDays = total;
      }
      // 失効日が無くなったら「失効日まで」から戻す
      if (state.periodMode === 'expiry' && earliestExpiryISO() === null) state.periodMode = 'rolling';
      update();
    });

    state.lots.forEach((lot, i) => {
      el[`lot-${i}-days`].addEventListener('input', () => {
        state.lots[i].days = clampInt(el[`lot-${i}-days`].value, 0, MAX_LEAVE_BUDGET, 0);
        update();
      });
      el[`lot-${i}-expiry`].addEventListener('change', () => {
        const value = el[`lot-${i}-expiry`].value;
        state.lots[i].expiry = value && fromISO(value) ? value : '';
        if (state.periodMode === 'expiry' && earliestExpiryISO() === null) state.periodMode = 'rolling';
        update();
      });
    });

    el['grant-date'].addEventListener('change', () => {
      el['grant-echo'].textContent = el['grant-date'].value && fromISO(el['grant-date'].value)
        ? `= ${formatDateJaWithYear(el['grant-date'].value)}`
        : '';
    });

    el['fill-expiry'].addEventListener('click', () => {
      const granted = el['grant-date'].value;
      const thisYear = expiryFromGrant(granted);
      if (!thisYear) {
        setSettingsStatus('付与日を入れてから押してください。');
        return;
      }
      // 繰越分は 1 年前に付与されたものなので、失効日も 1 年前になる
      const carried = expiryFromGrant(shiftYears(granted, -1));
      state.lots[0].expiry = carried || '';
      state.lots[1].expiry = thisYear;
      state.lotsEnabled = true;
      update();
      setSettingsStatus(
        `失効日を入れました（繰越分 ${formatDateJaWithYear(carried)}／今年度分 ${formatDateJaWithYear(thisYear)}）。`
      );
    });

    TAB_ORDER.forEach((name, index) => {
      const tabEl = el[`tab-${name}`];
      tabEl.addEventListener('click', () => {
        state.tab = name;
        renderTabs();
        save();
      });
      tabEl.addEventListener('keydown', (event) => {
        const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const next = TAB_ORDER[(index + delta + TAB_ORDER.length) % TAB_ORDER.length];
        state.tab = next;
        renderTabs();
        el[`tab-${next}`].focus();
        save();
      });
    });
  }

  /* ------------------------------------------------------------
     起動
     ------------------------------------------------------------ */

  /** 入力欄の範囲を、計算側の定数から設定する（HTML との二重定義を避ける）。 */
  function applyInputBounds() {
    el['year-input'].min = String(SUPPORTED_YEARS.min);
    el['year-input'].max = String(SUPPORTED_YEARS.max);
    el['leave-input'].min = '0';
    el['leave-input'].max = String(MAX_LEAVE_BUDGET);
    el['per-bridge-input'].min = '0';
    el['per-bridge-input'].max = String(MAX_LEAVE_PER_BRIDGE_LIMIT);
  }

  function init() {
    cacheElements();
    initTheme();
    applyInputBounds();
    buildWorkdayButtons();
    load();
    bindEvents();
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
