/* ============================================================
   とびいし — 計画ロジックの単体テスト
   実行: npm test
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const H = require('../src/holidays.js');

function timeline(extra) {
  return E.buildTimeline(Object.assign({
    from: '2026-01-01',
    to: '2026-12-31',
    weeklyOff: [0, 6]
  }, extra || {}));
}

function day(tl, date) {
  const idx = tl.index[date];
  return idx === undefined ? null : tl.days[idx];
}

function planAt(plans, start, end) {
  return plans.find((p) => p.start === start && p.end === end) || null;
}

/* ============================================================
   期間の正規化
   ============================================================ */

test('normalizeRange は逆順を入れ替え、5年を超える期間を切る', () => {
  assert.deepEqual(E.normalizeRange('2026-01-01', '2026-12-31'), { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(E.normalizeRange('2026-12-31', '2026-01-01'), { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(E.normalizeRange('2026-01-01', '2040-01-01').to, H.fromDayNumber(H.toDayNumber('2026-01-01') + E.LIMITS.maxSpanDays - 1));
  assert.equal(E.normalizeRange('2026-02-30', '2026-12-31'), null);
  assert.equal(E.normalizeRange(null, '2026-12-31'), null);
});

/* ============================================================
   タイムライン
   ============================================================ */

test('週休・祝日・会社休業・平日を判定する', () => {
  const tl = timeline({ companyOffPresets: ['newyear', 'obon'] });
  assert.equal(day(tl, '2026-01-05').off, false);                 // 月曜の平日
  assert.equal(day(tl, '2026-01-05').takeable, true);
  assert.equal(day(tl, '2026-01-10').offKind, 'weekly');          // 土曜
  assert.equal(day(tl, '2026-01-12').offKind, 'holiday');         // 成人の日
  assert.equal(day(tl, '2026-01-12').offLabel, '成人の日');
  assert.equal(day(tl, '2026-05-06').offKind, 'substitute');      // 振替休日
  assert.equal(day(tl, '2026-09-22').offKind, 'extra-holiday');   // 国民の休日
  assert.equal(day(tl, '2026-08-13').offKind, 'company');         // お盆
  assert.equal(day(tl, '2026-08-13').offLabel, 'お盆休み');
  assert.equal(day(tl, '2026-12-30').offKind, 'company');         // 年末年始
});

test('祝日は会社休業より優先してラベルされる', () => {
  // 1/1 は元日（祝日）であり、年末年始休業の範囲にも入る
  const tl = timeline({ companyOffPresets: ['newyear'] });
  assert.equal(day(tl, '2026-01-01').offKind, 'holiday');
  assert.equal(day(tl, '2026-01-01').offLabel, '元日');
});

test('会社休業を外すと平日に戻る', () => {
  const tl = timeline({ companyOffPresets: [] });
  assert.equal(day(tl, '2026-08-13').off, false);
  assert.equal(day(tl, '2026-12-30').off, false);
});

test('期間の前後に余白を持つが、余白は対象期間外として扱う', () => {
  const tl = timeline();
  assert.equal(tl.days[0].date, '2025-12-18');
  assert.equal(tl.days[tl.days.length - 1].date, '2027-01-14');
  assert.equal(day(tl, '2025-12-29').inScope, false);
  assert.equal(day(tl, '2025-12-29').takeable, false);   // 余白には有給を置けない
  assert.equal(day(tl, '2026-01-01').inScope, true);
  assert.equal(tl.days[tl.scopeStart].date, '2026-01-01');
  assert.equal(tl.days[tl.scopeEnd].date, '2026-12-31');
});

test('休めない期間の平日は takeable が false になる', () => {
  const tl = timeline({ blackout: [{ from: '2026-03-01', to: '2026-03-31', label: '繁忙期' }] });
  assert.equal(day(tl, '2026-03-02').off, false);
  assert.equal(day(tl, '2026-03-02').takeable, false);
  assert.equal(day(tl, '2026-03-02').blackoutLabel, '繁忙期');
  assert.equal(day(tl, '2026-04-01').takeable, true);
});

test('会社休業は対象期間の前後の年にも展開される', () => {
  const spans = E.expandCompanyOff(['newyear'], 2026, 2026);
  const froms = spans.map((s) => s.from);
  assert.ok(froms.includes('2025-12-29'));
  assert.ok(froms.includes('2026-12-29'));
  assert.ok(froms.includes('2027-01-01'));
  assert.deepEqual(E.expandCompanyOff([], 2026, 2026), []);
  assert.deepEqual(E.expandCompanyOff(['unknown'], 2026, 2026), []);
});

test('不正な期間を渡すと空のタイムラインになる', () => {
  const tl = E.buildTimeline({ from: 'x', to: 'y' });
  assert.deepEqual(tl.days, []);
  assert.deepEqual(E.findPlans(tl, {}), []);
  assert.deepEqual(E.findNaturalRuns(tl, 3), []);
});

/* ============================================================
   探索の不変条件
   ------------------------------------------------------------
   「区間 [a,b] が決まれば、その中の平日すべてを有給にする以外に
   選択肢はない」という設計上の不変条件を、全プランで検査する。
   ============================================================ */

test('すべてのプランで「区間内の平日 = 使う有給」が成り立つ', () => {
  const tl = timeline({ companyOffPresets: ['newyear'] });
  const plans = E.findPlans(tl, { maxTake: 4, minLength: 3 });
  assert.ok(plans.length > 50);
  for (const plan of plans) {
    const workdays = [];
    for (let i = plan.startIdx; i <= plan.endIdx; i++) {
      if (!tl.days[i].off) workdays.push(tl.days[i].date);
    }
    assert.deepEqual(plan.take, workdays, plan.id);
    assert.equal(plan.cost, workdays.length);
    assert.equal(plan.length, plan.endIdx - plan.startIdx + 1);
    assert.equal(plan.efficiency, plan.length / plan.cost);
  }
});

test('すべてのプランの区間は「ちょうど」で、外側に休みが続かない', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 3, minLength: 3 });
  for (const plan of plans) {
    if (plan.startIdx > 0) assert.equal(tl.days[plan.startIdx - 1].off, false, plan.id + ' の左に休みが残っている');
    if (plan.endIdx < tl.days.length - 1) assert.equal(tl.days[plan.endIdx + 1].off, false, plan.id + ' の右に休みが残っている');
  }
});

test('プランは区間で一意（同じ区間が二重に出ない）', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 5, minLength: 3 });
  const ids = new Set(plans.map((p) => p.id));
  assert.equal(ids.size, plans.length);
});

test('有給はすべて対象期間内かつ取得可能な平日', () => {
  const tl = timeline({ blackout: [{ from: '2026-05-01', to: '2026-05-01', label: '出勤' }] });
  const plans = E.findPlans(tl, { maxTake: 3, minLength: 3 });
  for (const plan of plans) {
    for (const date of plan.take) {
      const d = day(tl, date);
      assert.ok(d.inScope && d.takeable && !d.off, date);
      assert.notEqual(date, '2026-05-01');
    }
  }
});

/* ============================================================
   具体的な期待値
   ============================================================ */

test('2026年5月1日の有給1日で6連休になる', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 1, minLength: 3 });
  const plan = planAt(plans, '2026-05-01', '2026-05-06');
  assert.ok(plan, '5/1〜5/6 のプランが見つからない');
  assert.deepEqual(plan.take, ['2026-05-01']);
  assert.equal(plan.length, 6);
  assert.equal(plan.cost, 1);
  assert.equal(E.describeEfficiency(plan), '有給1日で6連休');
});

test('2026年9月のシルバーウィークは有給1日で6連休になる', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 1, minLength: 3 });
  const plan = planAt(plans, '2026-09-18', '2026-09-23');
  assert.ok(plan);
  assert.deepEqual(plan.take, ['2026-09-18']);
  assert.equal(plan.length, 6);
});

test('休めない期間を跨ぐプランは作られない', () => {
  const tl = timeline({ blackout: [{ from: '2026-05-01', to: '2026-05-01' }] });
  const plans = E.findPlans(tl, { maxTake: 3, minLength: 3 });
  assert.equal(planAt(plans, '2026-05-01', '2026-05-06'), null);
  // 連休の反対側（5/7〜）は残る
  assert.ok(planAt(plans, '2026-05-02', '2026-05-07'));
});

/* ============================================================
   上限とフィルタ
   ============================================================ */

test('maxTake を超える有給を使うプランは出ない', () => {
  const tl = timeline();
  for (const maxTake of [1, 2, 3, 7]) {
    const plans = E.findPlans(tl, { maxTake: maxTake, minLength: 3 });
    assert.ok(plans.length > 0);
    for (const plan of plans) assert.ok(plan.cost <= maxTake, maxTake + ' / ' + plan.id);
  }
});

test('maxTake は上限値で丸められる', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 999, minLength: 3 });
  for (const plan of plans) assert.ok(plan.cost <= E.LIMITS.maxTakePerPlan);
  // 不正値は既定の5になる
  const fallback = E.findPlans(tl, { maxTake: 'abc', minLength: 3 });
  for (const plan of fallback) assert.ok(plan.cost <= 5);
});

test('minLength / minEfficiency が効く', () => {
  const tl = timeline();
  const long = E.findPlans(tl, { maxTake: 3, minLength: 7 });
  for (const plan of long) assert.ok(plan.length >= 7);
  const efficient = E.findPlans(tl, { maxTake: 3, minLength: 3, minEfficiency: 3 });
  assert.ok(efficient.length > 0);
  for (const plan of efficient) assert.ok(plan.efficiency >= 3);
});

/* ============================================================
   有給なしの連休
   ============================================================ */

test('findNaturalRuns は有給ゼロの連休だけを返す', () => {
  const tl = timeline();
  const runs = E.findNaturalRuns(tl, 3);
  assert.ok(runs.length > 5);
  for (const run of runs) {
    assert.equal(run.cost, 0);
    assert.deepEqual(run.take, []);
    assert.equal(run.efficiency, Infinity);
    assert.ok(run.length >= 3);
    for (let i = run.startIdx; i <= run.endIdx; i++) assert.equal(tl.days[i].off, true);
  }
  // 2026年のゴールデンウィークは5/2〜5/6の5連休
  assert.ok(runs.some((r) => r.start === '2026-05-02' && r.end === '2026-05-06' && r.length === 5));
});

test('対象期間に全くかからない連休は返さない', () => {
  const tl = E.buildTimeline({ from: '2026-06-01', to: '2026-06-30', weeklyOff: [0, 6] });
  const runs = E.findNaturalRuns(tl, 2);
  for (const run of runs) {
    let touches = false;
    for (let i = run.startIdx; i <= run.endIdx; i++) if (tl.days[i].inScope) touches = true;
    assert.ok(touches, run.id);
  }
});

/* ============================================================
   並び替え
   ============================================================ */

test('rankPlans の3モード', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 3, minLength: 3 });
  const byEff = E.rankPlans(plans, 'efficiency');
  for (let i = 1; i < byEff.length; i++) assert.ok(byEff[i - 1].efficiency >= byEff[i].efficiency);
  const byLen = E.rankPlans(plans, 'length');
  for (let i = 1; i < byLen.length; i++) assert.ok(byLen[i - 1].length >= byLen[i].length);
  const byDate = E.rankPlans(plans, 'date');
  for (let i = 1; i < byDate.length; i++) assert.ok(byDate[i - 1].startIdx <= byDate[i].startIdx);
  // 不明なモードは効率順にフォールバックする
  assert.deepEqual(E.rankPlans(plans, 'zzz').map((p) => p.id), byEff.map((p) => p.id));
  // 元の配列を壊さない
  assert.notEqual(E.rankPlans(plans, 'length'), plans);
});

/* ============================================================
   年間編成（動的計画法）
   ============================================================ */

test('composeYear は予算を超えず、区間が重ならず隣接もしない', () => {
  const tl = timeline({ companyOffPresets: ['newyear'] });
  const plans = E.findPlans(tl, { maxTake: 3, minLength: 3 });
  for (const budget of [1, 3, 5, 10]) {
    const result = E.composeYear(plans, budget);
    assert.ok(result.totalCost <= budget, '予算超過: ' + budget);
    const sorted = result.picked.slice().sort((a, b) => a.startIdx - b.startIdx);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].startIdx > sorted[i - 1].endIdx + 1,
        '区間が重なるか隣接している: ' + sorted[i - 1].id + ' / ' + sorted[i].id);
    }
    assert.equal(result.totalLength, sorted.reduce((s, p) => s + p.length, 0));
    assert.equal(result.totalCost, sorted.reduce((s, p) => s + p.cost, 0));
  }
});

test('composeYear は予算が増えるほど悪くならない（単調性）', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 3, minLength: 3 });
  let previous = -1;
  for (let budget = 0; budget <= 12; budget++) {
    const total = E.composeYear(plans, budget).totalLength;
    assert.ok(total >= previous, budget + '日で合計が減った');
    previous = total;
  }
});

test('composeYear は総当たりと同じ最大値を出す（小さな期間での最適性）', () => {
  const tl = E.buildTimeline({ from: '2026-04-01', to: '2026-05-31', weeklyOff: [0, 6] });
  const plans = E.findPlans(tl, { maxTake: 2, minLength: 3 });
  const budget = 3;
  const pool = plans.filter((p) => p.cost > 0 && p.cost <= budget);

  // 総当たり: 重ならず隣接しない組み合わせで、合計休日を最大化する
  let best = 0;
  const search = (index, costLeft, lastEnd, total) => {
    if (total > best) best = total;
    for (let i = index; i < pool.length; i++) {
      const plan = pool[i];
      if (plan.cost > costLeft) continue;
      if (plan.startIdx <= lastEnd + 1) continue;
      search(i + 1, costLeft - plan.cost, plan.endIdx, total + plan.length);
    }
  };
  const ordered = pool.slice().sort((a, b) => a.startIdx - b.startIdx);
  pool.length = 0;
  Array.prototype.push.apply(pool, ordered);
  search(0, budget, -2, 0);

  assert.equal(E.composeYear(plans, budget).totalLength, best);
});

test('composeYear は予算0や候補なしで空を返す', () => {
  const tl = timeline();
  const plans = E.findPlans(tl, { maxTake: 2, minLength: 3 });
  assert.deepEqual(E.composeYear(plans, 0).picked, []);
  assert.deepEqual(E.composeYear([], 5).picked, []);
  assert.equal(E.composeYear(plans, -3).totalCost, 0);
  assert.ok(E.composeYear(plans, 999).totalCost <= E.LIMITS.maxBudget);
});

test('composeYear は有給ゼロの連休を候補に入れない', () => {
  const tl = timeline();
  const natural = E.findNaturalRuns(tl, 3);
  assert.deepEqual(E.composeYear(natural, 5).picked, []);
});

/* ============================================================
   区間からの復元
   ============================================================ */

test('planFromRange は保存した区間からプランを復元する', () => {
  const tl = timeline();
  const plan = E.planFromRange(tl, '2026-05-01', '2026-05-06');
  assert.ok(plan);
  assert.deepEqual(plan.take, ['2026-05-01']);
  assert.equal(plan.length, 6);
  assert.equal(plan.id, '2026-05-01_2026-05-06');
});

test('planFromRange は「ちょうど」でない区間を拒否する', () => {
  const tl = timeline();
  assert.equal(E.planFromRange(tl, '2026-05-03', '2026-05-06'), null);   // 左に休みが続く
  assert.equal(E.planFromRange(tl, '2026-05-01', '2026-05-05'), null);   // 右に休みが続く
  assert.equal(E.planFromRange(tl, '2026-13-01', '2026-05-06'), null);   // 不正な日付
  assert.equal(E.planFromRange(tl, '2026-05-06', '2026-05-01'), null);   // 逆順
});

test('planFromRange は設定が変わって成立しなくなった区間を拒否する', () => {
  const blocked = timeline({ blackout: [{ from: '2026-05-01', to: '2026-05-01' }] });
  assert.equal(E.planFromRange(blocked, '2026-05-01', '2026-05-06'), null);
  // 木曜も休みにすると 4/30 が休みになり、区間が「ちょうど」でなくなる
  const thursdayOff = timeline({ weeklyOff: [0, 4, 6] });
  assert.equal(E.planFromRange(thursdayOff, '2026-05-01', '2026-05-06'), null);
  // 週休をなくすと同じ区間でも有給が1日増える（土曜が平日になる）
  const noWeekend = timeline({ weeklyOff: [] });
  assert.deepEqual(E.planFromRange(noWeekend, '2026-05-01', '2026-05-06').take, ['2026-05-01', '2026-05-02']);
});

test('overlaps は隣接も重なりとみなす', () => {
  const tl = timeline();
  // 5/9〜5/11（有給 5/11）と 5/12〜5/17（有給 5/12〜5/15）は1日も空けずに隣接する
  const a = E.planFromRange(tl, '2026-05-09', '2026-05-11');
  const b = E.planFromRange(tl, '2026-05-12', '2026-05-17');
  assert.ok(a && b);
  assert.equal(a.endIdx + 1, b.startIdx);
  assert.ok(E.overlaps(a, b));
  assert.ok(E.overlaps(a, a));
  const far = E.planFromRange(tl, '2026-09-18', '2026-09-23');
  assert.ok(!E.overlaps(a, far));
});

/* ============================================================
   セグメント
   ============================================================ */

test('segments は区間を連続ブロックに分け、合計が長さに一致する', () => {
  const tl = timeline();
  const plan = E.planFromRange(tl, '2026-05-01', '2026-05-06');
  // 5/2(土)は週休、5/3(日)は憲法記念日（祝日が週休より優先してラベルされる）
  assert.deepEqual(plan.segments.map((s) => s.kind),
    ['paid', 'weekly', 'holiday', 'holiday', 'holiday', 'substitute']);
  assert.deepEqual(plan.segments.map((s) => s.label),
    ['有給', '週休', '憲法記念日', 'みどりの日', 'こどもの日', '振替休日']);
  assert.deepEqual(plan.segments.map((s) => s.count), [1, 1, 1, 1, 1, 1]);
  assert.equal(plan.segments.reduce((sum, s) => sum + s.count, 0), plan.length);
  assert.equal(plan.segments[2].from, '2026-05-03');
  // 同じラベルが続くときは1つのブロックにまとまる
  const newYear = E.planFromRange(timeline({ companyOffPresets: ['newyear'] }), '2026-05-01', '2026-05-06');
  assert.equal(newYear.segments.length, 6);
});

/* ============================================================
   書式
   ============================================================ */

test('日付の書式', () => {
  assert.equal(E.formatDate('2026-05-01'), '5月1日（金）');
  assert.equal(E.formatDate('2026-05-01', true), '2026年5月1日（金）');
  assert.equal(E.formatShort('2026-05-01'), '5/1(金)');
  assert.equal(E.formatShort('2026-05-01', true), '2026/5/1(金)');
  assert.equal(E.formatDate('bad'), '');
});

test('年をまたぐ連休だけ年つきで表示する', () => {
  const tl = timeline({ companyOffPresets: ['newyear'] });
  const inYear = E.planFromRange(tl, '2026-05-01', '2026-05-06');
  assert.equal(E.formatRange(inYear), '5/1(金)〜5/6(水)');
  const across = E.findNaturalRuns(tl, 4).find((r) => r.start.slice(0, 4) !== r.end.slice(0, 4));
  assert.ok(across);
  assert.match(E.formatRange(across), /^\d{4}\//);
});

test('効率の言い換え', () => {
  const tl = timeline();
  const plan = E.planFromRange(tl, '2026-05-01', '2026-05-06');
  assert.equal(E.describeEfficiency(plan), '有給1日で6連休');
  assert.equal(E.efficiencyText(plan), '6.0日');
  const natural = E.findNaturalRuns(tl, 5)[0];
  assert.equal(E.describeEfficiency(natural), '有給なしで' + natural.length + '連休');
  assert.equal(E.efficiencyText(natural), '—');
});

test('申請用テキストは日付・連休・合計を含む', () => {
  const tl = timeline();
  const plans = [
    E.planFromRange(tl, '2026-05-01', '2026-05-06'),
    E.planFromRange(tl, '2026-09-18', '2026-09-23')
  ];
  const text = E.buildRequestText(plans, { title: '2026年', note: '※ 希望です。' });
  assert.match(text, /有給休暇の取得予定（2026年）/);
  assert.match(text, /2026年5月1日（金） 有給取得希望/);
  assert.match(text, /2026年9月18日（金） 有給取得希望/);
  assert.match(text, /使用する有給: 合計 2日/);
  assert.match(text, /※ 希望です。/);
  // 日付の早い順に並ぶ
  assert.ok(text.indexOf('5月1日') < text.indexOf('9月18日'));
  assert.ok(!/[<>&]/.test(text));
});

/* ============================================================
   保存データの検証
   ============================================================ */

test('defaultState は妥当な既定値を返す', () => {
  const s = E.defaultState('2026-10-05');
  assert.equal(s.year, 2026);
  assert.equal(s.from, '2026-10-05');
  assert.equal(s.to, '2026-12-31');
  assert.deepEqual(s.weeklyOff, [0, 6]);
  assert.equal(s.remember, false);
  assert.deepEqual(s.picked, []);
  // 対応年の外から呼ばれても落ちない
  assert.ok(H.isSupportedYear(E.defaultState('2019-01-01').year));
});

test('sanitizeState は未知のキーを捨て、既知のキーだけを採る', () => {
  const s = E.sanitizeState({ year: 2027, sort: 'length', evil: '<script>', __proto__: { polluted: true } }, '2026-10-05');
  assert.equal(s.year, 2027);
  assert.equal(s.sort, 'length');
  assert.equal(s.evil, undefined);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test('sanitizeState は型違い・範囲外・不正日付を既定値に落とす', () => {
  const s = E.sanitizeState({
    year: 1900,
    from: 'まったく日付でない',
    to: '2026-02-30',
    weeklyOff: ['x', 9, -1, 1.5, 3, 3],
    companyOffPresets: ['newyear', 'newyear', 'evil'],
    maxTake: 10000,
    budget: -5,
    minLength: 0,
    sort: 'drop table',
    theme: 'rainbow',
    remember: 'yes'
  }, '2026-10-05');
  assert.ok(s.year >= H.MIN_YEAR && s.year <= H.MAX_YEAR);
  assert.ok(H.isValidIso(s.from) && H.isValidIso(s.to));
  assert.deepEqual(s.weeklyOff, [3]);
  assert.deepEqual(s.companyOffPresets, ['newyear']);
  assert.equal(s.maxTake, E.LIMITS.maxTakePerPlan);
  assert.equal(s.budget, 0);
  assert.equal(s.minLength, 2);
  assert.equal(s.sort, 'efficiency');
  assert.equal(s.theme, 'system');
  assert.equal(s.remember, false);   // true 以外は保存しない
});

test('sanitizeState は件数上限を守る', () => {
  const blackout = [];
  const picked = [];
  for (let i = 0; i < 500; i++) {
    blackout.push({ from: '2026-01-01', to: '2026-01-02', label: 'あ'.repeat(200) });
    picked.push({ start: '2026-05-01', end: '2026-05-06' });
  }
  const s = E.sanitizeState({ blackout: blackout, picked: picked }, '2026-10-05');
  assert.equal(s.blackout.length, E.LIMITS.maxBlackouts);
  assert.equal(s.blackout[0].label.length, 40);
  assert.equal(s.picked.length, E.LIMITS.maxPickedPlans);
});

test('sanitizeState は開始と終了が逆なら入れ替える', () => {
  const s = E.sanitizeState({ from: '2026-12-31', to: '2026-01-01' }, '2026-10-05');
  assert.equal(s.from, '2026-01-01');
  assert.equal(s.to, '2026-12-31');
  const b = E.sanitizeState({ blackout: [{ from: '2026-03-31', to: '2026-03-01' }] }, '2026-10-05');
  assert.deepEqual(b.blackout[0], { from: '2026-03-01', to: '2026-03-31', label: '' });
});

test('sanitizeState は配列でない値・null を既定値に落とす', () => {
  for (const raw of [null, undefined, 'text', 42, [], true]) {
    const s = E.sanitizeState(raw, '2026-10-05');
    assert.deepEqual(s.weeklyOff, [0, 6]);
    assert.deepEqual(s.blackout, []);
    assert.deepEqual(s.picked, []);
  }
  const s = E.sanitizeState({ weeklyOff: 'ごろごろ', blackout: 3, picked: {} }, '2026-10-05');
  assert.deepEqual(s.weeklyOff, [0, 6]);
  assert.deepEqual(s.blackout, []);
  assert.deepEqual(s.picked, []);
});

test('sanitizeState は選択プランの区間だけを残す', () => {
  const s = E.sanitizeState({
    picked: [
      { start: '2026-05-01', end: '2026-05-06', cost: 999, take: ['うそ'] },
      { start: '2026-05-06', end: '2026-05-01' },     // 逆順は捨てる
      { start: '2026-99-99', end: '2026-05-06' },     // 不正日付は捨てる
      'テキスト'
    ]
  }, '2026-10-05');
  assert.deepEqual(s.picked, [{ start: '2026-05-01', end: '2026-05-06' }]);
});

/* ============================================================
   上限（計算の暴走を防ぐガード）
   ============================================================ */

test('5年を超える期間は切られ、計算が終わる', () => {
  const tl = E.buildTimeline({ from: '2026-01-01', to: '2045-12-31', weeklyOff: [0, 6] });
  assert.equal(tl.days.length, E.LIMITS.maxSpanDays + E.LIMITS.padDays * 2);
  const plans = E.findPlans(tl, { maxTake: 2, minLength: 4 });
  assert.ok(plans.length > 100);
  const result = E.composeYear(plans, 20);
  assert.ok(result.totalCost <= 20);
});

test('曜日は範囲外・非整数を捨てる（丸めない）', () => {
  assert.equal(E.toDow(0), 0);
  assert.equal(E.toDow(6), 6);
  assert.equal(E.toDow(7), -1);
  assert.equal(E.toDow(-1), -1);
  assert.equal(E.toDow(1.5), -1);
  assert.equal(E.toDow('3'), 3);
  assert.equal(E.toDow('月'), -1);
  assert.equal(E.toDow(null), -1);
  assert.equal(E.toDow(''), -1);
  assert.equal(E.toDow(false), -1);
  assert.equal(E.toDow([]), -1);
  assert.equal(E.toDow([3]), -1);
  // 9 を「土曜」に丸めると、選んでいない曜日が休みになってしまう
  const tl = timeline({ weeklyOff: [9, 2] });
  assert.equal(day(tl, '2026-05-02').off, false);          // 土曜は休みにならない
  assert.equal(day(tl, '2026-05-03').offKind, 'holiday');  // 日曜だが祝日なので休み
  assert.equal(day(tl, '2026-05-12').offKind, 'weekly');   // 火曜だけが週休
  assert.equal(day(tl, '2026-05-13').off, false);          // 水曜
});

/* ============================================================
   表示用の代表選び（レビュー R4 / 原因γ）
   ============================================================ */

test('pickDistinct は重ならないプランだけを順位順に採る', () => {
  const tl = timeline({ companyOffPresets: ['newyear'] });
  const ranked = E.rankPlans(E.findPlans(tl, { maxTake: 3, minLength: 3 }), 'efficiency');
  // 上限で打ち切られると「重なりが理由で落ちた」の検査ができないため、上限は外す
  const distinct = E.pickDistinct(ranked, 1000);

  assert.ok(distinct.length > 0);
  assert.ok(distinct.length < ranked.length, '代表の方が少ないはず');
  // 最上位は必ず残る
  assert.equal(distinct[0].id, ranked[0].id);
  // 代表同士は重ならない
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      assert.ok(!E.overlaps(distinct[i], distinct[j]),
        '代表が重なっている: ' + distinct[i].id + ' / ' + distinct[j].id);
    }
  }
  // 順位の順序は保たれる
  const order = ranked.map((p) => p.id);
  for (let i = 1; i < distinct.length; i++) {
    assert.ok(order.indexOf(distinct[i - 1].id) < order.indexOf(distinct[i].id));
  }
  // 落とされたプランは必ずどれかの代表と重なる（理由なく消えない）
  const kept = new Set(distinct.map((p) => p.id));
  for (const plan of ranked) {
    if (kept.has(plan.id)) continue;
    assert.ok(distinct.some((d) => E.overlaps(d, plan)), plan.id + ' が理由なく落ちている');
  }
});

test('pickDistinct は件数の上限を守り、空配列でも落ちない', () => {
  const tl = timeline();
  const ranked = E.rankPlans(E.findPlans(tl, { maxTake: 3, minLength: 3 }), 'efficiency');
  assert.equal(E.pickDistinct(ranked, 3).length, 3);
  assert.ok(E.pickDistinct(ranked, 10000).length <= ranked.length);
  assert.deepEqual(E.pickDistinct([], 10), []);
  // 不正な上限は既定の40に落ちる
  assert.ok(E.pickDistinct(ranked, 'abc').length <= 40);
});

test('sanitizeState は showAll を真偽値として扱う', () => {
  assert.equal(E.defaultState('2026-10-05').showAll, false);
  assert.equal(E.sanitizeState({ showAll: true }, '2026-10-05').showAll, true);
  assert.equal(E.sanitizeState({ showAll: 'yes' }, '2026-10-05').showAll, false);
  assert.equal(E.sanitizeState({ showAll: 1 }, '2026-10-05').showAll, false);
  assert.equal(E.sanitizeState({}, '2026-10-05').showAll, false);
});
