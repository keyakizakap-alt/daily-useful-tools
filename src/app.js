// つなぎやすみ — UI 層。
// 計算は src/lib/* の純粋関数に委ね、ここは DOM の組み立てとイベント処理だけを担当する。
// DOM 生成は textContent / createElement のみで行う（innerHTML は使わない）。

import { ymd, dayOfWeek, formatJa, formatShortJa, daysInMonth, yearOf, isValidDate, diffDays, WEEKDAY_JA } from './lib/date.js';
import { HOLIDAY_YEAR_MIN, HOLIDAY_YEAR_MAX, isConfirmedYear } from './lib/holidays.js';
import { buildTimeline, indexByDate } from './lib/calendar.js';
import { MIN_STREAK, SCORE_MODES, findStreaks, summarize, listOpportunities, optimize } from './lib/planner.js';
import { buildLeaveCalendar } from './lib/ics.js';
import { LIMITS, THEMES, loadSettings, saveSettings, clearSettings, normalizeLabel, defaultSettings } from './lib/settings.js';

const THEME_LABEL = { auto: '自動', light: 'ライト', dark: 'ダーク' };

const state = {
  settings: null,
  timeline: [],
  index: new Map(),
  picks: [],
  today: todayLocalIso(),
};

function todayLocalIso() {
  // 「今日」だけは利用者のローカル時刻で判断する。
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function $(id) {
  return document.getElementById(id);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') for (const [k, v] of Object.entries(value)) node.dataset[k] = v;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* ---------------------------------------------------------------- 起動 */

function boot() {
  const thisYear = yearOf(state.today);
  const loaded = loadSettings(window.localStorage, { fallbackYear: thisYear });
  // 過ぎた年の設定が残っていても、開いた年の計画から始められるようにする。
  if (loaded.year < thisYear) {
    loaded.year = Math.min(HOLIDAY_YEAR_MAX, thisYear);
    loaded.picks = [];
    loaded.picksTouched = false;
  }
  state.settings = loaded;

  buildYearOptions();
  buildWeekdayToggles();
  applyTheme();
  bindEvents();
  syncControls();
  recompute();
}

function buildYearOptions() {
  const select = $('year');
  clear(select);
  for (let y = HOLIDAY_YEAR_MIN; y <= HOLIDAY_YEAR_MAX; y += 1) {
    select.append(el('option', { value: String(y), text: `${y}年` }));
  }
}

function buildWeekdayToggles() {
  const box = $('weeklyOff');
  clear(box);
  box.append(el('legend', { text: '休みの曜日（週休）' }));
  WEEKDAY_JA.forEach((name, dow) => {
    const input = el('input', { type: 'checkbox', id: `dow-${dow}`, dataset: { dow: String(dow) } });
    box.append(el('label', { class: 'dow-toggle', for: `dow-${dow}` }, [input, name]));
  });
}

function bindEvents() {
  $('year').addEventListener('change', (event) => {
    update({ year: Number(event.target.value), picks: [], picksTouched: false });
  });
  $('budget').addEventListener('change', (event) => {
    const value = Math.min(LIMITS.budgetMax, Math.max(0, Math.floor(Number(event.target.value) || 0)));
    event.target.value = String(value);
    update({ budget: value, picksTouched: false });
  });
  $('mode').addEventListener('change', (event) => {
    update({ mode: event.target.value, picksTouched: false });
  });
  $('weeklyOff').addEventListener('change', () => {
    const weeklyOff = WEEKDAY_JA.map((_, dow) => $(`dow-${dow}`).checked);
    update({ weeklyOff, picksTouched: false });
  });
  $('useHolidays').addEventListener('change', (event) => {
    update({ useHolidays: event.target.checked, picksTouched: false });
  });
  $('applyPlan').addEventListener('click', () => update({ picksTouched: false }));
  $('clearPicks').addEventListener('click', () => update({ picks: [], picksTouched: true }));
  $('downloadIcs').addEventListener('click', downloadIcs);
  $('resetAll').addEventListener('click', resetAll);
  $('themeToggle').addEventListener('click', cycleTheme);
  $('months').addEventListener('click', onCalendarClick);
  $('ranking').addEventListener('click', onRankingClick);
  $('closureAdd').addEventListener('click', addClosure);
  $('closures').addEventListener('click', onClosureListClick);
}

function syncControls() {
  const s = state.settings;
  $('year').value = String(s.year);
  $('budget').value = String(s.budget);
  $('budget').max = String(LIMITS.budgetMax);
  $('mode').value = s.mode;
  $('useHolidays').checked = s.useHolidays;
  WEEKDAY_JA.forEach((_, dow) => {
    $(`dow-${dow}`).checked = s.weeklyOff[dow] === true;
  });
  $('themeToggle').textContent = `テーマ: ${THEME_LABEL[s.theme]}`;
}

function update(patch) {
  state.settings = { ...state.settings, ...patch };
  saveSettings(window.localStorage, state.settings);
  syncControls();
  recompute();
}

function applyTheme() {
  const { theme } = state.settings;
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length];
  state.settings = { ...state.settings, theme: next };
  saveSettings(window.localStorage, state.settings);
  applyTheme();
  syncControls();
}

function resetAll() {
  clearSettings(window.localStorage);
  state.settings = defaultSettings(yearOf(state.today));
  applyTheme();
  syncControls();
  recompute();
}

/* ------------------------------------------------------------ 再計算 */

function windowOf(year) {
  // 年末年始をまたぐ連休を数えるため、前後にはみ出した範囲で組み立てる。
  return { start: ymd(year - 1, 12, 1), end: ymd(year + 1, 1, 31) };
}

function recompute() {
  const s = state.settings;
  const span = windowOf(s.year);
  state.timeline = buildTimeline({
    start: span.start,
    end: span.end,
    weeklyOff: s.weeklyOff,
    useHolidays: s.useHolidays,
    closures: s.closures,
    selectableFrom: ymd(s.year, 1, 1),
    selectableTo: ymd(s.year, 12, 31),
  });
  state.index = indexByDate(state.timeline);

  const selectable = new Set(
    state.timeline.filter((entry) => entry.selectable).map((entry) => entry.date),
  );

  if (s.picksTouched) {
    state.picks = s.picks.filter((date) => selectable.has(date));
  } else {
    state.picks = optimize(state.timeline, { budget: s.budget, mode: s.mode }).picks;
  }
  if (state.picks.join(',') !== s.picks.join(',')) {
    state.settings = { ...s, picks: state.picks };
    saveSettings(window.localStorage, state.settings);
  }

  render();
}

function render() {
  const s = state.settings;
  const within = { from: ymd(s.year, 1, 1), to: ymd(s.year, 12, 31) };
  const stats = summarize(state.timeline, state.picks, { within });
  renderSummary(stats, within);
  renderStreaks(stats.streaks);
  renderRanking();
  renderCalendar(stats.streaks);
  renderClosures();
}

function renderSummary(stats, within) {
  const s = state.settings;
  const used = state.picks.filter((date) => date >= within.from && date <= within.to).length;
  const offDays = state.timeline.filter(
    (entry) => entry.date >= within.from && entry.date <= within.to && entry.off,
  ).length;

  const lead =
    stats.count === 0
      ? `この設定では ${MIN_STREAK}日以上の連休ができません。休みの曜日や有給の日数を見直してみてください。`
      : `有給${used}日で、${s.year}年に${MIN_STREAK}日以上の連休が${stats.count}回。いちばん長いのは${stats.longest}連休です。`;
  $('summaryLead').textContent = lead;

  const list = $('stats');
  clear(list);
  for (const [term, value, unit] of [
    [`${MIN_STREAK}日以上の連休`, stats.count, '回'],
    ['最長の連休', stats.longest, '日'],
    ['使う有給', used, `日 / ${s.budget}日`],
    ['年間の休日（有給を除く）', offDays, '日'],
  ]) {
    list.append(
      el('div', { class: 'stat' }, [
        el('dt', { text: term }),
        el('dd', {}, [String(value), el('span', { class: 'unit', text: unit })]),
      ]),
    );
  }

  const warn = $('warn');
  clear(warn);
  const messages = [];
  if (used > s.budget) messages.push(`選んでいる有給が予算より${used - s.budget}日多くなっています。`);
  if (!isConfirmedYear(s.year, state.today)) {
    messages.push(
      `${s.year}年の祝日は現行法にもとづく予測です。国民の祝日は前年2月の官報で確定します。`,
    );
  }
  if (!state.settings.weeklyOff.some(Boolean) && !state.settings.useHolidays) {
    messages.push('休みの曜日が未設定で、祝日も休みにしない設定です。連休は有給だけで作ることになります。');
  }
  warn.hidden = messages.length === 0;
  for (const message of messages) warn.append(el('p', { class: 'warn', text: message }));
}

function renderStreaks(streaks) {
  const list = $('streaks');
  clear(list);
  if (streaks.length === 0) {
    list.append(el('li', { class: 'note', text: '該当する連休はありません。' }));
    return;
  }
  for (const streak of streaks) {
    const leave = streak.leaveDates.length;
    list.append(
      el('li', { class: leave > 0 ? 'streak' : 'streak no-leave' }, [
        el('span', { class: 'len', text: `${streak.length}連休` }),
        el('span', { class: 'span', text: `${formatShortJa(streak.start)}〜${formatShortJa(streak.end)}` }),
        el('span', {
          class: 'leave',
          text:
            leave > 0
              ? `有給${leave}日（${streak.leaveDates.map(formatShortJa).join('・')}）`
              : '有給なし',
        }),
      ]),
    );
  }
}

function renderRanking() {
  const s = state.settings;
  const picked = new Set(state.picks);
  const rows = listOpportunities(state.timeline, {
    maxCost: Math.max(1, s.budget),
    mode: s.mode,
    limit: 12,
  }).filter((item) => item.dates.every((date) => date >= ymd(s.year, 1, 1) && date <= ymd(s.year, 12, 31)));

  const body = $('rankingBody');
  clear(body);
  if (rows.length === 0) {
    $('rankingEmpty').hidden = false;
    return;
  }
  $('rankingEmpty').hidden = true;

  for (const row of rows) {
    const isPicked = row.dates.every((date) => picked.has(date));
    body.append(
      el('tr', { class: isPicked ? 'picked' : null }, [
        el('td', { class: 'num', text: `${row.cost}日` }),
        el('td', { class: 'num', text: `${row.streakLength}連休` }),
        el('td', { class: 'num', text: row.baseLength === 0 ? '—' : `${row.baseLength}日` }),
        el('td', { text: row.dates.map(formatShortJa).join('・') }),
        el('td', { text: row.note }),
        el('td', {}, [
          el('button', {
            class: 'button',
            type: 'button',
            dataset: { dates: row.dates.join(',') },
            text: isPicked ? '選択済み' : 'この日を取る',
            disabled: isPicked ? true : null,
          }),
        ]),
      ]),
    );
  }
}

function renderCalendar(streaks) {
  const s = state.settings;
  const inStreak = new Set();
  for (const streak of streaks) for (const date of streak.days) inStreak.add(date);
  const picked = new Set(state.picks);

  const container = $('months');
  clear(container);

  for (let month = 1; month <= 12; month += 1) {
    const section = el('section', { class: 'month' });
    const holidayCount = countHolidays(s.year, month);
    section.append(
      el('h3', {}, [
        `${month}月`,
        el('span', { class: 'month-note', text: holidayCount > 0 ? `祝日${holidayCount}日` : '' }),
      ]),
    );

    // 各日のセルが完全な日付を aria-label で読み上げるため、表としての ARIA 構造は付けない。
    const grid = el('div', { class: 'grid' });
    WEEKDAY_JA.forEach((name, dow) => {
      const variant = dow === 0 ? ' sun' : dow === 6 ? ' sat' : '';
      grid.append(el('div', { class: `dow${variant}`, text: name, 'aria-hidden': 'true' }));
    });

    const first = ymd(s.year, month, 1);
    for (let i = 0; i < dayOfWeek(first); i += 1) {
      grid.append(el('div', { class: 'day empty', 'aria-hidden': 'true' }));
    }

    for (let day = 1; day <= daysInMonth(s.year, month); day += 1) {
      const date = ymd(s.year, month, day);
      grid.append(dayCell(date, day, { picked, inStreak }));
    }
    section.append(grid);
    container.append(section);
  }
}

function countHolidays(year, month) {
  const prefix = ymd(year, month, 1).slice(0, 7);
  return state.timeline.filter((entry) => entry.date.startsWith(prefix) && entry.holiday).length;
}

function dayCell(date, day, { picked, inStreak }) {
  const entry = state.index.get(date);
  if (!entry) return el('div', { class: 'day empty', 'aria-hidden': 'true' });

  const isPicked = picked.has(date);
  const classes = ['day'];
  if (entry.off) classes.push('off');
  // 祝日でも出勤する設定のときは、休みと見分けがつくよう文字色だけを変える。
  if (entry.holiday) classes.push(entry.off ? 'holiday' : 'holiday-work');
  if (isPicked) classes.push('leave');
  if (inStreak.has(date)) classes.push('in-streak');
  if (date === state.today) classes.push('today');

  const workingHoliday = entry.holiday && !entry.labels.includes(entry.holiday) ? `${entry.holiday}（出勤日）` : null;
  const description = [formatJa(date), ...entry.labels, workingHoliday, isPicked ? '有給' : null]
    .filter(Boolean)
    .join(' ');

  const mark = markOf(entry, isPicked);
  const children = [String(day), mark ? el('span', { class: 'mark', text: mark }) : null];

  if (!entry.selectable) {
    return el('div', { class: classes.join(' '), 'aria-label': description }, children);
  }
  return el(
    'button',
    {
      type: 'button',
      class: classes.join(' '),
      dataset: { date },
      'aria-pressed': isPicked ? 'true' : 'false',
      'aria-label': `${description}（押すと有給の予定を切り替え）`,
    },
    children,
  );
}

// 色だけに頼らないよう、セルに1文字の記号を添える。
function markOf(entry, isPicked) {
  if (isPicked) return '有';
  if (entry.holiday) return '祝';
  if (entry.off && !entry.labels.includes('週休')) return '休';
  return '';
}

function onCalendarClick(event) {
  const button = event.target.closest('button.day');
  if (!button || !button.dataset.date) return;
  togglePick(button.dataset.date);
}

function onRankingClick(event) {
  const button = event.target.closest('button[data-dates]');
  if (!button) return;
  const dates = button.dataset.dates.split(',').filter(isValidDate);
  const next = new Set(state.picks);
  for (const date of dates) {
    if (state.index.get(date)?.selectable) next.add(date);
  }
  update({ picks: [...next].sort(), picksTouched: true });
}

function togglePick(date) {
  const entry = state.index.get(date);
  if (!entry || !entry.selectable) return;
  const next = new Set(state.picks);
  if (next.has(date)) next.delete(date);
  else next.add(date);
  update({ picks: [...next].sort(), picksTouched: true });
}

/* -------------------------------------------------------- 会社休業日 */

function renderClosures() {
  const list = $('closures');
  clear(list);
  const { closures } = state.settings;
  if (closures.length === 0) {
    list.append(el('li', { class: 'note', text: '登録された休業日はありません。' }));
    return;
  }
  closures.forEach((closure, i) => {
    list.append(
      el('li', { class: 'closure' }, [
        el('span', { text: closure.label }),
        el('span', {
          class: 'span',
          text:
            closure.start === closure.end
              ? formatJa(closure.start)
              : `${formatJa(closure.start)} 〜 ${formatJa(closure.end)}`,
        }),
        el('button', {
          type: 'button',
          class: 'button',
          dataset: { removeIndex: String(i) },
          text: '削除',
          'aria-label': `${closure.label} を削除`,
        }),
      ]),
    );
  });
}

function onClosureListClick(event) {
  const button = event.target.closest('button[data-remove-index]');
  if (!button) return;
  const index = Number(button.dataset.removeIndex);
  const closures = state.settings.closures.filter((_, i) => i !== index);
  update({ closures, picksTouched: false });
}

function addClosure() {
  const startInput = $('closureStart');
  const endInput = $('closureEnd');
  const labelInput = $('closureLabel');
  const error = $('closureError');
  const start = startInput.value;
  const end = endInput.value || start;
  const label = normalizeLabel(labelInput.value) || '会社休業日';

  const problem = validateClosure(start, end);
  error.textContent = problem ?? '';
  if (problem) return;

  update({
    closures: [...state.settings.closures, { start, end, label }].sort((a, b) => (a.start < b.start ? -1 : 1)),
    picksTouched: false,
  });
  startInput.value = '';
  endInput.value = '';
  labelInput.value = '';
}

function validateClosure(start, end) {
  if (!isValidDate(start)) return '開始日を入力してください。';
  if (!isValidDate(end)) return '終了日の形式が正しくありません。';
  if (end < start) return '終了日は開始日以降にしてください。';
  if (diffDays(start, end) + 1 > LIMITS.closureSpanDays) return '1件あたりの期間は366日までです。';
  if (state.settings.closures.length >= LIMITS.closuresMax) {
    return `休業日は${LIMITS.closuresMax}件まで登録できます。`;
  }
  return null;
}

/* -------------------------------------------------------------- 書き出し */

function downloadIcs() {
  const picksInYear = state.picks;
  if (picksInYear.length === 0) {
    $('downloadNote').textContent = '書き出す有給日がありません。カレンダーから日を選んでください。';
    return;
  }
  const streaks = findStreaks(state.timeline, picksInYear).filter((streak) => streak.leaveDates.length > 0);
  const text = buildLeaveCalendar({ picks: picksInYear, streaks });
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `tsunagiyasumi-${state.settings.year}.ics` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $('downloadNote').textContent = `${picksInYear.length}日ぶんの有給を書き出しました。`;
}

/* ----------------------------------------------------------------- */

function populateModes() {
  const select = $('mode');
  clear(select);
  for (const [value, info] of Object.entries(SCORE_MODES)) {
    select.append(el('option', { value, text: info.label }));
  }
}

populateModes();
boot();
