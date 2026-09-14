'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dateutil = require('../src/lib/dateutil.js');
const holidays = require('../src/lib/holidays.js');
const calendar = require('../src/lib/calendar.js');
const planner = require('../src/lib/planner.js');
const ics = require('../src/lib/ics.js');

const FIXED_MS = Date.UTC(2026, 8, 14, 0, 0, 0);

test('祝日→カレンダー→プラン→ICS の一連が破綻なく通る', () => {
  const built = calendar.buildCalendar({
    startDate: '2026-09-14',
    dayCount: 365,
    weeklyOffDays: [0, 6],
  });
  const plans = planner.findPlans(built.days, { budget: 3 });
  assert.ok(plans.length > 20, `候補が少なすぎる: ${plans.length}`);

  const text = ics.buildCalendarFile({
    events: plans.slice(0, 5).map((plan) => ({
      start: plan.start,
      end: plan.end,
      summary: `${plan.length}連休（有給${plan.cost}日）`,
      description: plan.reason,
    })),
    dtstampMs: FIXED_MS,
  });
  const logical = text.replace(/\r\n /g, '').split('\r\n');
  assert.equal(logical.filter((line) => line === 'BEGIN:VEVENT').length, 5);
  assert.equal(logical[0], 'BEGIN:VCALENDAR');
});

test('シナリオ: 2026年9月から1日の有給で最長6連休', () => {
  const built = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 21 });
  const plans = planner.findPlans(built.days, { budget: 1 });
  const best = plans[0];
  assert.equal(best.cost, 1);
  assert.equal(best.length, 6, 'シルバーウィーク前に1日休めば6連休');
  assert.deepEqual(best.ptoDates, ['2026-09-18']);
  assert.equal(best.start, '2026-09-18');
  assert.equal(best.end, '2026-09-23');
  assert.equal(best.perDay, 6);
  // 内訳: 有給1 + 土日2 + 祝日2 + 国民の休日1
  assert.deepEqual(best.composition, {
    holiday: 2,
    substitute: 0,
    citizens: 1,
    weekly: 2,
    company: 0,
    pto: 1,
  });
});

test('シナリオ: 2026年のGWは有給0日でも連休になる', () => {
  const built = calendar.buildCalendar({ startDate: '2026-04-25', dayCount: 20 });
  const existing = planner.findExistingBreaks(built.days);
  // 5/2(土) 5/3(日) 5/4(月) 5/5(火) 5/6(水:振替) → 5連休
  const gw = existing.find((item) => item.start === '2026-05-02');
  assert.ok(gw, 'GWが検出されない');
  assert.equal(gw.length, 5);
  assert.equal(gw.end, '2026-05-06');
  assert.equal(gw.cost, 0);
});

test('シナリオ: 2026年のGWは有給2日で9連休になる', () => {
  const built = calendar.buildCalendar({ startDate: '2026-04-25', dayCount: 20 });
  const plans = planner.findPlans(built.days, { budget: 2 });

  // GW明けの 5/7(木) 5/8(金) を休むと 5/2(土)〜5/10(日) が9連休になる
  const nine = plans.find((plan) => plan.length === 9);
  assert.ok(nine, '9連休の候補がない');
  assert.equal(nine.cost, 2);
  assert.deepEqual(nine.ptoDates, ['2026-05-07', '2026-05-08']);
  assert.equal(nine.start, '2026-05-02');
  assert.equal(nine.end, '2026-05-10');
  assert.equal(nine.perDay, 4.5);

  // GW前の 4/30(木) 5/1(金) を休む案は 4/29(昭和の日)から8連休
  const eight = plans.find(
    (plan) => plan.ptoDates.join(',') === '2026-04-30,2026-05-01'
  );
  assert.ok(eight, 'GW前に休む候補がない');
  assert.equal(eight.length, 8);
  assert.equal(eight.start, '2026-04-29');
  assert.equal(eight.end, '2026-05-06');

  // 効率では「1日だけ休んで6連休」が上位に来る
  assert.equal(plans[0].cost, 1);
  assert.equal(plans[0].length, 6);
  assert.equal(plans[0].perDay, 6);
});

test('シナリオ: 会社の夏季休業を加えるとプランが変わる', () => {
  const options = { startDate: '2026-08-03', dayCount: 30, weeklyOffDays: [0, 6] };
  const without = planner.findPlans(calendar.buildCalendar(options).days, { budget: 2 });
  const withSummer = planner.findPlans(
    calendar.buildCalendar(
      Object.assign({}, options, { companyHolidays: ['2026-08-13', '2026-08-14'] })
    ).days,
    { budget: 2 }
  );
  const maxWithout = Math.max(...without.map((plan) => plan.length));
  const maxWith = Math.max(...withSummer.map((plan) => plan.length));
  assert.ok(maxWith > maxWithout, `休業日を足しても最長が伸びない: ${maxWithout} → ${maxWith}`);
  // 8/11(火:山の日) 8/13,14(会社休業) 8/15,16(土日) → 8/12(水) 1日で 8/11〜8/16 の6連休
  const best = withSummer[0];
  assert.equal(best.cost, 1);
  assert.deepEqual(best.ptoDates, ['2026-08-12']);
  assert.equal(best.start, '2026-08-11');
  assert.equal(best.end, '2026-08-16');
  assert.equal(best.length, 6);
  assert.equal(best.perDay, 6);

  // 8/10(月) も足せば 8/8(土)〜8/16(日) の9連休
  const nine = withSummer.find((plan) => plan.length === 9);
  assert.ok(nine, '9連休の候補がない');
  assert.equal(nine.cost, 2);
  assert.deepEqual(nine.ptoDates, ['2026-08-10', '2026-08-12']);
  assert.equal(nine.start, '2026-08-08');
  assert.equal(nine.end, '2026-08-16');
});

test('シナリオ: 特別出勤日を入れると連休が分断される', () => {
  const options = { startDate: '2026-09-14', dayCount: 21 };
  const before = planner.findExistingBreaks(calendar.buildCalendar(options).days);
  assert.ok(before.some((item) => item.length === 5));

  const after = planner.findExistingBreaks(
    calendar.buildCalendar(Object.assign({}, options, { workOverrides: ['2026-09-21'] })).days
  );
  assert.equal(after.some((item) => item.length === 5), false, '出勤指定が反映されていない');
  assert.ok(after.some((item) => item.start === '2026-09-19' && item.length === 2) === false);
});

test('年間プラン: 1年・予算5日で現実的な結果になる', () => {
  const built = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 365 });
  const year = planner.planYear(built.days, { budget: 5 });
  assert.ok(year.plans.length >= 3, `連休の回数が少なすぎる: ${year.plans.length}`);
  assert.ok(year.usedDays <= 5);
  assert.ok(year.totalDays >= 15, `合計休み日数が少なすぎる: ${year.totalDays}`);
  // 各プランは実際に連続した休みになっている
  year.plans.forEach((plan) => {
    assert.equal(dateutil.diffDays(plan.start, plan.end) + 1, plan.length);
  });
});

test('年間プラン: ICS に一括で書き出せる', () => {
  const built = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 365 });
  const year = planner.planYear(built.days, { budget: 5 });
  const text = ics.buildCalendarFile({
    events: year.plans.map((plan) => ({
      start: plan.start,
      end: plan.end,
      summary: `${plan.length}連休`,
      description: plan.ptoDates.join(', '),
    })),
    dtstampMs: FIXED_MS,
  });
  const logical = text.replace(/\r\n /g, '').split('\r\n');
  assert.equal(
    logical.filter((line) => line === 'BEGIN:VEVENT').length,
    year.plans.length
  );
  // カンマ区切りの有給日はエスケープされている
  if (year.plans.some((plan) => plan.cost > 1)) {
    assert.match(text, /DESCRIPTION:.*\\,/);
  }
});

test('週休が日曜だけの勤務形態でも成立する', () => {
  const built = calendar.buildCalendar({
    startDate: '2026-09-14',
    dayCount: 60,
    weeklyOffDays: [0],
  });
  const summary = calendar.summarize(built.days);
  assert.ok(summary.workDays > summary.offDays);
  const plans = planner.findPlans(built.days, { budget: 2 });
  assert.ok(plans.length > 0);
  plans.forEach((plan) => assert.ok(plan.length >= 3));
});

test('性能: 366日・予算5日の全計算が100ms未満', () => {
  const started = process.hrtime.bigint();
  const built = calendar.buildCalendar({ startDate: '2026-01-01', dayCount: 366 });
  const existing = planner.findExistingBreaks(built.days);
  const plans = planner.findPlans(built.days, { budget: 5 });
  const year = planner.planYear(built.days, { budget: 5 });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.ok(existing.length > 0);
  assert.ok(plans.length > 0);
  assert.ok(year.plans.length > 0);
  assert.ok(elapsedMs < 100, `${elapsedMs.toFixed(1)}ms かかっている`);
});

test('性能: 最大予算（40日）でも200ms未満で完了する', () => {
  const built = calendar.buildCalendar({ startDate: '2026-01-01', dayCount: 366 });
  const started = process.hrtime.bigint();
  planner.planYear(built.days, { budget: 40 });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 200, `${elapsedMs.toFixed(1)}ms かかっている`);
});

test('対応年の全域で例外なく計算できる', () => {
  for (let year = holidays.MIN_YEAR; year <= holidays.MAX_YEAR; year += 1) {
    const built = calendar.buildCalendar({ startDate: `${year}-01-01`, dayCount: 60 });
    const plans = planner.findPlans(built.days, { budget: 2 });
    assert.ok(Array.isArray(plans), `${year}年で失敗`);
  }
});

test('ライブラリ同士に循環依存や未定義参照がない', () => {
  [dateutil, holidays, calendar, planner, ics].forEach((mod) => {
    Object.entries(mod).forEach(([name, value]) => {
      assert.notEqual(value, undefined, `${name} が undefined`);
    });
  });
});
