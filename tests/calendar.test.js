'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calendar = require('../src/lib/calendar.js');

function dayOf(result, date) {
  return result.days.find((day) => day.date === date);
}

test('既定は土日休み', () => {
  const result = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 7 });
  assert.equal(dayOf(result, '2026-09-14').off, false, '月曜は勤務日');
  assert.equal(dayOf(result, '2026-09-19').off, true, '土曜は休み');
  assert.equal(dayOf(result, '2026-09-19').kind, 'weekly');
  assert.equal(dayOf(result, '2026-09-19').label, '土曜（週休）');
  assert.equal(dayOf(result, '2026-09-20').off, true, '日曜は休み');
});

test('祝日・振替休日・国民の休日が休みになり種別が付く', () => {
  const result = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 14 });
  assert.deepEqual(
    ['2026-09-21', '2026-09-22', '2026-09-23'].map((date) => {
      const day = dayOf(result, date);
      return [day.kind, day.label, day.off];
    }),
    [
      ['holiday', '敬老の日', true],
      ['citizens', '国民の休日', true],
      ['holiday', '秋分の日', true],
    ]
  );

  const may = calendar.buildCalendar({ startDate: '2026-05-01', dayCount: 10 });
  assert.equal(dayOf(may, '2026-05-06').kind, 'substitute');
  assert.equal(dayOf(may, '2026-05-06').off, true);
});

test('週休曜日を任意に指定できる', () => {
  const result = calendar.buildCalendar({
    startDate: '2026-09-14',
    dayCount: 7,
    weeklyOffDays: [3],
  });
  assert.equal(dayOf(result, '2026-09-16').off, true, '水曜が休み');
  assert.equal(dayOf(result, '2026-09-19').off, false, '土曜は勤務日');
  assert.equal(dayOf(result, '2026-09-20').off, false, '日曜も勤務日');
});

test('週休なし（年中無休）も指定できる', () => {
  const result = calendar.buildCalendar({
    startDate: '2026-09-14',
    dayCount: 7,
    weeklyOffDays: [],
  });
  const offs = result.days.filter((day) => day.off);
  assert.deepEqual(offs, [], '祝日のない週で休みが0日');
});

test('会社休業日が休みになる', () => {
  const result = calendar.buildCalendar({
    startDate: '2026-08-10',
    dayCount: 10,
    companyHolidays: ['2026-08-13', '2026-08-14'],
  });
  assert.equal(dayOf(result, '2026-08-13').kind, 'company');
  assert.equal(dayOf(result, '2026-08-13').label, '会社休業日');
  assert.equal(dayOf(result, '2026-08-14').off, true);
  assert.equal(dayOf(result, '2026-08-12').off, false);
});

test('特別出勤日が最優先（祝日・週休・会社休業日を上書き）', () => {
  const result = calendar.buildCalendar({
    startDate: '2026-09-14',
    dayCount: 14,
    companyHolidays: ['2026-09-25'],
    workOverrides: ['2026-09-21', '2026-09-19', '2026-09-25'],
  });
  const holiday = dayOf(result, '2026-09-21');
  assert.equal(holiday.off, false, '祝日でも出勤日');
  assert.equal(holiday.kind, 'workday');
  assert.equal(holiday.label, '特別出勤日');
  assert.match(holiday.note, /敬老の日/);
  assert.equal(dayOf(result, '2026-09-19').off, false, '土曜出勤');
  assert.equal(dayOf(result, '2026-09-25').off, false, '会社休業日より出勤指定が優先');
});

test('会社休業日と祝日が重なった場合は祝日として表示する', () => {
  const result = calendar.buildCalendar({
    startDate: '2026-09-14',
    dayCount: 14,
    companyHolidays: ['2026-09-21'],
  });
  assert.equal(dayOf(result, '2026-09-21').kind, 'holiday');
  assert.equal(dayOf(result, '2026-09-21').off, true);
});

test('日付リストの空文字・前後空白を許容する', () => {
  const result = calendar.buildCalendar({
    startDate: '2026-08-10',
    dayCount: 10,
    companyHolidays: ['', '  ', ' 2026-08-13 '],
  });
  assert.equal(dayOf(result, '2026-08-13').kind, 'company');
});

test('不正な入力は日本語メッセージで例外', () => {
  assert.throws(() => calendar.buildCalendar({ startDate: 'bad', dayCount: 7 }), /開始日/);
  assert.throws(() => calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 0 }), /1〜366/);
  assert.throws(() => calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 367 }), /1〜366/);
  assert.throws(() => calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 7.5 }), /1〜366/);
  assert.throws(
    () => calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 7, weeklyOffDays: [7] }),
    /0（日）〜6（土）/
  );
  assert.throws(
    () => calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 7, weeklyOffDays: 'x' }),
    /配列/
  );
  assert.throws(
    () =>
      calendar.buildCalendar({
        startDate: '2026-09-14',
        dayCount: 7,
        companyHolidays: ['2026-02-30'],
      }),
    /会社休業日/
  );
});

test('日付リストの件数上限でDoSを防ぐ', () => {
  const many = Array.from({ length: 501 }, (_, i) => '2026-01-01');
  assert.throws(
    () => calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 7, companyHolidays: many }),
    /500 件まで/
  );
});

test('366日ぶんを生成でき、年をまたぐ', () => {
  const result = calendar.buildCalendar({ startDate: '2026-07-01', dayCount: 366 });
  assert.equal(result.days.length, 366);
  assert.equal(result.startDate, '2026-07-01');
  assert.equal(result.endDate, '2027-07-01');
  assert.equal(dayOf(result, '2027-01-01').label, '元日');
});

test('summarize: 休日・勤務日の集計', () => {
  const result = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 14 });
  const summary = calendar.summarize(result.days);
  assert.equal(summary.total, 14);
  assert.equal(summary.offDays + summary.workDays, 14);
  // 9/19,20,21,22,23,26,27 が休み
  assert.equal(summary.offDays, 7);
  assert.equal(summary.counts.holiday, 2);
  assert.equal(summary.counts.citizens, 1);
  assert.equal(summary.counts.weekly, 4);
});

test('インデックスが 0 から連番で振られる', () => {
  const result = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 5 });
  assert.deepEqual(
    result.days.map((day) => day.index),
    [0, 1, 2, 3, 4]
  );
});

test('対応範囲外の年にかかる期間は例外にせず丸める', () => {
  // 2099-12-20 から 30 日（2100年にかかる）。祝日計算は 2099 年までで丸める。
  const result = calendar.buildCalendar({ startDate: '2099-12-20', dayCount: 30 });
  assert.equal(result.days.length, 30);
  assert.equal(dayOf(result, '2100-01-01').kind, 'workday', '2100年の祝日は算出しない');
});
