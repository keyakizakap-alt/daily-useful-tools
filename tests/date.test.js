import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ymd,
  parseDate,
  isValidDate,
  dayOfWeek,
  addDays,
  diffDays,
  eachDate,
  daysInMonth,
  yearOf,
  formatJa,
  formatShortJa,
} from '../src/lib/date.js';

test('ymd は0埋めした日付文字列を返す', () => {
  assert.equal(ymd(2026, 1, 1), '2026-01-01');
  assert.equal(ymd(2026, 12, 31), '2026-12-31');
});

test('存在しない日付を弾く', () => {
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-00-10'), false);
  assert.equal(isValidDate('2026-1-1'), false);
  assert.equal(isValidDate('20260101'), false);
  assert.equal(isValidDate(''), false);
  assert.equal(isValidDate(null), false);
  assert.equal(isValidDate(20260101), false);
  assert.equal(isValidDate('2024-02-29'), true); // 閏年
  assert.equal(isValidDate('2026-02-29'), false);
  assert.deepEqual(parseDate('2026-09-21'), { year: 2026, month: 9, day: 21 });
});

test('曜日が正しい', () => {
  assert.equal(dayOfWeek('2026-09-21'), 1); // 月曜
  assert.equal(dayOfWeek('2026-09-20'), 0); // 日曜
  assert.equal(dayOfWeek('2026-09-19'), 6); // 土曜
});

test('日付の加減算が月・年をまたぐ', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(diffDays('2026-01-01', '2026-12-31'), 364);
  assert.equal(diffDays('2026-09-21', '2026-09-21'), 0);
});

test('夏時間のある地域の設定でも日付がずれない', () => {
  // 内部で UTC 固定にしているため、TZ 環境変数の影響を受けない。
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(addDays('2026-03-08', 1), '2026-03-09');
    assert.equal(dayOfWeek('2026-03-08'), 0);
    process.env.TZ = 'Asia/Tokyo';
    assert.equal(addDays('2026-03-08', 1), '2026-03-09');
    assert.equal(dayOfWeek('2026-03-08'), 0);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('eachDate は両端を含む', () => {
  assert.deepEqual(eachDate('2026-01-01', '2026-01-03'), ['2026-01-01', '2026-01-02', '2026-01-03']);
  assert.deepEqual(eachDate('2026-01-01', '2026-01-01'), ['2026-01-01']);
  assert.equal(eachDate('2026-01-01', '2026-12-31').length, 365);
  assert.equal(eachDate('2024-01-01', '2024-12-31').length, 366);
});

test('月の日数', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 12), 31);
  assert.equal(daysInMonth(2026, 9), 30);
});

test('表示用の整形', () => {
  assert.equal(formatJa('2026-09-21'), '2026年9月21日(月)');
  assert.equal(formatJa('2026-09-21', { weekday: false }), '2026年9月21日');
  assert.equal(formatShortJa('2026-09-21'), '9/21(月)');
  assert.equal(yearOf('2026-09-21'), 2026);
});

test('不正な日付を渡すと例外になる', () => {
  assert.throws(() => addDays('2026-02-30', 1), TypeError);
  assert.throws(() => formatJa('bad'), TypeError);
});
