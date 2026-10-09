/* ============================================================
   とびいし — 画面
   ------------------------------------------------------------
   唯一の副作用層。計算は holidays.js / engine.js に任せ、ここでは
   入力の読み取り・描画・保存だけを行う。
   文字列から HTML を組み立てる経路は作らない（表示は textContent と
   クラスの付け替え、および <template> の複製のみ）。
   ============================================================ */
(function () {
  'use strict';

  var E = window.Tobiishi;
  var H = window.TobiishiHolidays;
  if (!E || !H) return;

  var STORAGE_KEYS = {
    state: 'tobiishi.state',
    remember: 'tobiishi.remember'
  };

  var MARKS = {
    holiday: '祝',
    substitute: '祝',
    'extra-holiday': '祝',
    weekly: '週',
    company: '社',
    paid: '有'
  };

  // 一覧に出す件数の上限（全件表示でも画面を埋め尽くさないため）
  var LIST_LIMIT = 40;
  // 数値入力は打鍵のたびに全再計算しない
  var INPUT_DELAY_MS = 200;

  var el = {};
  var state = null;
  var view = { timeline: null, plans: null, ranked: null, distinct: [], shown: [], natural: null, picked: [] };

  /* ============================================================
     DOM の取得
     ============================================================ */

  function byId(id) { return document.getElementById(id); }

  function collect() {
    [
      'year', 'budget', 'max-take', 'min-length', 'sort',
      'company-newyear', 'company-obon',
      'blackout-from', 'blackout-to', 'blackout-name', 'btn-add-blackout', 'blackout-list', 'blackout-empty',
      'blackout-status', 'opt-show-all',
      'range-from', 'range-to', 'opt-remember', 'btn-export', 'btn-import', 'btn-reset', 'io-text', 'io-status',
      'summary', 'stat-best', 'stat-best-sub', 'stat-longest', 'stat-longest-sub', 'stat-natural', 'stat-natural-sub',
      'plan-list', 'plan-empty', 'plan-note', 'natural-list', 'natural-empty',
      'btn-compose', 'btn-clear-picked', 'year-summary', 'picked-list', 'picked-empty',
      'request-text', 'btn-copy', 'copy-status',
      'calendar', 'holiday-tbody', 'holiday-note',
      'tpl-plan', 'tpl-month', 'tpl-blackout'
    ].forEach(function (id) {
      el[id] = byId(id);
    });
    el.dowChecks = Array.prototype.slice.call(document.querySelectorAll('.dow-check'));
    el.themeButtons = Array.prototype.slice.call(document.querySelectorAll('[data-theme-value]'));
    el.tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  }

  /* ============================================================
     保存（既定 OFF。OFF のときは残骸も消す）
     ============================================================ */

  function storage() {
    try {
      return window.localStorage;
    } catch (err) {
      return null;   // プライベートモードなどで参照自体が例外になる環境がある
    }
  }

  function clearStorage() {
    var store = storage();
    if (!store) return;
    try {
      store.removeItem(STORAGE_KEYS.state);
      store.removeItem(STORAGE_KEYS.remember);
    } catch (err) { /* 失敗しても動作は続ける */ }
  }

  function saveState() {
    if (!state.remember) { clearStorage(); return; }
    var store = storage();
    if (!store) return;
    try {
      store.setItem(STORAGE_KEYS.remember, '1');
      store.setItem(STORAGE_KEYS.state, JSON.stringify(serializeState()));
    } catch (err) { /* 容量超過などは無視する */ }
  }

  function loadState() {
    var today = todayIso();
    var store = storage();
    if (!store) return E.defaultState(today);
    var remembered = null;
    try {
      remembered = store.getItem(STORAGE_KEYS.remember) === '1' ? store.getItem(STORAGE_KEYS.state) : null;
    } catch (err) {
      remembered = null;
    }
    if (!remembered) {
      // 保存が無効なまま開いたときに、過去の入力を端末に残さない
      clearStorage();
      return E.defaultState(today);
    }
    var parsed = null;
    try {
      parsed = JSON.parse(remembered);
    } catch (err) {
      parsed = null;
    }
    var loaded = E.sanitizeState(parsed, today);
    loaded.remember = true;
    return loaded;
  }

  function serializeState() {
    return {
      year: state.year,
      from: state.from,
      to: state.to,
      weeklyOff: state.weeklyOff.slice(),
      companyOffPresets: state.companyOffPresets.slice(),
      blackout: state.blackout.map(function (b) { return { from: b.from, to: b.to, label: b.label }; }),
      maxTake: state.maxTake,
      budget: state.budget,
      minLength: state.minLength,
      sort: state.sort,
      showAll: state.showAll,
      theme: state.theme,
      remember: state.remember,
      picked: view.picked.map(function (p) { return { start: p.start, end: p.end }; })
    };
  }

  function todayIso() {
    var now = new Date();
    return H.iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /* ============================================================
     設定 → 画面
     ============================================================ */

  function fillYearOptions() {
    var current = H.parseIso(todayIso()).year;
    var first = Math.max(H.MIN_YEAR, Math.min(current, H.MAX_YEAR - 5));
    var last = Math.min(H.MAX_YEAR, first + 5);
    el.year.textContent = '';
    for (var y = first; y <= last; y++) {
      var option = document.createElement('option');
      option.value = String(y);
      option.textContent = y + '年';
      el.year.appendChild(option);
    }
  }

  function applyTheme() {
    if (state.theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', state.theme);
    }
    el.themeButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-theme-value') === state.theme ? 'true' : 'false');
    });
  }

  function syncFormFromState() {
    el.year.value = String(state.year);
    el.budget.value = String(state.budget);
    el['max-take'].value = String(state.maxTake);
    el['min-length'].value = String(state.minLength);
    el.sort.value = state.sort;
    el['opt-show-all'].checked = state.showAll;
    el['company-newyear'].checked = state.companyOffPresets.indexOf('newyear') >= 0;
    el['company-obon'].checked = state.companyOffPresets.indexOf('obon') >= 0;
    el['range-from'].value = state.from;
    el['range-to'].value = state.to;
    el['opt-remember'].checked = state.remember;
    el.dowChecks.forEach(function (check) {
      check.checked = state.weeklyOff.indexOf(Number(check.getAttribute('data-dow'))) >= 0;
    });
    renderBlackoutList();
    applyTheme();
  }

  function readFormIntoState() {
    var raw = {
      year: Number(el.year.value),
      from: el['range-from'].value,
      to: el['range-to'].value,
      weeklyOff: el.dowChecks.filter(function (c) { return c.checked; })
        .map(function (c) { return Number(c.getAttribute('data-dow')); }),
      companyOffPresets: []
        .concat(el['company-newyear'].checked ? ['newyear'] : [])
        .concat(el['company-obon'].checked ? ['obon'] : []),
      blackout: state.blackout,
      maxTake: Number(el['max-take'].value),
      budget: Number(el.budget.value),
      minLength: Number(el['min-length'].value),
      sort: el.sort.value,
      showAll: el['opt-show-all'].checked,
      theme: state.theme,
      remember: el['opt-remember'].checked,
      picked: view.picked.map(function (p) { return { start: p.start, end: p.end }; })
    };
    state = E.sanitizeState(raw, todayIso());
  }

  /* ============================================================
     休めない期間
     ============================================================ */

  function renderBlackoutList() {
    el['blackout-list'].textContent = '';
    state.blackout.forEach(function (span, i) {
      var node = el['tpl-blackout'].content.cloneNode(true);
      var li = node.querySelector('li');
      var text = E.formatShort(span.from, true) + '〜' + E.formatShort(span.to, true);
      li.querySelector('span').textContent = span.label ? text + '（' + span.label + '）' : text;
      li.querySelector('button').addEventListener('click', function () {
        state.blackout.splice(i, 1);
        setStatus(el['blackout-status'], '');
        renderBlackoutList();
        recompute();
      });
      el['blackout-list'].appendChild(node);
    });
    el['blackout-empty'].hidden = state.blackout.length > 0;
  }

  function addBlackout() {
    var from = el['blackout-from'].value;
    var to = el['blackout-to'].value || from;
    if (!H.isValidIso(from) || !H.isValidIso(to)) {
      setStatus(el['blackout-status'], '開始日（と、あれば終了日）を入れてください。');
      return;
    }
    if (state.blackout.length >= E.LIMITS.maxBlackouts) {
      setStatus(el['blackout-status'], '休めない期間は最大' + E.LIMITS.maxBlackouts + '件までです。');
      return;
    }
    setStatus(el['blackout-status'], '');
    state.blackout.push({ from: from, to: to, label: el['blackout-name'].value.slice(0, 40) });
    el['blackout-from'].value = '';
    el['blackout-to'].value = '';
    el['blackout-name'].value = '';
    renderBlackoutList();
    recompute();
  }

  /* ============================================================
     計算
     ============================================================ */

  var recomputeTimer = null;

  function recomputeSoon() {
    if (recomputeTimer !== null) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(function () {
      recomputeTimer = null;
      recompute();
    }, INPUT_DELAY_MS);
  }

  function recompute() {
    if (recomputeTimer !== null) {
      clearTimeout(recomputeTimer);
      recomputeTimer = null;
    }
    readFormIntoState();

    var fromYear = H.parseIso(state.from).year;
    var toYear = H.parseIso(state.to).year;
    var timeline = E.buildTimeline({
      from: state.from,
      to: state.to,
      weeklyOff: state.weeklyOff,
      holidays: H.holidayMap(fromYear - 1, toYear + 1),
      companyOffPresets: state.companyOffPresets,
      blackout: state.blackout
    });

    var plans = E.findPlans(timeline, { maxTake: state.maxTake, minLength: state.minLength });
    view.timeline = timeline;
    view.plans = plans;
    view.ranked = E.rankPlans(plans, state.sort);
    // 重なるプランは「同じ連休の取り方違い」。既定は代表だけを出す。
    // 代表の総数は一覧の表示上限とは別に数える（要約で本当の数を伝えるため）
    view.distinct = E.pickDistinct(view.ranked, 1000);
    view.shown = (state.showAll ? view.ranked : view.distinct).slice(0, LIST_LIMIT);
    view.natural = E.findNaturalRuns(timeline, Math.max(3, state.minLength));

    // 設定が変わって成立しなくなった選択は落とす
    view.picked = view.picked
      .map(function (p) { return E.planFromRange(timeline, p.start, p.end); })
      .filter(function (p) { return p !== null && p.cost > 0; });

    render();
    saveState();
  }

  /* ============================================================
     描画
     ============================================================ */

  // 対象期間は「年」とは限らない（初期表示は今日〜12/31、詳しい設定では任意）
  function periodText() {
    var from = H.parseIso(state.from);
    var to = H.parseIso(state.to);
    var head = from.year + '年' + from.month + '月' + from.day + '日';
    var tail = (from.year === to.year ? '' : to.year + '年') + to.month + '月' + to.day + '日';
    return head + '〜' + tail;
  }

  function setStatus(node, text) {
    if (node) node.textContent = text;
  }

  function isPicked(plan) {
    return view.picked.some(function (p) { return p.id === plan.id; });
  }

  function planNode(plan, mode) {
    var node = el['tpl-plan'].content.cloneNode(true);
    var li = node.querySelector('li');
    li.querySelector('.plan-range').textContent = E.formatRange(plan);
    li.querySelector('.plan-length').textContent = plan.length + '連休';
    li.querySelector('.plan-desc').textContent = E.describeEfficiency(plan)
      + '（' + plan.segments.map(function (s) {
        return s.label + (s.count > 1 ? '×' + s.count : '');
      }).join(' / ') + '）';

    var bar = li.querySelector('.plan-bar');
    plan.segments.forEach(function (segment) {
      var span = document.createElement('span');
      span.setAttribute('data-kind', segment.kind || 'weekly');
      span.style.setProperty('--grow', String(segment.count));
      span.textContent = (MARKS[segment.kind] || '休') + (segment.count > 1 ? segment.count : '');
      bar.appendChild(span);
    });

    var takeList = li.querySelector('.plan-take');
    plan.take.forEach(function (date) {
      var item = document.createElement('li');
      item.textContent = '有給 ' + E.formatShort(date);
      takeList.appendChild(item);
    });

    li.querySelector('.plan-eff').textContent = plan.cost > 0
      ? '有給1日あたり ' + E.efficiencyText(plan) + 'の休み'
      : '有給を使いません';

    var button = li.querySelector('.plan-toggle');
    if (mode === 'natural') {
      button.remove();
    } else {
      var picked = isPicked(plan);
      var range = E.formatRange(plan);
      if (picked) li.classList.add('is-picked');
      if (picked) {
        button.textContent = '年間プランから外す';
        button.setAttribute('aria-label', range + ' の連休を年間プランから外す');
      } else {
        // 重なるプランは追加できない。理由は事後メッセージではなく
        // ボタンの文言そのもので示す（別タブや折りたたみに逃がさない）
        var conflict = findConflict(plan);
        if (conflict) {
          button.disabled = true;
          button.textContent = '選択済みの連休と重なります';
          button.setAttribute('aria-label',
            range + ' の連休は、選択済みの ' + E.formatRange(conflict) + ' と重なるため追加できません');
          button.setAttribute('title', '選択済み: ' + E.formatRange(conflict));
        } else {
          button.textContent = '年間プランに追加';
          button.setAttribute('aria-label', range + ' の連休を年間プランに追加');
        }
      }
      if (!button.disabled) {
        button.addEventListener('click', function () { togglePick(plan); });
      }
    }
    return node;
  }

  // 重なる（＝つながってしまう）選択済みプランを返す
  function findConflict(plan) {
    for (var i = 0; i < view.picked.length; i++) {
      if (view.picked[i].id !== plan.id && E.overlaps(view.picked[i], plan)) return view.picked[i];
    }
    return null;
  }

  function togglePick(plan) {
    var at = -1;
    view.picked.forEach(function (p, i) { if (p.id === plan.id) at = i; });
    if (at >= 0) {
      view.picked.splice(at, 1);
    } else {
      if (findConflict(plan)) return;   // ボタンが無効なので通常は到達しない
      if (view.picked.length >= E.LIMITS.maxPickedPlans) return;
      view.picked.push(plan);
    }
    view.picked.sort(function (x, y) { return x.startIdx - y.startIdx; });
    render();
    saveState();
  }

  function renderPlanList(container, emptyNode, plans, mode) {
    container.textContent = '';
    plans.forEach(function (plan) { container.appendChild(planNode(plan, mode)); });
    if (emptyNode) emptyNode.hidden = plans.length > 0;
  }

  function renderSummary() {
    var plans = view.ranked;
    var byEfficiency = E.rankPlans(plans, 'efficiency')[0];
    var byLength = E.rankPlans(plans, 'length')[0];

    if (plans.length === 0) {
      setStatus(el.summary, periodText() + ' に、条件に合う連休は見つかりませんでした。'
        + '「連休とみなす最短の日数」を短くするか、有給の上限を増やしてみてください。');
    } else {
      setStatus(el.summary, periodText() + ' に、有給'
        + state.maxTake + '日以内で作れる' + state.minLength + '日以上の連休が '
        + plans.length + '通りあります'
        + (view.distinct.length < plans.length ? '（重ならない代表は ' + view.distinct.length + '通り）' : '') + '。'
        + (byEfficiency ? '一番効率がよいのは ' + E.formatRange(byEfficiency) + ' で、' + E.describeEfficiency(byEfficiency) + 'です。' : ''));
    }

    el['stat-best'].textContent = byEfficiency ? E.describeEfficiency(byEfficiency) : '—';
    el['stat-best-sub'].textContent = byEfficiency ? E.formatRange(byEfficiency) : '';
    el['stat-longest'].textContent = byLength ? byLength.length + '連休' : '—';
    el['stat-longest-sub'].textContent = byLength ? E.formatRange(byLength) + '（有給' + byLength.cost + '日）' : '';
    el['stat-natural'].textContent = view.natural.length + '回';
    el['stat-natural-sub'].textContent = view.natural.length > 0
      ? '合計 ' + view.natural.reduce(function (sum, r) { return sum + r.length; }, 0) + '日'
      : '';
  }

  function renderYearPanel() {
    var picked = view.picked;
    var totalCost = picked.reduce(function (sum, p) { return sum + p.cost; }, 0);
    var totalLength = picked.reduce(function (sum, p) { return sum + p.length; }, 0);

    if (picked.length === 0) {
      setStatus(el['year-summary'], '有給の予算は ' + state.budget + '日です。');
      el['year-summary'].classList.remove('is-over');
    } else {
      var over = totalCost > state.budget;
      setStatus(el['year-summary'], picked.length + '件の連休で合計 ' + totalLength + '日の休み。'
        + '使う有給は ' + totalCost + '日（予算 ' + state.budget + '日）。'
        + (over ? '予算を ' + (totalCost - state.budget) + '日超えています。' : ''));
      el['year-summary'].classList.toggle('is-over', over);
    }

    renderPlanList(el['picked-list'], null, picked, 'picked');
    el['picked-empty'].hidden = picked.length > 0;

    el['request-text'].value = picked.length > 0
      ? E.buildRequestText(picked, {
          title: periodText(),
          note: '※ 暦の上での希望日です。業務の状況に応じて調整します。'
        })
      : '';
    el['btn-copy'].disabled = picked.length === 0;
  }

  function renderCalendar() {
    var timeline = view.timeline;
    var container = el.calendar;
    container.textContent = '';
    if (!timeline || timeline.days.length === 0) return;

    var pickedDays = Object.create(null);
    var runDays = Object.create(null);
    view.picked.forEach(function (plan) {
      plan.take.forEach(function (date) { pickedDays[date] = true; });
      for (var i = plan.startIdx; i <= plan.endIdx; i++) runDays[timeline.days[i].date] = true;
    });

    var first = H.parseIso(timeline.from);
    var last = H.parseIso(timeline.to);
    var cursorYear = first.year;
    var cursorMonth = first.month;

    while (cursorYear < last.year || (cursorYear === last.year && cursorMonth <= last.month)) {
      container.appendChild(monthNode(cursorYear, cursorMonth, timeline, pickedDays, runDays));
      cursorMonth++;
      if (cursorMonth > 12) { cursorMonth = 1; cursorYear++; }
    }
  }

  function monthNode(year, month, timeline, pickedDays, runDays) {
    var node = el['tpl-month'].content.cloneNode(true);
    node.querySelector('h3').textContent = year + '年' + month + '月';
    var grid = node.querySelector('.cal-grid');

    H.DOW_LABELS.forEach(function (label) {
      var head = document.createElement('div');
      head.className = 'cal-dow';
      head.textContent = label;
      grid.appendChild(head);
    });

    var firstDow = H.dayOfWeek(H.iso(year, month, 1));
    for (var blank = 0; blank < firstDow; blank++) {
      var pad = document.createElement('div');
      pad.className = 'cal-day is-blank';
      pad.setAttribute('aria-hidden', 'true');
      grid.appendChild(pad);
    }

    var total = H.daysInMonth(year, month);
    for (var d = 1; d <= total; d++) {
      var date = H.iso(year, month, d);
      var idx = timeline.index[date];
      var day = idx === undefined ? null : timeline.days[idx];
      var cell = document.createElement('div');
      cell.className = 'cal-day';

      var kind = null;
      var labelParts = [E.formatShort(date)];
      if (pickedDays[date]) {
        kind = 'paid';
        labelParts.push('有給');
      } else if (day && day.off) {
        kind = day.offKind;
        labelParts.push(day.offLabel);
      }
      if (day && day.blackoutLabel && !pickedDays[date]) {
        cell.setAttribute('data-blackout', '1');
        labelParts.push(day.blackoutLabel);
      }
      if (runDays[date]) labelParts.push('連休');
      if (kind) cell.setAttribute('data-kind', kind);
      if (runDays[date]) cell.setAttribute('data-in-run', '1');

      var num = document.createElement('span');
      num.className = 'cal-num';
      num.textContent = String(d);
      cell.appendChild(num);

      var mark = document.createElement('span');
      mark.className = 'cal-mark';
      mark.textContent = kind ? MARKS[kind] : (cell.getAttribute('data-blackout') ? '×' : '');
      cell.appendChild(mark);

      var label = labelParts.join(' ');
      cell.setAttribute('title', label);
      cell.setAttribute('aria-label', label);
      grid.appendChild(cell);
    }
    return node;
  }

  function renderHolidays() {
    var tbody = el['holiday-tbody'];
    tbody.textContent = '';
    var fromYear = H.parseIso(state.from).year;
    var toYear = H.parseIso(state.to).year;
    var rows = [];
    for (var y = fromYear; y <= toYear; y++) rows = rows.concat(H.holidaysInYear(y));

    rows.forEach(function (holiday) {
      var tr = document.createElement('tr');
      var dateCell = document.createElement('td');
      dateCell.textContent = E.formatShort(holiday.date, fromYear !== toYear);
      var nameCell = document.createElement('td');
      nameCell.textContent = holiday.name;
      var kindCell = document.createElement('td');
      var tag = document.createElement('span');
      tag.className = 'kind-tag';
      tag.textContent = holiday.kind;
      kindCell.appendChild(tag);
      tr.appendChild(dateCell);
      tr.appendChild(nameCell);
      tr.appendChild(kindCell);
      tbody.appendChild(tr);
    });

    setStatus(el['holiday-note'], rows.length + '件。春分の日・秋分の日は近似式による推定で、前年2月の官報で確定します。');
  }

  function renderPlanNote() {
    var total = state.showAll ? view.ranked.length : view.distinct.length;
    setStatus(el['plan-note'], total > view.shown.length
      ? total + '件のうち上位' + view.shown.length + '件を表示しています。'
      : '');
  }

  function render() {
    renderSummary();
    renderPlanNote();
    renderPlanList(el['plan-list'], el['plan-empty'], view.shown, 'plans');
    renderPlanList(el['natural-list'], el['natural-empty'], view.natural, 'natural');
    renderYearPanel();
    renderCalendar();
    renderHolidays();
  }

  /* ============================================================
     年間プランの自動編成
     ============================================================ */

  function compose() {
    var result = E.composeYear(view.plans, state.budget);
    view.picked = result.picked.slice();
    render();
    if (result.picked.length === 0) {
      setStatus(el['year-summary'], '予算 ' + state.budget + '日では条件に合う組み合わせが見つかりませんでした。');
    }
    saveState();
  }

  /* ============================================================
     書き出し・読み込み
     ============================================================ */

  function exportState() {
    el['io-text'].value = JSON.stringify(serializeState(), null, 2);
    setStatus(el['io-status'], '書き出しました。この内容をコピーして保管してください。');
  }

  function importState() {
    var parsed = null;
    try {
      parsed = JSON.parse(el['io-text'].value);
    } catch (err) {
      setStatus(el['io-status'], 'JSON として読み取れませんでした。');
      return;
    }
    var next = E.sanitizeState(parsed, todayIso());
    var pickedRanges = next.picked.slice();
    state = next;
    view.picked = [];
    syncFormFromState();
    recompute();
    // 区間から復元できるものだけを戻す
    view.picked = pickedRanges
      .map(function (p) { return E.planFromRange(view.timeline, p.start, p.end); })
      .filter(function (p) { return p !== null && p.cost > 0; });
    render();
    saveState();
    setStatus(el['io-status'], '読み込みました（不正な項目は既定値に戻しました）。');
  }

  function resetAll() {
    state = E.defaultState(todayIso());
    view.picked = [];
    clearStorage();
    syncFormFromState();
    recompute();
    setStatus(el['io-status'], '初期化しました。');
  }

  /* ============================================================
     コピー
     ============================================================ */

  function copyRequest() {
    var text = el['request-text'].value;
    if (!text) return;
    var done = function () { setStatus(el['copy-status'], 'コピーしました。'); };
    var fallback = function () {
      el['request-text'].focus();
      el['request-text'].select();
      setStatus(el['copy-status'], 'コピーできませんでした。選択されているので、手元の操作でコピーしてください。');
    };
    // file:// や非対応環境では clipboard API が使えないため、選択に落とす
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ============================================================
     タブ
     ============================================================ */

  function selectTab(tab) {
    el.tabs.forEach(function (candidate) {
      var selected = candidate === tab;
      candidate.setAttribute('aria-selected', selected ? 'true' : 'false');
      candidate.tabIndex = selected ? 0 : -1;
      var panel = byId(candidate.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
  }

  function onTabKeydown(event) {
    var index = el.tabs.indexOf(event.currentTarget);
    if (index < 0) return;
    var next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % el.tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + el.tabs.length) % el.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = el.tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(el.tabs[next]);
    el.tabs[next].focus();
  }

  /* ============================================================
     初期化
     ============================================================ */

  function onYearChange() {
    var year = Number(el.year.value);
    if (!H.isSupportedYear(year)) return;
    var today = todayIso();
    var start = H.parseIso(today).year === year ? today : H.iso(year, 1, 1);
    el['range-from'].value = start;
    el['range-to'].value = H.iso(year, 12, 31);
    view.picked = [];
    recompute();
  }

  function bind() {
    el.year.addEventListener('change', onYearChange);
    // 選択系は「確定＝操作」なので change だけでよい
    ['min-length', 'sort', 'opt-show-all', 'company-newyear', 'company-obon', 'range-from', 'range-to']
      .forEach(function (id) { el[id].addEventListener('change', recompute); });
    // 数値入力は change がフォーカスを外すまで来ないため、input も見る
    ['budget', 'max-take'].forEach(function (id) {
      el[id].addEventListener('input', recomputeSoon);
      el[id].addEventListener('change', recompute);
    });
    el.dowChecks.forEach(function (check) { check.addEventListener('change', recompute); });

    el['opt-remember'].addEventListener('change', function () {
      state.remember = el['opt-remember'].checked;
      if (!state.remember) clearStorage();
      saveState();
    });

    el['btn-add-blackout'].addEventListener('click', addBlackout);
    el['btn-compose'].addEventListener('click', compose);
    el['btn-clear-picked'].addEventListener('click', function () {
      view.picked = [];
      render();
      saveState();
    });
    el['btn-copy'].addEventListener('click', copyRequest);
    el['btn-export'].addEventListener('click', exportState);
    el['btn-import'].addEventListener('click', importState);
    el['btn-reset'].addEventListener('click', resetAll);

    el.themeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.theme = button.getAttribute('data-theme-value');
        applyTheme();
        saveState();
      });
    });

    el.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { selectTab(tab); });
      tab.addEventListener('keydown', onTabKeydown);
    });
  }

  function init() {
    collect();
    fillYearOptions();
    state = loadState();
    // 保存された年が選択肢に無い場合は、選択できる年に寄せる
    if (!Array.prototype.some.call(el.year.options, function (o) { return o.value === String(state.year); })) {
      state.year = Number(el.year.options[0].value);
      state.from = H.iso(state.year, 1, 1);
      state.to = H.iso(state.year, 12, 31);
    }
    var pickedRanges = state.picked.slice();
    syncFormFromState();
    bind();
    recompute();
    if (pickedRanges.length > 0) {
      view.picked = pickedRanges
        .map(function (p) { return E.planFromRange(view.timeline, p.start, p.end); })
        .filter(function (p) { return p !== null && p.cost > 0; });
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
