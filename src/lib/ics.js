// iCalendar (RFC 5545) 形式での書き出し。
// ラベルはユーザー入力なので、必ず escapeText / stripControls を通してから組み立てる。

import { addDays, formatShortJa } from './date.js';

const CRLF = '\r\n';
const MAX_OCTETS = 75;
const PROD_ID = '-//tsunagiyasumi//有給の連休プランナー//JA';

/** RFC 5545 で許可されない制御文字を除去する（タブは残す）。 */
export function stripControls(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** TEXT 値のエスケープ。バックスラッシュ → セミコロン/カンマ → 改行 の順で処理する。 */
export function escapeText(value) {
  return stripControls(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** 1行を 75 オクテットで折り返す（継続行は先頭にスペース1つ）。マルチバイト文字は分割しない。 */
export function foldLine(line) {
  const encoder = new TextEncoder();
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > MAX_OCTETS) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join(CRLF);
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
export function toDateValue(date) {
  return String(date).replace(/-/g, '');
}

/** Date → 'YYYYMMDDTHHMMSSZ' */
export function toTimestamp(now) {
  return `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
}

/** UID 生成関数を作る。テストからは決定的な関数を注入できる。 */
export function createUidFactory(scope = globalThis) {
  const webcrypto = scope && scope.crypto;
  let counter = 0;
  return () => {
    counter += 1;
    if (webcrypto && typeof webcrypto.randomUUID === 'function') {
      return `${webcrypto.randomUUID()}@tsunagiyasumi`;
    }
    if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
      const bytes = webcrypto.getRandomValues(new Uint8Array(16));
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex}@tsunagiyasumi`;
    }
    // 乱数源が無い環境向けの退避手段。UID は一意性のみが要件で、秘密値ではない。
    return `${Date.now().toString(36)}-${counter}@tsunagiyasumi`;
  };
}

/**
 * 有給取得日のカレンダーを組み立てる。
 * @param {object} options
 * @param {string[]} options.picks 取得する有給日
 * @param {Array<{start: string, end: string, length: number, leaveDates: string[]}>} [options.streaks]
 * @param {Date} [options.now] DTSTAMP に使う時刻
 * @param {() => string} [options.uid] UID 生成関数
 * @param {string} [options.summary] イベント名
 */
export function buildLeaveCalendar({
  picks,
  streaks = [],
  now = new Date(),
  uid = createUidFactory(),
  summary = '有給（つなぎやすみ）',
} = {}) {
  const dates = [...new Set(picks ?? [])].sort();
  const stamp = toTimestamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PROD_ID}`,
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText('つなぎやすみ')}`,
  ];

  for (const date of dates) {
    const streak = streaks.find((item) => date >= item.start && date <= item.end);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(uid())}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toDateValue(date)}`,
      `DTEND;VALUE=DATE:${toDateValue(addDays(date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(describe(date, streak))}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

function describe(date, streak) {
  if (!streak) return 'つなぎやすみで選んだ有給です。';
  const span = `${formatShortJa(streak.start)}〜${formatShortJa(streak.end)}`;
  return `${span} の${streak.length}連休をつくる有給（この連休で使う有給: ${streak.leaveDates.length}日）。`;
}
