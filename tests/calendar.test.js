import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTimeline, indexByDate, DEFAULT_WEEKLY_OFF } from '../src/lib/calendar.js';

const WEEKDAYS_ONLY = DEFAULT_WEEKLY_OFF;
const WED_THU = [false, false, false, true, true, false, false]; // 水・木休み

test('土日祝休みのタイムライン', () => {
  const timeline = buildTimeline({ start: '2026-09-18', end: '2026-09-24', weeklyOff: WEEKDAYS_ONLY });
  const byDate = indexByDate(timeline);
  assert.equal(byDate.get('2026-09-18').off, false); // 金
  assert.equal(byDate.get('2026-09-19').off, true); // 土
  assert.equal(byDate.get('2026-09-20').off, true); // 日
  assert.equal(byDate.get('2026-09-21').off, true); // 敬老の日
  assert.equal(byDate.get('2026-09-22').off, true); // 国民の休日
  assert.equal(byDate.get('2026-09-23').off, true); // 秋分の日
  assert.equal(byDate.get('2026-09-24').off, false); // 木
  assert.equal(byDate.get('2026-09-21').holiday, '敬老の日');
  assert.deepEqual(byDate.get('2026-09-21').labels, ['敬老の日']); // 月曜なので週休ではない
  assert.deepEqual(byDate.get('2026-09-20').labels, ['週休']);
});

test('祝日を休みにしない設定では祝日が出勤日になる', () => {
  const timeline = buildTimeline({
    start: '2026-09-21',
    end: '2026-09-23',
    weeklyOff: WED_THU,
    useHolidays: false,
  });
  assert.deepEqual(
    timeline.map((entry) => entry.off),
    [false, false, true], // 月・火は出勤、水は週休
  );
  // 出勤日であっても、祝日がどこかは表示の材料として残す
  assert.equal(timeline[0].holiday, '敬老の日');
  assert.deepEqual(timeline[0].labels, []);
});

test('シフト勤務（水・木休み）でも週休が反映される', () => {
  const timeline = buildTimeline({ start: '2026-03-01', end: '2026-03-14', weeklyOff: WED_THU, useHolidays: false });
  for (const entry of timeline) {
    assert.equal(entry.off, entry.dow === 3 || entry.dow === 4, `${entry.date} の判定が違う`);
  }
});

test('会社の休業日が反映され、重複しても壊れない', () => {
  const timeline = buildTimeline({
    start: '2026-12-28',
    end: '2027-01-05',
    weeklyOff: WEEKDAYS_ONLY,
    closures: [
      { start: '2026-12-29', end: '2027-01-03', label: '年末年始' },
      { start: '2026-12-30', end: '2026-12-31', label: '重複した登録' },
      { start: '2027-01-04', end: '2027-01-03', label: '逆転した期間は無視' },
    ],
  });
  const byDate = indexByDate(timeline);
  assert.equal(byDate.get('2026-12-29').off, true);
  assert.equal(byDate.get('2026-12-29').labels.includes('年末年始'), true);
  assert.equal(byDate.get('2026-12-30').labels.filter((l) => l !== '週休').length, 1);
  assert.equal(byDate.get('2027-01-04').off, false); // 月曜・休業日の対象外
});

test('selectable は指定範囲の出勤日だけ true になる', () => {
  const timeline = buildTimeline({
    start: '2025-12-29',
    end: '2026-01-06',
    weeklyOff: WEEKDAYS_ONLY,
    selectableFrom: '2026-01-01',
    selectableTo: '2026-12-31',
  });
  const byDate = indexByDate(timeline);
  assert.equal(byDate.get('2025-12-30').off, false);
  assert.equal(byDate.get('2025-12-30').selectable, false); // 対象年の外
  assert.equal(byDate.get('2026-01-02').selectable, true);
  assert.equal(byDate.get('2026-01-01').selectable, false); // 元日は休み
});

test('引数の検証', () => {
  assert.throws(() => buildTimeline({ start: 'bad', end: '2026-01-01' }), TypeError);
  assert.throws(() => buildTimeline({ start: '2026-01-02', end: '2026-01-01' }), RangeError);
  assert.throws(() => buildTimeline({ start: '2026-01-01', end: '2026-01-02', weeklyOff: [true] }), TypeError);
});

test('1年ぶんの構築で祝日数が一致する', () => {
  const timeline = buildTimeline({ start: '2026-01-01', end: '2026-12-31', weeklyOff: WEEKDAYS_ONLY });
  assert.equal(timeline.length, 365);
  assert.equal(timeline.filter((entry) => entry.holiday).length, 18);
});
