/**
 * app — 画面の描画と入力の受け取り。
 *
 * 方針
 *   - DOM への書き込みは createElement / textContent のみ（innerHTML は使わない）
 *   - 状態は単一の state に集約し、入力 → recompute() → render() の一方向
 *   - localStorage には設定のみを保存し、読み出し時に型と範囲を検証する
 */
(function () {
  'use strict';

  var Y = globalThis.Yasumi;
  var dateutil = Y.dateutil;
  var holidays = Y.holidays;
  var calendarLib = Y.calendar;
  var planner = Y.planner;
  var ics = Y.ics;

  var STORAGE_KEY = 'yasumitsunagi.settings.v1';
  var THEME_KEY = 'yasumitsunagi.theme.v1';
  var MAX_PLAN_CARDS = 12;
  var MAX_PLANS_PER_PERIOD = 2;
  var MAX_TEXT_LENGTH = 8000;
  var THEMES = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: '自動', light: 'ライト', dark: 'ダーク' };

  var BAR_CLASS = {
    pto: 'bar-pto',
    holiday: 'bar-holiday',
    substitute: 'bar-holiday',
    citizens: 'bar-holiday',
    weekly: 'bar-weekly',
    company: 'bar-company',
  };

  var TAB_IDS = ['plans', 'year', 'calendar', 'holidays'];

  var state = defaultState();
  var computed = null;
  var dom = {};

  // ---------------------------------------------------------------- 状態

  function defaultState() {
    return {
      startDate: dateutil.todayInJapan(),
      months: 12,
      budget: 3,
      weeklyOffDays: [0, 6],
      companyHolidays: '',
      workOverrides: '',
      minLength: 3,
      tab: 'plans',
      // テーマは state を単一の情報源にする。localStorage を毎回読み直すと、
      // 保存できない環境（プライベートモード等）で次の状態が計算できなくなる。
      theme: 'auto',
    };
  }

  /** テキストエリアの内容を日付の配列にする（改行・カンマ・空白区切り） */
  function parseDateList(text) {
    return String(text || '')
      .split(/[\s,、]+/)
      .map(function (token) {
        return token.trim();
      })
      .filter(function (token) {
        return token.length > 0;
      });
  }

  /** 入力を検証し、問題があれば日本語のメッセージを返す */
  function validate() {
    if (!dateutil.isValidDate(state.startDate)) {
      return '開始日を「年-月-日」の形式で選んでください。';
    }
    var year = dateutil.toParts(state.startDate).year;
    if (year < holidays.MIN_YEAR || year > holidays.MAX_YEAR) {
      return (
        '開始日は ' + holidays.MIN_YEAR + '年〜' + holidays.MAX_YEAR + '年の範囲で指定してください。'
      );
    }
    var lists = [
      { label: '会社の休業日', text: state.companyHolidays },
      { label: '特別出勤日', text: state.workOverrides },
    ];
    for (var i = 0; i < lists.length; i += 1) {
      if (lists[i].text.length > MAX_TEXT_LENGTH) {
        return lists[i].label + 'の入力が長すぎます（' + MAX_TEXT_LENGTH + '文字以内）。';
      }
      var tokens = parseDateList(lists[i].text);
      if (tokens.length > calendarLib.MAX_DATE_LIST) {
        return (
          lists[i].label + 'は ' + calendarLib.MAX_DATE_LIST + ' 件までです（' + tokens.length + ' 件）。'
        );
      }
      for (var j = 0; j < tokens.length; j += 1) {
        if (!dateutil.isValidDate(tokens[j])) {
          return (
            lists[i].label +
            'に読めない日付があります: 「' +
            tokens[j] +
            '」（2026-08-13 のように入力してください）'
          );
        }
      }
    }
    return null;
  }

  function recompute() {
    var message = validate();
    if (message) {
      computed = { error: message };
      return;
    }

    try {
      var endExclusive = dateutil.addMonths(state.startDate, state.months);
      var dayCount = Math.min(
        Math.max(dateutil.diffDays(state.startDate, endExclusive), 1),
        calendarLib.MAX_DAY_COUNT
      );
      var built = calendarLib.buildCalendar({
        startDate: state.startDate,
        dayCount: dayCount,
        weeklyOffDays: state.weeklyOffDays,
        companyHolidays: parseDateList(state.companyHolidays),
        workOverrides: parseDateList(state.workOverrides),
      });
      var options = { budget: state.budget, minLength: state.minLength };
      computed = {
        error: null,
        built: built,
        summary: calendarLib.summarize(built.days),
        existing: planner.findExistingBreaks(built.days, { minLength: state.minLength }),
        plans: planner.dropDominatedPlans(planner.findPlans(built.days, options)),
        year: planner.planYear(built.days, options),
      };
    } catch (error) {
      computed = { error: error && error.message ? error.message : '計算に失敗しました。' };
    }
  }

  // ---------------------------------------------------------------- 保存

  function loadSettings() {
    var raw;
    try {
      raw = globalThis.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
    } catch (error) {
      return; // プライベートモードなどで参照できない場合は既定値のまま
    }
    if (!raw) return;

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    // 開始日は保存しない（常に「今日」から考える）
    if (Number.isInteger(parsed.months) && [3, 6, 12].indexOf(parsed.months) >= 0) {
      state.months = parsed.months;
    }
    if (Number.isInteger(parsed.budget) && parsed.budget >= 0 && parsed.budget <= 20) {
      state.budget = parsed.budget;
    }
    if (Number.isInteger(parsed.minLength) && parsed.minLength >= 2 && parsed.minLength <= 5) {
      state.minLength = parsed.minLength;
    }
    if (Array.isArray(parsed.weeklyOffDays)) {
      var days = parsed.weeklyOffDays.filter(function (value) {
        return Number.isInteger(value) && value >= 0 && value <= 6;
      });
      state.weeklyOffDays = Array.from(new Set(days)).sort();
    }
    ['companyHolidays', 'workOverrides'].forEach(function (key) {
      if (typeof parsed[key] === 'string' && parsed[key].length <= MAX_TEXT_LENGTH) {
        state[key] = parsed[key];
      }
    });
    if (typeof parsed.tab === 'string' && TAB_IDS.indexOf(parsed.tab) >= 0) {
      state.tab = parsed.tab;
    }
  }

  function saveSettings() {
    try {
      if (!globalThis.localStorage) return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          months: state.months,
          budget: state.budget,
          minLength: state.minLength,
          weeklyOffDays: state.weeklyOffDays,
          companyHolidays: state.companyHolidays,
          workOverrides: state.workOverrides,
          tab: state.tab,
        })
      );
    } catch (error) {
      /* 保存できない環境では黙って続行する（機能は成立する） */
    }
  }

  function clearSettings() {
    var removed = false;
    try {
      if (globalThis.localStorage) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(THEME_KEY);
        removed = true;
      }
    } catch (error) {
      removed = false;
    }
    state = defaultState();
    // persist: false … ここで保存すると、いま消したキーを自分で書き戻してしまう
    applyTheme('auto', { persist: false });
    syncFormFromState();
    recompute();
    render();
    setText(
      dom.storageStatus,
      removed ? '保存した条件を消しました。条件は初期値に戻りました。' : '保存領域を参照できませんでした。'
    );
  }

  // ---------------------------------------------------------------- テーマ

  function loadTheme() {
    try {
      var saved = globalThis.localStorage ? localStorage.getItem(THEME_KEY) : null;
      return THEMES.indexOf(saved) >= 0 ? saved : 'auto';
    } catch (error) {
      return 'auto';
    }
  }

  /**
   * テーマを適用する。state を更新し、DOM に反映し、保存は副作用として行う。
   * @param {string} theme 'auto' | 'light' | 'dark'
   * @param {{persist?: boolean}} [options] persist: false で保存しない
   */
  function applyTheme(theme, options) {
    var persist = !options || options.persist !== false;
    var value = THEMES.indexOf(theme) >= 0 ? theme : 'auto';
    state.theme = value;
    if (value === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
    if (dom.themeToggle) setText(dom.themeToggle, 'テーマ: ' + THEME_LABEL[value]);
    if (persist) {
      try {
        if (globalThis.localStorage) localStorage.setItem(THEME_KEY, value);
      } catch (error) {
        /* 保存できなくても表示は切り替わる（state が正なので次の切替も動く） */
      }
    }
    return value;
  }

  /** 次のテーマへ進める（現在値は state から取る） */
  function cycleTheme() {
    return applyTheme(THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]);
  }

  // ---------------------------------------------------------------- DOM 補助

  function setText(element, text) {
    if (element) element.textContent = text;
  }

  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  /**
   * ここを通してだけ属性を設定できないと、将来の改修で
   * ユーザー入力から href や on* を組み立てる XSS 経路が生まれうる。
   * レビュワーの注意力ではなく構造で禁止する。
   */
  var FORBIDDEN_ATTRS = /^(on|href$|src$|srcdoc$|formaction$|xlink:href$|style$)/i;

  function make(tag, options) {
    var element = document.createElement(tag);
    var opts = options || {};
    if (opts.className) element.className = opts.className;
    if (opts.text !== undefined) element.textContent = String(opts.text);
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (name) {
        if (FORBIDDEN_ATTRS.test(name)) {
          throw new Error('この属性は make() では設定できません: ' + name);
        }
        element.setAttribute(name, String(opts.attrs[name]));
      });
    }
    (opts.children || []).forEach(function (child) {
      if (child) element.appendChild(child);
    });
    return element;
  }

  // ---------------------------------------------------------------- 描画

  function render() {
    var hasError = Boolean(computed && computed.error);
    dom.errorMessage.hidden = !hasError;
    if (hasError) setText(dom.errorMessage, computed.error);

    if (hasError) {
      clear(dom.summaryStats);
      renderEmpty(dom.plansList, '条件を直すと結果が表示されます。');
      clear(dom.yearSummary);
      renderEmpty(dom.yearList, '条件を直すと結果が表示されます。');
      clear(dom.calendarMonths);
      clear(dom.holidayTable);
      return;
    }

    renderSummary();
    renderPlans();
    renderYear();
    renderCalendar();
    renderHolidays();
    renderTabs();
  }

  function renderEmpty(container, message) {
    clear(container);
    container.appendChild(make('p', { className: 'empty', text: message }));
  }

  function stat(label, value, unit) {
    return make('div', {
      children: [
        make('dt', { text: label }),
        make('dd', {
          children: [
            document.createTextNode(String(value)),
            unit ? make('span', { className: 'unit', text: unit }) : null,
          ],
        }),
      ],
    });
  }

  function renderSummary() {
    var summary = computed.summary;
    var built = computed.built;
    var holidayCount =
      summary.counts.holiday + summary.counts.substitute + summary.counts.citizens;

    var longestExisting = computed.existing.reduce(function (max, item) {
      return Math.max(max, item.length);
    }, 0);

    clear(dom.summaryStats);
    [
      stat('日数', summary.total, '日'),
      stat('休みの日', summary.offDays, '日'),
      stat('勤務日', summary.workDays, '日'),
      stat('祝日など', holidayCount, '日'),
      stat('有給なしの連休', computed.existing.length, '回'),
      stat('うち最長', longestExisting, '日'),
    ].forEach(function (node) {
      dom.summaryStats.appendChild(node);
    });
    setText(
      dom.summaryHeading,
      dateutil.formatJa(built.startDate, { omitWeekday: true }) +
        '〜' +
        dateutil.formatJa(built.endDate, { omitWeekday: true }) +
        'のまとめ'
    );
  }

  function planCard(plan, options) {
    var opts = options || {};
    var card = make('article', {
      className: 'plan-card' + (opts.highlight ? ' plan-card--top' : ''),
    });

    var head = make('div', { className: 'plan-card__head' });
    head.appendChild(make('span', { className: 'plan-card__length', text: plan.length + '連休' }));
    head.appendChild(
      make('span', {
        className: 'plan-card__range',
        text:
          dateutil.formatShortJa(plan.start) +
          '〜' +
          dateutil.formatShortJa(plan.end) +
          (opts.showYear ? '（' + dateutil.toParts(plan.start).year + '年）' : ''),
      })
    );
    if (plan.cost > 0) {
      head.appendChild(
        make('span', {
          className: 'plan-card__perday',
          text: '有給1日あたり ' + plan.perDay.toFixed(1) + '日',
        })
      );
    }
    card.appendChild(head);

    var pto = make('p', { className: 'plan-card__pto' });
    if (plan.cost === 0) {
      pto.appendChild(document.createTextNode('有給を使わずに成立します。'));
    } else {
      pto.appendChild(document.createTextNode('休む日（' + plan.cost + '日）: '));
      pto.appendChild(
        make('strong', {
          text: plan.ptoDates
            .map(function (date) {
              return dateutil.formatShortJa(date);
            })
            .join('、'),
        })
      );
    }
    card.appendChild(pto);

    card.appendChild(breakBar(plan));

    var reasonList = make('ul', { className: 'plan-card__reason' });
    var ptoSet = new Set(plan.ptoDates);
    for (var index = plan.startIndex; index <= plan.endIndex; index += 1) {
      var day = computed.built.days[index];
      reasonList.appendChild(
        make('li', {
          text:
            dateutil.formatShortJa(day.date) +
            ' … ' +
            (ptoSet.has(day.date) ? '有給' : day.label) +
            (day.note ? '（' + day.note + '）' : ''),
        })
      );
    }
    card.appendChild(
      make('details', {
        className: 'plan-card__detail',
        children: [make('summary', { text: '日ごとの内訳を見る' }), reasonList],
      })
    );

    var actions = make('div', { className: 'plan-card__actions' });
    var button = make('button', {
      className: 'button button--primary',
      attrs: { type: 'button' },
      text: 'カレンダーに追加（.ics）',
    });
    // 書き出しの結果は、押したボタンの隣に出す（フッターだと気づけない）
    var status = make('span', { className: 'export-status', attrs: { role: 'status' } });
    button.addEventListener('click', function () {
      exportPlans([plan], 'yasumitsunagi-' + plan.start + '.ics', status);
    });
    actions.appendChild(button);
    actions.appendChild(status);
    if (plan.truncatedStart || plan.truncatedEnd) {
      actions.appendChild(
        make('span', {
          className: 'note',
          text: '※ 指定期間の端に接しているため、実際にはさらに前後へ伸びる可能性があります',
        })
      );
    }
    card.appendChild(actions);
    return card;
  }

  /** 連休の構成を横棒で示す（読み上げ用の情報は内訳リスト側にある） */
  function breakBar(plan) {
    var bar = make('div', { className: 'plan-card__bar', attrs: { 'aria-hidden': 'true' } });
    var ptoSet = new Set(plan.ptoDates);
    for (var index = plan.startIndex; index <= plan.endIndex; index += 1) {
      var day = computed.built.days[index];
      var isPto = ptoSet.has(day.date);
      var key = isPto ? 'pto' : day.kind;
      var segment = make('span', {
        className: BAR_CLASS[key] || '',
        text: isPto ? '有' : day.symbol || '',
      });
      segment.style.flex = '1 1 0';
      bar.appendChild(segment);
    }
    return bar;
  }

  function renderPlans() {
    var plans = computed.plans;
    if (state.budget === 0) {
      renderEmpty(
        dom.plansList,
        '使える有給休暇を1日以上にすると、連休の作り方を提案します。下の「祝日一覧」や「カレンダー」はそのまま使えます。'
      );
      return;
    }
    if (plans.length === 0) {
      renderEmpty(
        dom.plansList,
        'この条件では' +
          state.minLength +
          '日以上の連休を作れませんでした。有給の日数を増やすか、期間を長くしてみてください。'
      );
      return;
    }

    // 効率の順位を保ちつつ、同じ時期の変種で一覧が埋まらないように選ぶ
    var shown = planner.selectVariedPlans(plans, {
      limit: MAX_PLAN_CARDS,
      maxPerCluster: MAX_PLANS_PER_PERIOD,
    });

    clear(dom.plansList);
    shown.forEach(function (plan, index) {
      dom.plansList.appendChild(planCard(plan, { highlight: index === 0, showYear: true }));
    });
    if (plans.length > shown.length) {
      dom.plansList.appendChild(
        make('p', {
          className: 'note',
          text:
            '全 ' +
            plans.length +
            ' 件の候補から、時期が偏らないように ' +
            shown.length +
            ' 件を効率の高い順に表示しています（同じ時期の案は' +
            MAX_PLANS_PER_PERIOD +
            '件まで）。有給の日数や期間を変えると、ほかの候補も出てきます。',
        })
      );
    }
  }

  function renderYear() {
    var year = computed.year;
    clear(dom.yearSummary);

    if (state.budget === 0 || year.plans.length === 0) {
      renderEmpty(
        dom.yearList,
        state.budget === 0
          ? '使える有給休暇を1日以上にすると、期間全体への配分を計算します。'
          : 'この条件では連休を組めませんでした。条件を緩めてみてください。'
      );
      return;
    }

    [
      ['使う有給（予算' + year.budget + '日）', year.usedDays + '日'],
      ['休みの合計', year.totalDays + '日'],
      ['連休の回数', year.plans.length + '回'],
      [
        '有給1日あたり',
        (year.usedDays > 0 ? (year.totalDays / year.usedDays).toFixed(1) : '0') + '日',
      ],
    ].forEach(function (row) {
      dom.yearSummary.appendChild(
        make('div', {
          children: [
            make('span', { className: 'label', text: row[0] }),
            make('span', { className: 'value', text: row[1] }),
          ],
        })
      );
    });

    clear(dom.yearList);
    var exportAll = make('button', {
      className: 'button button--primary',
      attrs: { type: 'button' },
      text: 'この年間プランをまとめて .ics に書き出す',
    });
    var exportAllStatus = make('span', {
      className: 'export-status',
      attrs: { role: 'status' },
    });
    exportAll.addEventListener('click', function () {
      exportPlans(
        year.plans,
        'yasumitsunagi-plan-' + computed.built.startDate + '.ics',
        exportAllStatus
      );
    });
    dom.yearList.appendChild(
      make('div', { className: 'plan-card__actions', children: [exportAll, exportAllStatus] })
    );

    year.plans.forEach(function (plan) {
      dom.yearList.appendChild(planCard(plan, { showYear: true }));
    });
  }

  function renderCalendar() {
    clear(dom.calendarLegend);
    [
      ['有', 'swatch--pto', '有給（年間プランで使う日）'],
      ['祝', 'swatch--holiday', '祝日・振替休日・国民の休日'],
      ['休', 'swatch--weekly', '毎週の休み'],
      ['社', 'swatch--company', '会社の休業日'],
      ['', 'swatch--workday', '勤務日'],
    ].forEach(function (row) {
      dom.calendarLegend.appendChild(
        make('li', {
          children: [
            make('span', { className: 'swatch ' + row[1], text: row[0] }),
            make('span', { text: row[2] }),
          ],
        })
      );
    });

    var ptoSet = new Set();
    computed.year.plans.forEach(function (plan) {
      plan.ptoDates.forEach(function (date) {
        ptoSet.add(date);
      });
    });

    var byMonth = new Map();
    computed.built.days.forEach(function (day) {
      var key = day.date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(day);
    });

    clear(dom.calendarMonths);
    byMonth.forEach(function (days, key) {
      dom.calendarMonths.appendChild(monthTable(key, days, ptoSet));
    });
  }

  function monthTable(monthKey, days, ptoSet) {
    var parts = monthKey.split('-');
    var table = make('table');
    table.appendChild(
      make('caption', { text: Number(parts[0]) + '年' + Number(parts[1]) + '月' })
    );

    var headRow = make('tr');
    dateutil.WEEKDAY_JA.forEach(function (name) {
      headRow.appendChild(make('th', { attrs: { scope: 'col' }, text: name }));
    });
    table.appendChild(make('thead', { children: [headRow] }));

    var body = make('tbody');
    var row = make('tr');
    for (var blank = 0; blank < days[0].weekday; blank += 1) {
      row.appendChild(make('td'));
    }

    days.forEach(function (day) {
      if (day.weekday === 0 && row.childNodes.length > 0) {
        body.appendChild(row);
        row = make('tr');
      }
      var isPto = ptoSet.has(day.date);
      var cell = make('div', {
        className: 'cell ' + (isPto ? 'cell--pto' : 'cell--' + day.kind),
      });
      cell.appendChild(make('span', { text: dateutil.toParts(day.date).day }));
      cell.appendChild(make('span', { className: 'mark', text: isPto ? '有' : day.symbol || '' }));
      row.appendChild(
        make('td', {
          attrs: {
            'aria-label':
              dateutil.formatJa(day.date) + ' ' + (isPto ? '有給' : day.label),
            title: dateutil.formatJa(day.date) + ' ' + (isPto ? '有給' : day.label),
          },
          children: [cell],
        })
      );
    });
    if (row.childNodes.length > 0) body.appendChild(row);
    table.appendChild(body);

    return make('div', { className: 'month', children: [table] });
  }

  function renderHolidays() {
    var rows = [];
    computed.built.days.forEach(function (day) {
      if (day.kind === 'holiday' || day.kind === 'substitute' || day.kind === 'citizens') {
        rows.push(day);
      }
    });

    clear(dom.holidayTable);
    if (rows.length === 0) {
      dom.holidayTable.appendChild(
        make('p', { className: 'empty', text: 'この期間に祝日はありません。' })
      );
      return;
    }

    var table = make('table', { className: 'data' });
    var headRow = make('tr');
    ['日付', '名称', '種別', '根拠'].forEach(function (label) {
      headRow.appendChild(make('th', { attrs: { scope: 'col' }, text: label }));
    });
    table.appendChild(make('thead', { children: [headRow] }));

    var body = make('tbody');
    rows.forEach(function (day) {
      body.appendChild(
        make('tr', {
          children: [
            make('td', { text: dateutil.formatJa(day.date) }),
            make('td', { text: day.label }),
            make('td', {
              children: [
                make('span', {
                  className: 'kind-tag kind-tag--' + day.kind,
                  text: holidays.KIND_LABEL[day.kind],
                }),
              ],
            }),
            make('td', { text: day.note || '暦どおりの祝日' }),
          ],
        })
      );
    });
    table.appendChild(body);
    dom.holidayTable.appendChild(table);
  }

  function renderTabs() {
    TAB_IDS.forEach(function (id) {
      var selected = id === state.tab;
      var tab = document.getElementById('tab-' + id);
      var panel = document.getElementById('panel-' + id);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      panel.hidden = !selected;
    });
  }

  // ---------------------------------------------------------------- 書き出し

  function exportPlans(plans, filename, statusElement) {
    try {
      var text = ics.buildCalendarFile({
        calendarName: 'やすみつなぎ の連休プラン',
        events: plans.map(function (plan) {
          return {
            start: plan.start,
            end: plan.end,
            summary:
              plan.length + '連休' + (plan.cost > 0 ? '（有給' + plan.cost + '日）' : '（有給なし）'),
            description:
              (plan.cost > 0
                ? '有給を取る日: ' +
                  plan.ptoDates
                    .map(function (date) {
                      return dateutil.formatJa(date);
                    })
                    .join('、') + '\n'
                : '') +
              '内訳: ' +
              plan.reason +
              '\n※ やすみつなぎ による計算結果です。祝日は計算値のため公式の暦で確認してください。',
          };
        }),
      });
      downloadText(filename, text, 'text/calendar;charset=utf-8');
      setText(statusElement || dom.storageStatus, filename + ' を書き出しました。');
    } catch (error) {
      setText(
        statusElement || dom.storageStatus,
        '書き出しに失敗しました: ' + (error && error.message)
      );
    }
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    globalThis.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 10000);
  }

  // ---------------------------------------------------------------- 入力

  function syncFormFromState() {
    dom.startDate.value = state.startDate;
    dom.period.value = String(state.months);
    dom.budget.value = String(state.budget);
    setText(dom.budgetOutput, state.budget + '日');
    dom.companyHolidays.value = state.companyHolidays;
    dom.workOverrides.value = state.workOverrides;
    dom.minLength.value = String(state.minLength);
    Array.from(dom.weekdayChecks.querySelectorAll('input[type="checkbox"]')).forEach(function (box) {
      box.checked = state.weeklyOffDays.indexOf(Number(box.value)) >= 0;
    });
  }

  function update() {
    recompute();
    render();
    saveSettings();
  }

  function buildWeekdayChecks() {
    dateutil.WEEKDAY_JA.forEach(function (name, index) {
      var box = make('input', {
        attrs: { type: 'checkbox', value: String(index), id: 'weekday-' + index },
      });
      box.addEventListener('change', function () {
        var set = new Set(state.weeklyOffDays);
        if (box.checked) set.add(index);
        else set.delete(index);
        state.weeklyOffDays = Array.from(set).sort();
        update();
      });
      var label = make('label', {
        attrs: { for: 'weekday-' + index },
        children: [box, make('span', { text: name })],
      });
      dom.weekdayChecks.appendChild(label);
    });
  }

  function bindEvents() {
    dom.startDate.addEventListener('change', function () {
      state.startDate = dom.startDate.value;
      update();
    });
    dom.period.addEventListener('change', function () {
      state.months = Number(dom.period.value);
      update();
    });
    dom.budget.addEventListener('input', function () {
      state.budget = Number(dom.budget.value);
      setText(dom.budgetOutput, state.budget + '日');
      update();
    });
    dom.minLength.addEventListener('change', function () {
      state.minLength = Number(dom.minLength.value);
      update();
    });
    [
      [dom.companyHolidays, 'companyHolidays'],
      [dom.workOverrides, 'workOverrides'],
    ].forEach(function (pair) {
      pair[0].addEventListener('input', function () {
        state[pair[1]] = pair[0].value;
        update();
      });
    });

    dom.themeToggle.addEventListener('click', cycleTheme);

    dom.clearStorage.addEventListener('click', clearSettings);

    TAB_IDS.forEach(function (id, index) {
      var tab = document.getElementById('tab-' + id);
      tab.addEventListener('click', function () {
        state.tab = id;
        renderTabs();
        saveSettings();
      });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = (index + 1) % TAB_IDS.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = TAB_IDS.length - 1;
        if (next === null) return;
        event.preventDefault();
        state.tab = TAB_IDS[next];
        renderTabs();
        saveSettings();
        document.getElementById('tab-' + state.tab).focus();
      });
    });
  }

  // ---------------------------------------------------------------- 起動

  function init() {
    dom = {
      startDate: document.getElementById('start-date'),
      period: document.getElementById('period'),
      budget: document.getElementById('budget'),
      budgetOutput: document.getElementById('budget-output'),
      weekdayChecks: document.getElementById('weekday-checks'),
      companyHolidays: document.getElementById('company-holidays'),
      workOverrides: document.getElementById('work-overrides'),
      minLength: document.getElementById('min-length'),
      errorMessage: document.getElementById('error-message'),
      summaryHeading: document.getElementById('summary-heading'),
      summaryStats: document.getElementById('summary-stats'),
      plansList: document.getElementById('plans-list'),
      yearSummary: document.getElementById('year-summary'),
      yearList: document.getElementById('year-list'),
      calendarLegend: document.getElementById('calendar-legend'),
      calendarMonths: document.getElementById('calendar-months'),
      holidayTable: document.getElementById('holiday-table'),
      themeToggle: document.getElementById('theme-toggle'),
      clearStorage: document.getElementById('clear-storage'),
      storageStatus: document.getElementById('storage-status'),
    };

    dom.startDate.min = holidays.MIN_YEAR + '-01-01';
    dom.startDate.max = holidays.MAX_YEAR + '-12-31';
    dom.budget.max = '20';

    loadSettings();
    applyTheme(loadTheme());
    buildWeekdayChecks();
    syncFormFromState();
    bindEvents();
    recompute();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
