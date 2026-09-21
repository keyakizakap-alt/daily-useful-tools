// 設定の正規化と検証。
// localStorage の中身は「利用者以外にも書き換えられうる外部入力」として扱い、
// 型・範囲・件数・文字数をすべて検証してから使う。例外は投げず、不正値は既定値へ倒す。

import { isValidDate, diffDays } from './date.js';
import { HOLIDAY_YEAR_MIN, HOLIDAY_YEAR_MAX } from './holidays.js';
import { DEFAULT_WEEKLY_OFF } from './calendar.js';
import { SCORE_MODES, DEFAULT_MODE } from './planner.js';

export const STORAGE_KEY = 'tsunagiyasumi:v1';

export const LIMITS = {
  budgetMax: 40,
  closuresMax: 20,
  closureSpanDays: 366,
  labelMaxLength: 40,
  picksMax: 400,
};

export const THEMES = ['auto', 'light', 'dark'];

export function defaultSettings(year) {
  return {
    year: clampYear(year),
    budget: 5,
    weeklyOff: [...DEFAULT_WEEKLY_OFF],
    useHolidays: true,
    mode: DEFAULT_MODE,
    closures: [],
    picks: [],
    picksTouched: false,
    theme: 'auto',
  };
}

function clampYear(value) {
  const year = Number.isInteger(value) ? value : HOLIDAY_YEAR_MIN;
  return Math.min(HOLIDAY_YEAR_MAX, Math.max(HOLIDAY_YEAR_MIN, year));
}

/** ユーザー入力・保存値を安全な設定オブジェクトに正規化する。 */
export function normalizeSettings(raw, { fallbackYear = HOLIDAY_YEAR_MIN } = {}) {
  const base = defaultSettings(fallbackYear);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const year = Number.isInteger(raw.year) ? clampYear(raw.year) : base.year;

  let budget = base.budget;
  if (typeof raw.budget === 'number' && Number.isFinite(raw.budget)) {
    budget = Math.min(LIMITS.budgetMax, Math.max(0, Math.floor(raw.budget)));
  }

  let weeklyOff = base.weeklyOff;
  if (Array.isArray(raw.weeklyOff) && raw.weeklyOff.length === 7) {
    weeklyOff = raw.weeklyOff.map((value) => value === true);
  }

  const mode = typeof raw.mode === 'string' && Object.hasOwn(SCORE_MODES, raw.mode) ? raw.mode : base.mode;
  const theme = THEMES.includes(raw.theme) ? raw.theme : base.theme;

  return {
    year,
    budget,
    weeklyOff,
    useHolidays: raw.useHolidays === undefined ? base.useHolidays : raw.useHolidays === true,
    mode,
    closures: normalizeClosures(raw.closures),
    picks: normalizePicks(raw.picks),
    picksTouched: raw.picksTouched === true,
    theme,
  };
}

export function normalizeLabel(value) {
  if (typeof value !== 'string') return '';
  // 制御文字（改行を含む）を除去してから長さを制限する。
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, LIMITS.labelMaxLength);
}

export function normalizeClosures(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (out.length >= LIMITS.closuresMax) break;
    if (!item || typeof item !== 'object') continue;
    const { start, end } = item;
    if (!isValidDate(start) || !isValidDate(end)) continue;
    if (end < start) continue;
    if (diffDays(start, end) + 1 > LIMITS.closureSpanDays) continue;
    const label = normalizeLabel(item.label) || '会社休業日';
    out.push({ start, end, label });
  }
  return out;
}

export function normalizePicks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const item of value) {
    if (seen.size >= LIMITS.picksMax) break;
    if (isValidDate(item)) seen.add(item);
  }
  return [...seen].sort();
}

/** localStorage から読み込む。読めない・壊れている場合も既定値で起動する。 */
export function loadSettings(storage, { fallbackYear } = {}) {
  let raw = null;
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (typeof text === 'string' && text !== '') raw = JSON.parse(text);
  } catch {
    raw = null; // 破損・JSON 不正・プライベートモードでの例外
  }
  return normalizeSettings(raw, { fallbackYear });
}

/** localStorage に保存する。保存できない環境でも操作は止めない。 */
export function saveSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings(storage) {
  try {
    storage?.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
