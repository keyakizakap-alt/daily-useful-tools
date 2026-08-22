/**
 * 時刻ユーティリティ。
 * すべて副作用のない純関数で、ブラウザからも Node からも import できる。
 *
 * 時刻は「その日の 00:00 からの経過分」を表す整数（0〜1439）で扱う。
 * スケジュール計算では 0 未満（前日）や 1440 以上（翌日）になり得るため、
 * 表示側で正規化する。
 */

const MINUTES_PER_DAY = 24 * 60;

/**
 * "18:30" 形式の文字列を、00:00 からの経過分に変換する。
 * 全角数字と全角コロンも受け付ける（日本語入力での打ち間違いを救済）。
 *
 * @param {string} text 時刻文字列
 * @returns {number} 00:00 からの経過分（0〜1439）
 * @throws {Error} 形式が不正な場合
 */
export function parseTime(text) {
  if (typeof text !== 'string') {
    throw new Error('時刻は文字列で指定してください');
  }
  const normalized = toHalfWidth(text).trim();
  const matched = /^(\d{1,2}):(\d{1,2})$/.exec(normalized);
  if (!matched) {
    throw new Error(`時刻の形式が不正です: "${text}"（例: 18:30）`);
  }
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (hour > 23) {
    throw new Error(`時が範囲外です: ${hour}（0〜23で指定してください）`);
  }
  if (minute > 59) {
    throw new Error(`分が範囲外です: ${minute}（0〜59で指定してください）`);
  }
  return hour * 60 + minute;
}

/**
 * 経過分を "18:30" 形式に変換する。
 * 負の値や 1440 以上の値は 24 時間で正規化する（前日・翌日にまたがる場合）。
 *
 * @param {number} minutes 00:00 からの経過分
 * @returns {string} "HH:MM"
 */
export function formatTime(minutes) {
  assertFiniteNumber(minutes, '時刻');
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * 基準日から何日ずれているかを返す。前日なら -1、翌日なら +1。
 * 「調理開始が前日の23:40になってしまう」ケースをUIで警告するために使う。
 *
 * @param {number} minutes 00:00 からの経過分
 * @returns {number} 日のオフセット
 */
export function dayOffset(minutes) {
  assertFiniteNumber(minutes, '時刻');
  return Math.floor(Math.round(minutes) / MINUTES_PER_DAY);
}

/**
 * 時刻を日本語の表示用文字列にする。前日・翌日には接頭辞を付ける。
 *
 * @param {number} minutes 00:00 からの経過分
 * @returns {string} 例: "18:30" / "前日 23:40" / "翌日 00:15"
 */
export function formatTimeWithDay(minutes) {
  const offset = dayOffset(minutes);
  const base = formatTime(minutes);
  if (offset === 0) return base;
  if (offset === -1) return `前日 ${base}`;
  if (offset === 1) return `翌日 ${base}`;
  return offset < 0 ? `${-offset}日前 ${base}` : `${offset}日後 ${base}`;
}

/**
 * 分数を日本語の所要時間表記にする。
 *
 * @param {number} minutes 分
 * @returns {string} 例: "45分" / "1時間30分" / "2時間"
 */
export function formatDuration(minutes) {
  assertFiniteNumber(minutes, '所要時間');
  const total = Math.round(minutes);
  if (total < 0) {
    throw new Error(`所要時間に負の値は指定できません: ${minutes}`);
  }
  if (total === 0) return '0分';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

/**
 * 全角の数字とコロンを半角に変換する。
 *
 * @param {string} text
 * @returns {string}
 */
export function toHalfWidth(text) {
  return String(text)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':');
}

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}は数値で指定してください: ${value}`);
  }
}
