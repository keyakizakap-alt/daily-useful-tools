// 日付ユーティリティ。
// 日付は 'YYYY-MM-DD' 文字列を唯一の表現とし、計算は UTC でのみ行う。
// 端末のタイムゾーン設定によって祝日が1日ずれる事故を構造的に防ぐため、
// ローカル時刻の Date メソッド（getFullYear など）は使わない。

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;

/** 年・月(1始まり)・日から 'YYYY-MM-DD' を作る。 */
export function ymd(year, month, day) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${p2(month)}-${p2(day)}`;
}

/** 'YYYY-MM-DD' を {year, month, day} に分解する。不正な日付は null。 */
export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 2月30日のような存在しない日を弾く（UTC で往復させて一致を見る）
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function isValidDate(value) {
  return parseDate(value) !== null;
}

function toMs(value) {
  const parts = parseDate(value);
  if (!parts) throw new TypeError(`日付の形式が不正です: ${String(value)}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function fromMs(ms) {
  const d = new Date(ms);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 曜日を返す（0=日曜 … 6=土曜）。 */
export function dayOfWeek(value) {
  return new Date(toMs(value)).getUTCDay();
}

/** n 日後（負数なら n 日前）の日付。 */
export function addDays(value, n) {
  return fromMs(toMs(value) + n * MS_PER_DAY);
}

/** to - from を日数で返す。 */
export function diffDays(from, to) {
  return Math.round((toMs(to) - toMs(from)) / MS_PER_DAY);
}

/** from から to まで（両端を含む）の日付配列。 */
export function eachDate(from, to) {
  const out = [];
  const last = toMs(to);
  for (let ms = toMs(from); ms <= last; ms += MS_PER_DAY) out.push(fromMs(ms));
  return out;
}

/** その月の日数。 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function yearOf(value) {
  const parts = parseDate(value);
  if (!parts) throw new TypeError(`日付の形式が不正です: ${String(value)}`);
  return parts.year;
}

/** '2026年9月21日(月)' の形式にする。 */
export function formatJa(value, { weekday = true } = {}) {
  const parts = parseDate(value);
  if (!parts) throw new TypeError(`日付の形式が不正です: ${String(value)}`);
  const base = `${parts.year}年${parts.month}月${parts.day}日`;
  return weekday ? `${base}(${WEEKDAY_JA[dayOfWeek(value)]})` : base;
}

/** '9/21(月)' の形式にする。 */
export function formatShortJa(value) {
  const parts = parseDate(value);
  if (!parts) throw new TypeError(`日付の形式が不正です: ${String(value)}`);
  return `${parts.month}/${parts.day}(${WEEKDAY_JA[dayOfWeek(value)]})`;
}
