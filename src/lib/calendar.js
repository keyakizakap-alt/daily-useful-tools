// 休日タイムラインの構築。
// 週休曜日・祝日・会社の休業日を重ね合わせ、1日ごとの「休みかどうか」を決める。

import { eachDate, dayOfWeek, isValidDate } from './date.js';
import { holidaysInRange } from './holidays.js';

export const DEFAULT_WEEKLY_OFF = [true, false, false, false, false, false, true]; // 日〜土

/**
 * @param {object} options
 * @param {string} options.start 開始日 'YYYY-MM-DD'
 * @param {string} options.end   終了日 'YYYY-MM-DD'（両端を含む）
 * @param {boolean[]} options.weeklyOff 長さ7の配列（0=日曜）。true が週休
 * @param {boolean} [options.useHolidays=true] 祝日を休みとするか
 * @param {Array<{start: string, end: string, label?: string}>} [options.closures] 会社の休業日
 * @param {string} [options.selectableFrom] 有給を取れる範囲の開始（既定は start）
 * @param {string} [options.selectableTo] 有給を取れる範囲の終了（既定は end）
 * @returns {Array<{date: string, dow: number, off: boolean, selectable: boolean,
 *                  holiday: string|null, labels: string[]}>}
 */
export function buildTimeline({
  start,
  end,
  weeklyOff = DEFAULT_WEEKLY_OFF,
  useHolidays = true,
  closures = [],
  selectableFrom = start,
  selectableTo = end,
}) {
  if (!isValidDate(start) || !isValidDate(end)) throw new TypeError('start / end が不正です');
  if (end < start) throw new RangeError('end は start 以降である必要があります');
  if (!Array.isArray(weeklyOff) || weeklyOff.length !== 7) {
    throw new TypeError('weeklyOff は長さ7の配列である必要があります');
  }

  // 祝日は「休みにするか」に関わらず常に引く。祝日も出勤する働き方でも、
  // 世間が休む日がどこかは計画の材料になるため、表示だけは残す。
  const holidays = holidaysInRange(start, end);
  const closureLabels = buildClosureIndex(closures, start, end);

  return eachDate(start, end).map((date) => {
    const dow = dayOfWeek(date);
    const labels = [];
    const holiday = holidays.get(date) ?? null;

    if (weeklyOff[dow]) labels.push('週休');
    if (holiday && useHolidays) labels.push(holiday.name);
    const closure = closureLabels.get(date);
    if (closure) labels.push(closure);

    const off = labels.length > 0;
    return {
      date,
      dow,
      off,
      selectable: !off && date >= selectableFrom && date <= selectableTo,
      holiday: holiday ? holiday.name : null,
      labels,
    };
  });
}

function buildClosureIndex(closures, start, end) {
  const index = new Map();
  if (!Array.isArray(closures)) return index;
  for (const closure of closures) {
    if (!closure || !isValidDate(closure.start) || !isValidDate(closure.end)) continue;
    if (closure.end < closure.start) continue;
    const from = closure.start > start ? closure.start : start;
    const to = closure.end < end ? closure.end : end;
    if (to < from) continue;
    const label = typeof closure.label === 'string' && closure.label.trim() !== '' ? closure.label : '会社休業日';
    for (const date of eachDate(from, to)) {
      if (!index.has(date)) index.set(date, label);
    }
  }
  return index;
}

/** タイムラインから日付→エントリの索引を作る。 */
export function indexByDate(timeline) {
  return new Map(timeline.map((entry) => [entry.date, entry]));
}
