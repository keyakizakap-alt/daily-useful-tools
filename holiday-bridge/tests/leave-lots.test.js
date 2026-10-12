/* ============================================================
   やすみつなぎ — 付与ロット・繁忙期・カレンダー書き出しのテスト
   実行: npm test
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LEAVE_EXPIRY_YEARS,
  MAX_LEAVE_BUDGET,
  MAX_LEAVE_LOTS,
  assignLeaveToLots,
  buildCalendar,
  buildPlan,
  defaultSettings,
  expiryFromGrant,
  findBridges,
  formatPlanICS,
  normalizeLots,
  totalLotDays,
} = require('../src/planner.js');

const MON_FRI = { workdays: [false, true, true, true, true, true, false], companyOff: [] };

/* ------------------------------------------------------------
   繁忙期（有給を取れない日）
   ------------------------------------------------------------ */

test('繁忙期の出勤日は有給の候補にならない', () => {
  const days = buildCalendar('2026-04-25', '2026-05-15', { ...MON_FRI, noLeave: ['2026-05-01'] });
  const bridges = findBridges(days, 5);
  assert.ok(bridges.length > 0);
  for (const b of bridges) {
    assert.ok(!b.leaveDates.includes('2026-05-01'), `${b.start} が 5/1 を有給にしている`);
  }
});

test('繁忙期をまたぐ連休は成立しない', () => {
  const days = buildCalendar('2026-04-25', '2026-05-15', { ...MON_FRI, noLeave: ['2026-05-01'] });
  for (const b of findBridges(days, 5)) {
    assert.ok(
      !(b.start < '2026-05-01' && b.end > '2026-05-01'),
      `${b.start}〜${b.end} が 5/1 をまたいでいる`
    );
  }
});

test('繁忙期を指定しなければ従来どおりの候補が出る', () => {
  const withOut = findBridges(buildCalendar('2026-04-25', '2026-05-15', MON_FRI), 5);
  const withEmpty = findBridges(
    buildCalendar('2026-04-25', '2026-05-15', { ...MON_FRI, noLeave: [] }), 5
  );
  assert.equal(withEmpty.length, withOut.length);
  // 5/1 に有給を置く 6 連休は、繁忙期なしなら存在する
  assert.ok(withOut.some((b) => b.leaveDates.includes('2026-05-01')));
});

test('繁忙期は休日の判定を変えない（祝日や土日はそのまま休み）', () => {
  // 祝日である 5/3 を繁忙期に指定しても、休日であることは変わらない
  const days = buildCalendar('2026-05-01', '2026-05-07', { ...MON_FRI, noLeave: ['2026-05-03'] });
  const target = days.find((d) => d.date === '2026-05-03');
  assert.equal(target.off, true, '祝日は休みのまま');
  assert.equal(target.canTakeLeave, false, '休日は有給の対象外');
});

test('全出勤日を繁忙期にすると、有給を使う連休が消える', () => {
  const all = [];
  for (const d of buildCalendar('2026-06-01', '2026-06-30', MON_FRI)) {
    if (!d.off) all.push(d.date);
  }
  const days = buildCalendar('2026-06-01', '2026-06-30', { ...MON_FRI, noLeave: all });
  for (const b of findBridges(days, 5)) assert.equal(b.leaveCount, 0);
});

/* ------------------------------------------------------------
   失効日の算出
   ------------------------------------------------------------ */

test('失効日は付与日の2年後の前日', () => {
  assert.equal(LEAVE_EXPIRY_YEARS, 2, '労基法 115 条の時効は 2 年');
  assert.equal(expiryFromGrant('2026-04-01'), '2028-03-31');
  assert.equal(expiryFromGrant('2026-10-01'), '2028-09-30');
  assert.equal(expiryFromGrant('2026-01-01'), '2027-12-31');
});

test('うるう日の付与でも失効日が破綻しない', () => {
  // 2024-02-29 の 2 年後は 2026-02-29（存在しない）→ 繰り上がって 3/1、その前日 2/28
  assert.equal(expiryFromGrant('2024-02-29'), '2026-02-28');
});

test('不正な付与日は null', () => {
  for (const bad of ['2026-02-30', 'あした', '', null, undefined, 20260401]) {
    assert.equal(expiryFromGrant(bad), null, String(bad));
  }
});

/* ------------------------------------------------------------
   付与ロットの正規化
   ------------------------------------------------------------ */

test('付与ロットを正規化する', () => {
  const lots = normalizeLots([
    { label: '繰越分', days: 5, expiry: '2027-03-31' },
    { label: '今年度分', days: 15, expiry: '2028-03-31' },
  ]);
  assert.equal(lots.length, 2);
  assert.equal(lots[0].days, 5);
  assert.equal(lots[1].expiry, '2028-03-31');
});

test('不正な付与ロットは落とす', () => {
  assert.deepEqual(normalizeLots(null), []);
  assert.deepEqual(normalizeLots('5日'), []);
  assert.deepEqual(normalizeLots([null, undefined, 42]), []);
  assert.deepEqual(normalizeLots([{ days: 0 }]), [], '0 日のロットは持たない');
  assert.deepEqual(normalizeLots([{ days: -3 }]), [], '負の日数は持たない');
  // 実在しない失効日は「失効なし」として扱う（計算を止めない）
  const lots = normalizeLots([{ days: 5, expiry: '2027-02-30' }]);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].expiry, null);
});

test('付与ロットは上限個数までしか受け取らない', () => {
  const many = [1, 2, 3, 4].map((n) => ({ days: n, expiry: null }));
  assert.equal(normalizeLots(many).length, MAX_LEAVE_LOTS);
});

test('合計日数は予算の上限で頭打ちになる', () => {
  assert.equal(totalLotDays([{ days: 5 }, { days: 15 }]), 20);
  assert.equal(totalLotDays([{ days: 40 }, { days: 40 }]), MAX_LEAVE_BUDGET);
  assert.equal(totalLotDays([]), 0);
  assert.equal(totalLotDays(null), 0);
});

/* ------------------------------------------------------------
   ロットへの割り当て（最早期限優先）
   ------------------------------------------------------------ */

const LOTS = [
  { label: '繰越分', days: 5, expiry: '2027-03-31' },
  { label: '今年度分', days: 15, expiry: '2028-03-31' },
];

test('失効が早いロットから消化する', () => {
  const dates = ['2026-12-28', '2027-01-04', '2027-02-15'];
  const r = assignLeaveToLots(dates, LOTS, '2027-10-11');
  assert.equal(r.lots[0].used, 3, '3 日とも繰越分から出る');
  assert.equal(r.lots[1].used, 0);
  assert.equal(r.usedDays, 3);
  assert.equal(r.totalDays, 20);
});

test('失効日を過ぎた日は、そのロットから消化しない', () => {
  // すべて繰越分の失効（2027-03-31）より後なので、今年度分から出る
  const dates = ['2027-06-01', '2027-07-01'];
  const r = assignLeaveToLots(dates, LOTS, '2027-10-11');
  assert.equal(r.lots[0].used, 0, '繰越分は使えない');
  assert.equal(r.lots[1].used, 2);
});

test('使い切れずに失効する日数を報告する', () => {
  const dates = ['2026-12-28', '2027-01-04', '2027-02-15', '2027-06-01'];
  const r = assignLeaveToLots(dates, LOTS, '2027-10-11');
  // 繰越分 5 日のうち 3 日しか失効前に使えない → 2 日が失効
  assert.equal(r.lots[0].unused, 2);
  assert.equal(r.expiringUnused, 2);
  assert.equal(r.earliestExpiry, '2027-03-31');
});

test('対象期間より後に失効する分は、失効として数えない', () => {
  const r = assignLeaveToLots([], LOTS, '2026-12-31');
  // どちらの失効日も 2026-12-31 より後なので、期間内の失効は 0
  assert.equal(r.expiringUnused, 0);
  assert.equal(r.lots[0].unused, 5);
});

test('失効日のないロットは最後に消化される', () => {
  const lots = [
    { label: '期限なし', days: 3, expiry: null },
    { label: '期限あり', days: 3, expiry: '2027-03-31' },
  ];
  const r = assignLeaveToLots(['2027-01-05', '2027-01-06'], lots, '2027-12-31');
  assert.equal(r.lots[1].used, 2, '期限があるものから先に使う');
  assert.equal(r.lots[0].used, 0);
  assert.equal(r.expiringUnused, 1, '期限ありの残り 1 日が失効');
});

test('どのロットからも出せない有給日は unassigned になる', () => {
  // 失効日より後の日しかないのに、失効するロットしかない場合
  const lots = [{ label: '繰越分', days: 2, expiry: '2027-03-31' }];
  const r = assignLeaveToLots(['2027-06-01'], lots, '2027-12-31');
  assert.deepEqual(r.unassigned, ['2027-06-01']);
  assert.equal(r.usedDays, 0);
});

test('有給日の順序が入れ替わっても結果が同じ', () => {
  const dates = ['2027-06-01', '2026-12-28', '2027-02-15', '2027-01-04'];
  const a = assignLeaveToLots(dates, LOTS, '2027-10-11');
  const b = assignLeaveToLots([...dates].reverse(), LOTS, '2027-10-11');
  assert.deepEqual(a.lots.map((l) => l.used), b.lots.map((l) => l.used));
});

test('ロットが空なら、すべて割り当て不能になる', () => {
  const r = assignLeaveToLots(['2027-01-05'], [], '2027-12-31');
  assert.deepEqual(r.unassigned, ['2027-01-05']);
  assert.equal(r.totalDays, 0);
  assert.equal(r.expiringUnused, 0);
});

test('assignLeaveToLots は入力のロットを書き換えない', () => {
  const lots = [{ label: '繰越分', days: 5, expiry: '2027-03-31' }];
  assignLeaveToLots(['2027-01-05'], lots, '2027-12-31');
  assert.equal(lots[0].days, 5);
  assert.equal(lots[0].used, undefined, '元のオブジェクトに used が生えていない');
});

test('プランの有給日をそのまま割り当てられる', () => {
  const days = buildCalendar('2026-10-12', '2027-10-11', MON_FRI);
  const plan = buildPlan(days, findBridges(days, 5), 10, { objective: 'long' });
  const leaveDates = plan.bridges.flatMap((b) => b.leaveDates);
  const r = assignLeaveToLots(leaveDates, LOTS, '2027-10-11');
  assert.equal(r.usedDays + r.unassigned.length, plan.leaveUsed, '消化と未割り当ての和が一致');
});

/* ------------------------------------------------------------
   カレンダー（.ics）への書き出し
   ------------------------------------------------------------ */

const FIXED_NOW = new Date(Date.UTC(2026, 9, 12, 0, 54, 0));

function sampleICS(options) {
  const days = buildCalendar('2026-10-12', '2027-10-11', defaultSettings());
  const plan = buildPlan(days, findBridges(days, 5), 10, { objective: 'long' });
  return { plan, ics: formatPlanICS(plan, { now: FIXED_NOW, ...options }) };
}

test('iCalendar の骨格が正しい', () => {
  const { ics } = sampleICS();
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('VERSION:2.0'));
  assert.ok(ics.includes('PRODID:'));
  assert.equal(
    (ics.match(/BEGIN:VEVENT/g) || []).length,
    (ics.match(/END:VEVENT/g) || []).length,
    'VEVENT の開始と終了が対応している'
  );
});

test('改行は CRLF で、行は 75 オクテット以内に折られている', () => {
  const { ics } = sampleICS();
  assert.ok(!/[^\r]\n/.test(ics), 'CRLF でない改行がある');
  for (const line of ics.split('\r\n')) {
    assert.ok(
      Buffer.byteLength(line, 'utf8') <= 75,
      `75 オクテットを超える行: ${Buffer.byteLength(line, 'utf8')} ${line.slice(0, 30)}`
    );
  }
});

test('折り返しても日本語が壊れない', () => {
  const { ics } = sampleICS();
  // 折り返しを戻すと、元の語が現れる
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('やすみつなぎ で作成'), '折り返しを戻すと文が復元される');
  assert.ok(!ics.includes('�'), '置換文字が混ざっていない');
});

test('終日予定の DTEND は終了日の翌日（排他的）', () => {
  const { plan, ics } = sampleICS();
  const bridge = plan.bridges[0];
  const start = bridge.start.replace(/-/g, '');
  const endExclusive = new Date(Date.UTC(
    Number(bridge.end.slice(0, 4)), Number(bridge.end.slice(5, 7)) - 1, Number(bridge.end.slice(8, 10)) + 1
  ));
  const expected = `${endExclusive.getUTCFullYear()}` +
    `${String(endExclusive.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(endExclusive.getUTCDate()).padStart(2, '0')}`;
  assert.ok(ics.includes(`DTSTART;VALUE=DATE:${start}`));
  assert.ok(ics.includes(`DTEND;VALUE=DATE:${expected}`));
});

test('連休と有給の日がそれぞれ予定になる', () => {
  const { plan, ics } = sampleICS();
  const leaveCount = plan.bridges.reduce((sum, b) => sum + b.leaveCount, 0);
  assert.equal(
    (ics.match(/BEGIN:VEVENT/g) || []).length,
    plan.bridges.length + leaveCount,
    '連休ごと＋有給の日ごとに 1 件ずつ'
  );
  assert.ok(ics.includes('SUMMARY:有給'));
});

test('有給の日を含めない指定ができる', () => {
  const { plan, ics } = sampleICS({ includeLeaveDays: false });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, plan.bridges.length);
  assert.ok(!ics.includes('SUMMARY:有給\r\n'));
});

test('UID が予定ごとに一意', () => {
  const { ics } = sampleICS();
  const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
  assert.ok(uids.length > 0);
  assert.equal(new Set(uids).size, uids.length, 'UID が重複している');
});

test('DTSTAMP は渡した時刻を使う（出力が再現可能）', () => {
  const { ics } = sampleICS();
  assert.ok(ics.includes('DTSTAMP:20261012T005400Z'));
  const again = sampleICS().ics;
  assert.equal(ics, again, '同じ入力なら同じ出力になる');
});

test('TEXT 値の特殊文字が打ち消されている', () => {
  // DESCRIPTION 内の読点やコロンはそのままでよいが、カンマとセミコロンは要エスケープ
  const plan = {
    bridges: [{
      start: '2027-01-01', end: '2027-01-03', totalDays: 3,
      leaveDates: [], leaveCount: 0, labels: ['元日;テスト,用'],
    }],
  };
  const ics = formatPlanICS(plan, { now: FIXED_NOW });
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('元日\;テスト\\,用'), `エスケープされていない: ${unfolded}`);
});

test('空のプランでも壊れない', () => {
  const ics = formatPlanICS({ bridges: [] }, { now: FIXED_NOW });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 0);
  assert.equal(formatPlanICS({}, { now: FIXED_NOW }).includes('BEGIN:VEVENT'), false);
  assert.equal(formatPlanICS(null, { now: FIXED_NOW }).includes('BEGIN:VEVENT'), false);
});
