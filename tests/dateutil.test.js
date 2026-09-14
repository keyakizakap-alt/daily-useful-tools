'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dateutil = require('../src/lib/dateutil.js');

test('isLeapYear: 4年・100年・400年の規則', () => {
  assert.equal(dateutil.isLeapYear(2024), true);
  assert.equal(dateutil.isLeapYear(2025), false);
  assert.equal(dateutil.isLeapYear(1900), false);
  assert.equal(dateutil.isLeapYear(2000), true);
  assert.equal(dateutil.isLeapYear(2100), false);
});

test('daysInMonth: 各月と閏年の2月', () => {
  assert.equal(dateutil.daysInMonth(2026, 1), 31);
  assert.equal(dateutil.daysInMonth(2026, 2), 28);
  assert.equal(dateutil.daysInMonth(2024, 2), 29);
  assert.equal(dateutil.daysInMonth(2026, 4), 30);
  assert.equal(dateutil.daysInMonth(2026, 12), 31);
});

test('isValidDate: 形式と実在を両方みる', () => {
  assert.equal(dateutil.isValidDate('2026-09-14'), true);
  assert.equal(dateutil.isValidDate('2024-02-29'), true);
  assert.equal(dateutil.isValidDate('2026-02-29'), false, '閏年でない2月29日');
  assert.equal(dateutil.isValidDate('2026-02-30'), false);
  assert.equal(dateutil.isValidDate('2026-13-01'), false);
  assert.equal(dateutil.isValidDate('2026-00-10'), false);
  assert.equal(dateutil.isValidDate('2026-09-00'), false);
  assert.equal(dateutil.isValidDate('2026-9-14'), false, '0埋めなしは不許可');
  assert.equal(dateutil.isValidDate('2026/09/14'), false);
  assert.equal(dateutil.isValidDate('2026-09-14T00:00:00Z'), false);
  assert.equal(dateutil.isValidDate(''), false);
  assert.equal(dateutil.isValidDate(null), false);
  assert.equal(dateutil.isValidDate(20260914), false);
});

test('assertDate: 不正な日付は日本語メッセージで例外', () => {
  assert.throws(() => dateutil.assertDate('2026-02-30', '開始日'), /開始日の形式が正しくありません/);
});

test('toDayNumber / fromDayNumber: 相互変換が一致する', () => {
  assert.equal(dateutil.toDayNumber('1970-01-01'), 0);
  assert.equal(dateutil.fromDayNumber(0), '1970-01-01');
  assert.equal(dateutil.toDayNumber('2026-09-14'), 20710);
  assert.equal(dateutil.fromDayNumber(dateutil.toDayNumber('2026-09-14')), '2026-09-14');
  assert.equal(dateutil.fromDayNumber(-1), '1969-12-31');
});

test('addDays: 月末・年末・閏日をまたぐ', () => {
  assert.equal(dateutil.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(dateutil.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(dateutil.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(dateutil.addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(dateutil.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dateutil.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(dateutil.addDays('2026-09-14', 0), '2026-09-14');
  assert.equal(dateutil.addDays('2026-09-14', 365), '2027-09-14');
});

test('addDays: 整数以外は例外', () => {
  assert.throws(() => dateutil.addDays('2026-09-14', 1.5), /整数/);
  assert.throws(() => dateutil.addDays('2026-09-14', NaN), /整数/);
});

test('diffDays: 差分日数', () => {
  assert.equal(dateutil.diffDays('2026-09-14', '2026-09-21'), 7);
  assert.equal(dateutil.diffDays('2026-09-21', '2026-09-14'), -7);
  assert.equal(dateutil.diffDays('2024-01-01', '2025-01-01'), 366);
  assert.equal(dateutil.diffDays('2025-01-01', '2026-01-01'), 365);
});

test('addMonths: 月末は丸め、年をまたぐ', () => {
  assert.equal(dateutil.addMonths('2026-09-14', 12), '2027-09-14');
  assert.equal(dateutil.addMonths('2026-09-14', 3), '2026-12-14');
  assert.equal(dateutil.addMonths('2026-09-14', 4), '2027-01-14');
  assert.equal(dateutil.addMonths('2026-01-31', 1), '2026-02-28', '存在しない日は末日に丸める');
  assert.equal(dateutil.addMonths('2024-01-31', 1), '2024-02-29', '閏年');
  assert.equal(dateutil.addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(dateutil.addMonths('2026-01-15', -1), '2025-12-15');
  assert.equal(dateutil.addMonths('2026-09-14', 0), '2026-09-14');
  assert.throws(() => dateutil.addMonths('2026-09-14', 1.5), /整数/);
});

test('addMonths + diffDays: 1年の日数が正しく出る', () => {
  assert.equal(dateutil.diffDays('2026-09-14', dateutil.addMonths('2026-09-14', 12)), 365);
  assert.equal(dateutil.diffDays('2024-01-01', dateutil.addMonths('2024-01-01', 12)), 366);
});

test('weekdayOf: 既知の曜日と一致する', () => {
  assert.equal(dateutil.weekdayOf('1970-01-01'), 4, '1970-01-01は木曜');
  assert.equal(dateutil.weekdayOf('2026-01-01'), 4, '2026-01-01は木曜');
  assert.equal(dateutil.weekdayOf('2026-09-14'), 1, '2026-09-14は月曜');
  assert.equal(dateutil.weekdayOf('2026-05-03'), 0, '2026-05-03は日曜');
  assert.equal(dateutil.weekdayOf('2026-09-19'), 6, '2026-09-19は土曜');
  assert.equal(dateutil.weekdayOf('1969-12-31'), 3, '1969-12-31は水曜');
});

test('rangeDays: 連続した日付配列', () => {
  assert.deepEqual(dateutil.rangeDays('2026-02-27', 3), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.equal(dateutil.rangeDays('2026-01-01', 365).length, 365);
  assert.equal(dateutil.rangeDays('2026-01-01', 365).at(-1), '2026-12-31');
  assert.throws(() => dateutil.rangeDays('2026-01-01', 0), /1 以上/);
  assert.throws(() => dateutil.rangeDays('2026-01-01', -5), /1 以上/);
});

test('nthWeekdayOfMonth: ハッピーマンデーの算出', () => {
  assert.equal(dateutil.nthWeekdayOfMonth(2026, 1, 1, 2), '2026-01-12');
  assert.equal(dateutil.nthWeekdayOfMonth(2026, 7, 1, 3), '2026-07-20');
  assert.equal(dateutil.nthWeekdayOfMonth(2026, 9, 1, 3), '2026-09-21');
  assert.equal(dateutil.nthWeekdayOfMonth(2026, 10, 1, 2), '2026-10-12');
  // 月初が対象曜日のとき
  assert.equal(dateutil.nthWeekdayOfMonth(2026, 6, 1, 1), '2026-06-01');
  assert.throws(() => dateutil.nthWeekdayOfMonth(2026, 2, 1, 5), /存在しません/);
});

test('todayInJapan: 実行環境のTZに関わらずJSTの日付を返す', () => {
  // 2026-09-14 15:30 JST = 2026-09-14 06:30 UTC
  const ms = Date.UTC(2026, 8, 14, 6, 30);
  assert.equal(dateutil.todayInJapan(ms), '2026-09-14');
  // 2026-09-15 00:30 JST = 2026-09-14 15:30 UTC（UTCではまだ14日）
  assert.equal(dateutil.todayInJapan(Date.UTC(2026, 8, 14, 15, 30)), '2026-09-15');
  // 2026-09-14 08:00 JST = 2026-09-13 23:00 UTC
  assert.equal(dateutil.todayInJapan(Date.UTC(2026, 8, 13, 23, 0)), '2026-09-14');
});

test('formatJa / formatShortJa: 日本語表記', () => {
  assert.equal(dateutil.formatJa('2026-09-14'), '2026年9月14日(月)');
  assert.equal(dateutil.formatJa('2026-09-14', { omitYear: true }), '9月14日(月)');
  assert.equal(dateutil.formatJa('2026-09-14', { omitWeekday: true }), '2026年9月14日');
  assert.equal(dateutil.formatShortJa('2026-09-14'), '9/14(月)');
  assert.equal(dateutil.formatShortJa('2026-01-01'), '1/1(木)');
});

test('タイムゾーン非依存: 日付演算が実行環境のTZに影響されない', () => {
  // 単体テストは TZ を変えて 3 回実行する（npm run test:tz）。
  // ここではローカル Date を経由していないことを、境界時刻でも結果が同じであることで確認する。
  const results = ['2026-01-01', '2026-06-30', '2026-12-31'].map((date) => ({
    date,
    weekday: dateutil.weekdayOf(date),
    dayNumber: dateutil.toDayNumber(date),
    next: dateutil.addDays(date, 1),
  }));
  assert.deepEqual(results, [
    { date: '2026-01-01', weekday: 4, dayNumber: 20454, next: '2026-01-02' },
    { date: '2026-06-30', weekday: 2, dayNumber: 20634, next: '2026-07-01' },
    { date: '2026-12-31', weekday: 4, dayNumber: 20818, next: '2027-01-01' },
  ]);
});
