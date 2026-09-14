'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('../src/lib/planner.js');
const calendar = require('../src/lib/calendar.js');
const dateutil = require('../src/lib/dateutil.js');

/**
 * テスト用の合成カレンダー。
 * pattern の 'o' = 休み、'w' = 勤務日。開始日は 2026-01-05（月曜）。
 */
function fakeDays(pattern, startDate = '2026-01-05') {
  return Array.from(pattern).map((char, index) => {
    const date = dateutil.addDays(startDate, index);
    const off = char === 'o';
    return {
      index,
      date,
      weekday: dateutil.weekdayOf(date),
      off,
      kind: off ? 'weekly' : 'workday',
      label: off ? '週休' : '勤務日',
      note: '',
      symbol: off ? '休' : '',
    };
  });
}

test('findExistingBreaks: 有給なしで成立する連休を拾う', () => {
  // 3連休 → 勤務日 → 2連休（既定 minLength=3 では拾わない）
  const days = fakeDays('ooowwwwoo');
  const breaks = planner.findExistingBreaks(days);
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].length, 3);
  assert.equal(breaks[0].cost, 0);
  assert.equal(breaks[0].start, '2026-01-05');
  assert.equal(breaks[0].end, '2026-01-07');
});

test('findExistingBreaks: minLength を下げれば短い休みも拾う', () => {
  const days = fakeDays('ooowwwwoo');
  const breaks = planner.findExistingBreaks(days, { minLength: 2 });
  assert.deepEqual(
    breaks.map((item) => item.length),
    [3, 2]
  );
});

test('findExistingBreaks: 2026年のシルバーウィークは有給0日で5連休', () => {
  const result = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 21 });
  const breaks = planner.findExistingBreaks(result.days);
  const silverWeek = breaks.find((item) => item.start === '2026-09-19');
  assert.ok(silverWeek, 'シルバーウィークが検出されない');
  assert.equal(silverWeek.length, 5, '9/19(土)〜9/23(水)の5連休');
  assert.equal(silverWeek.end, '2026-09-23');
  assert.equal(silverWeek.cost, 0);
});

test('findPlans: 飛び石を1日の有給でつなぐ', () => {
  // 休 休 [勤] 休 休 → 中日1日の有給で5連休
  const days = fakeDays('oowoo');
  const plans = planner.findPlans(days, { budget: 1 });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].cost, 1);
  assert.equal(plans[0].length, 5);
  assert.equal(plans[0].perDay, 5);
  assert.deepEqual(plans[0].ptoDates, ['2026-01-07']);
  assert.equal(plans[0].start, '2026-01-05');
  assert.equal(plans[0].end, '2026-01-09');
});

test('findPlans: 有給を置く区間の両端は必ず勤務日', () => {
  const days = fakeDays('woowoow');
  const plans = planner.findPlans(days, { budget: 3, minLength: 1 });
  plans.forEach((plan) => {
    plan.ptoDates.forEach((date) => {
      const day = days.find((d) => d.date === date);
      assert.equal(day.off, false, `${date} は勤務日でないのに有給が置かれている`);
    });
    // 有給日の最小・最大が区間の端になっている（端が休みの無駄な区間でない）
    const first = plan.ptoDates[0];
    const last = plan.ptoDates[plan.ptoDates.length - 1];
    assert.ok(first <= last);
  });
});

test('findPlans: 予算を超える候補は返さない', () => {
  // 休 休 [勤 勤 勤] 休 休 … 7連休にするには有給3日が必要
  const days = fakeDays('oowwwoo');

  const budget1 = planner.findPlans(days, { budget: 1 });
  assert.ok(budget1.length > 0, '予算1でも週末に足す形の候補は成立する');
  assert.equal(Math.max(...budget1.map((plan) => plan.length)), 3, '予算1では最長3連休');
  assert.equal(Math.max(...budget1.map((plan) => plan.cost)), 1);

  const budget2 = planner.findPlans(days, { budget: 2 });
  assert.equal(Math.max(...budget2.map((plan) => plan.length)), 4, '予算2では最長4連休');

  const budget3 = planner.findPlans(days, { budget: 3 });
  const full = budget3.find((plan) => plan.length === 7);
  assert.ok(full, '予算3で7連休が成立する');
  assert.equal(full.cost, 3);
  assert.deepEqual(full.ptoDates, ['2026-01-07', '2026-01-08', '2026-01-09']);
});

test('findPlans: 予算0では候補なし', () => {
  assert.deepEqual(planner.findPlans(fakeDays('oowoo'), { budget: 0 }), []);
});

test('findPlans: 同じ連休範囲は最小コストの1件だけ残る', () => {
  const days = fakeDays('oowoo');
  const plans = planner.findPlans(days, { budget: 3 });
  const ranges = plans.map((plan) => `${plan.start}..${plan.end}`);
  assert.equal(new Set(ranges).size, ranges.length, '同じ範囲の候補が重複している');
});

test('findPlans: 効率（1日あたり）の降順に並ぶ', () => {
  const result = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 120 });
  const plans = planner.findPlans(result.days, { budget: 3 });
  assert.ok(plans.length > 5);
  for (let i = 1; i < plans.length; i += 1) {
    assert.ok(
      plans[i - 1].perDay >= plans[i].perDay,
      `${i} 番目で効率の順序が崩れている: ${plans[i - 1].perDay} < ${plans[i].perDay}`
    );
  }
  // 同効率なら連休日数の降順
  for (let i = 1; i < plans.length; i += 1) {
    if (plans[i - 1].perDay === plans[i].perDay) {
      assert.ok(plans[i - 1].length >= plans[i].length);
    }
  }
});

test('findPlans: 並び順が決定的（同じ入力で同じ結果）', () => {
  const result = calendar.buildCalendar({ startDate: '2026-04-01', dayCount: 180 });
  const first = planner.findPlans(result.days, { budget: 4 });
  const second = planner.findPlans(result.days, { budget: 4 });
  assert.deepEqual(first, second);
});

test('findPlans: 連休範囲内の休みと有給の合計が連休日数に一致する', () => {
  const result = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 200 });
  const plans = planner.findPlans(result.days, { budget: 3 });
  plans.forEach((plan) => {
    const composed = Object.values(plan.composition).reduce((a, b) => a + b, 0);
    assert.equal(composed, plan.length, `${plan.start} の内訳合計が連休日数と不一致`);
    assert.equal(plan.composition.pto, plan.cost);
    assert.equal(plan.perDay, Math.round((plan.length / plan.cost) * 100) / 100);
  });
});

test('findPlans: 連休範囲の内側は全て休みか有給である', () => {
  const result = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 200 });
  const plans = planner.findPlans(result.days, { budget: 3 });
  plans.forEach((plan) => {
    const ptoSet = new Set(plan.ptoDates);
    for (let i = plan.startIndex; i <= plan.endIndex; i += 1) {
      const day = result.days[i];
      assert.ok(day.off || ptoSet.has(day.date), `${day.date} が休みでも有給でもない`);
    }
    // 連休の外側は勤務日（= 最大まで延ばしてある）
    if (plan.startIndex > 0) assert.equal(result.days[plan.startIndex - 1].off, false);
    if (plan.endIndex < result.days.length - 1) {
      assert.equal(result.days[plan.endIndex + 1].off, false);
    }
  });
});

test('findPlans: 全日休みの期間では候補が出ない', () => {
  assert.deepEqual(planner.findPlans(fakeDays('ooooooo'), { budget: 3 }), []);
});

test('findPlans: 休みが1日もない期間は有給ぶんしか休めない（効率1.0）', () => {
  const plans = planner.findPlans(fakeDays('wwwww'), { budget: 3 });
  // 3日連続で取る置き方が3通り（1〜3日目 / 2〜4日目 / 3〜5日目）
  assert.equal(plans.length, 3);
  plans.forEach((plan) => {
    assert.equal(plan.length, 3);
    assert.equal(plan.cost, 3);
    assert.equal(plan.perDay, 1, '週末が絡まないので効率は1.0');
  });
});

test('findPlans: 期間端に接する連休には truncated フラグが立つ', () => {
  const days = fakeDays('owwo');
  const plans = planner.findPlans(days, { budget: 2, minLength: 3 });
  const touching = plans.find((plan) => plan.startIndex === 0);
  assert.ok(touching);
  assert.equal(touching.truncatedStart, true);
  assert.equal(touching.truncatedEnd, true);
});

test('findPlans: reason に日ごとの根拠が入る', () => {
  const days = fakeDays('oowoo');
  const plan = planner.findPlans(days, { budget: 1 })[0];
  assert.match(plan.reason, /1\/7\(水\) 有給/);
  assert.match(plan.reason, /1\/5\(月\) 週休/);
  assert.equal(plan.reason.split(' / ').length, 5);
});

test('findPlans: 不正な予算は例外', () => {
  const days = fakeDays('oowoo');
  assert.throws(() => planner.findPlans(days, { budget: -1 }), /0〜40/);
  assert.throws(() => planner.findPlans(days, { budget: 41 }), /0〜40/);
  assert.throws(() => planner.findPlans(days, { budget: 1.5 }), /0〜40/);
  assert.throws(() => planner.findPlans([], { budget: 1 }), /空です/);
});

test('planYear: 採用プランが重複せず、勤務日を挟む', () => {
  const result = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 365 });
  const year = planner.planYear(result.days, { budget: 5 });
  assert.ok(year.plans.length > 0);
  for (let i = 1; i < year.plans.length; i += 1) {
    assert.ok(
      year.plans[i].startIndex >= year.plans[i - 1].endIndex + 2,
      `${year.plans[i - 1].end} と ${year.plans[i].start} が隣接または重複している`
    );
  }
});

test('planYear: 予算を超えて有給を使わない', () => {
  const result = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 365 });
  for (const budget of [1, 3, 5, 10, 20]) {
    const year = planner.planYear(result.days, { budget });
    assert.ok(year.usedDays <= budget, `予算 ${budget} に対し ${year.usedDays} 日使っている`);
    assert.equal(
      year.usedDays,
      year.plans.reduce((sum, plan) => sum + plan.cost, 0)
    );
    assert.equal(
      year.totalDays,
      year.plans.reduce((sum, plan) => sum + plan.length, 0)
    );
  }
});

test('planYear: 予算を増やすと合計連休日数は減らない（単調性）', () => {
  const result = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 365 });
  let previous = 0;
  for (const budget of [0, 1, 2, 3, 4, 5, 6, 8, 10]) {
    const year = planner.planYear(result.days, { budget });
    assert.ok(
      year.totalDays >= previous,
      `予算 ${budget} で合計が減った: ${previous} → ${year.totalDays}`
    );
    previous = year.totalDays;
  }
});

test('planYear: 単発の最良プランより悪くならない', () => {
  const result = calendar.buildCalendar({ startDate: '2026-01-05', dayCount: 365 });
  const budget = 4;
  const best = planner.findPlans(result.days, { budget })[0];
  const year = planner.planYear(result.days, { budget });
  assert.ok(
    year.totalDays >= best.length,
    `年間プラン(${year.totalDays}日) が単発の最良(${best.length}日) を下回った`
  );
});

test('planYear: 素朴な全探索の最適値と一致する（小さな入力）', () => {
  // 'oowoo wwww oowoo' 相当。最適は 1 日の有給で 5 連休を 2 回。
  const days = fakeDays('oowoowwwwoowoo');
  const brute = bruteForceBest(days, 2);
  const year = planner.planYear(days, { budget: 2 });
  assert.equal(year.totalDays, brute, '動的計画法の結果が全探索の最適値と一致しない');
  assert.equal(year.totalDays, 10);
  assert.equal(year.usedDays, 2);
  assert.equal(year.plans.length, 2);
});

test('planYear: 予算0なら空', () => {
  const days = fakeDays('oowoo');
  const year = planner.planYear(days, { budget: 0 });
  assert.deepEqual(year, { plans: [], totalDays: 0, usedDays: 0, budget: 0 });
});

test('planYear: 候補が存在しない場合も安全に空を返す', () => {
  const year = planner.planYear(fakeDays('ooooo'), { budget: 3 });
  assert.deepEqual(year.plans, []);
  assert.equal(year.totalDays, 0);
});

test('dropDominatedPlans: 上位に含まれ有給が同じか多い候補を落とす', () => {
  const plans = [
    { startIndex: 0, endIndex: 10, cost: 1 },
    { startIndex: 2, endIndex: 8, cost: 2 }, // 含まれ、有給も多い → 落ちる
    { startIndex: 2, endIndex: 8, cost: 1 }, // 含まれ、有給は同じ（短いだけ損）→ 落ちる
    { startIndex: 0, endIndex: 12, cost: 2 }, // 先の候補より伸びている → 残る
    { startIndex: 20, endIndex: 25, cost: 1 }, // 別の時期 → 残る
  ];
  assert.deepEqual(
    planner.dropDominatedPlans(plans).map((plan) => `${plan.startIndex}-${plan.endIndex}:${plan.cost}`),
    ['0-10:1', '0-12:2', '20-25:1']
  );
});

test('dropDominatedPlans: 実データでは連休範囲が重複しない', () => {
  const built = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 200 });
  const kept = planner.dropDominatedPlans(planner.findPlans(built.days, { budget: 3 }));
  const ranges = kept.map((plan) => `${plan.start}..${plan.end}`);
  assert.equal(new Set(ranges).size, ranges.length);
  // 残った候補はどれも、ほかの候補に包含されていない
  kept.forEach((plan) => {
    kept.forEach((other) => {
      if (plan === other) return;
      const contained =
        other.startIndex <= plan.startIndex &&
        other.endIndex >= plan.endIndex &&
        other.cost <= plan.cost;
      assert.equal(contained, false, `${plan.start}..${plan.end} が包含されたまま残っている`);
    });
  });
});

test('dropDominatedPlans: 空配列でも落ちない', () => {
  assert.deepEqual(planner.dropDominatedPlans([]), []);
});

test('selectVariedPlans: 同じ時期の候補は上限まで', () => {
  const plans = [
    { startIndex: 0, endIndex: 6, cost: 1 },
    { startIndex: 1, endIndex: 8, cost: 2 },
    { startIndex: 2, endIndex: 9, cost: 3 }, // 3件目の変種 → 落ちる
    { startIndex: 30, endIndex: 36, cost: 1 },
  ];
  const shown = planner.selectVariedPlans(plans, { limit: 10, maxPerCluster: 2 });
  assert.deepEqual(
    shown.map((plan) => plan.startIndex),
    [0, 1, 30]
  );
});

test('selectVariedPlans: 順位を入れ替えない', () => {
  const plans = [
    { startIndex: 0, endIndex: 6, cost: 1 },
    { startIndex: 30, endIndex: 36, cost: 1 },
    { startIndex: 1, endIndex: 8, cost: 2 },
  ];
  const shown = planner.selectVariedPlans(plans, { limit: 10, maxPerCluster: 2 });
  assert.deepEqual(
    shown.map((plan) => plan.startIndex),
    [0, 30, 1],
    '元の並び順を保つ'
  );
});

test('selectVariedPlans: 件数上限を守る', () => {
  const plans = Array.from({ length: 50 }, (_, i) => ({
    startIndex: i * 10,
    endIndex: i * 10 + 3,
    cost: 1,
  }));
  assert.equal(planner.selectVariedPlans(plans, { limit: 12 }).length, 12);
  assert.equal(planner.selectVariedPlans(plans, { limit: 0 }).length, 0);
  assert.equal(planner.selectVariedPlans(plans, { limit: 100 }).length, 50);
});

test('selectVariedPlans: 不正な引数は例外', () => {
  assert.throws(() => planner.selectVariedPlans([], { limit: -1 }), /0 以上/);
  assert.throws(() => planner.selectVariedPlans([], { maxPerCluster: 0 }), /1 以上/);
  assert.throws(() => planner.selectVariedPlans([], { maxPerCluster: 1.5 }), /1 以上/);
});

test('selectVariedPlans: 実データで表示される時期が分散する', () => {
  const built = calendar.buildCalendar({ startDate: '2026-09-14', dayCount: 365 });
  const plans = planner.dropDominatedPlans(planner.findPlans(built.days, { budget: 5 }));
  const shown = planner.selectVariedPlans(plans, { limit: 12, maxPerCluster: 2 });

  assert.equal(shown.length, 12);
  // 重なり合う候補を数え、どのクラスタも2件以内であること
  shown.forEach((plan) => {
    const overlapping = shown.filter(
      (other) => other.startIndex <= plan.endIndex && plan.startIndex <= other.endIndex
    );
    assert.ok(
      overlapping.length <= 2,
      `${plan.start} の時期に ${overlapping.length} 件が集中している`
    );
  });

  // 絞り込み前は4時期ほどに偏っていたので、明確に増えていること
  const months = new Set(shown.map((plan) => plan.start.slice(0, 7)));
  assert.ok(months.size >= 6, `表示される月が少なすぎる: ${Array.from(months).join(', ')}`);
});

/** 候補の全部分集合を試す参照実装（小さな入力専用） */
function bruteForceBest(days, budget) {
  const candidates = planner.findPlans(days, { budget });
  let best = 0;
  const n = candidates.length;
  const total = 1 << n;
  for (let mask = 0; mask < total; mask += 1) {
    const chosen = [];
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) chosen.push(candidates[i]);
    chosen.sort((a, b) => a.startIndex - b.startIndex);
    let cost = 0;
    let length = 0;
    let ok = true;
    for (let i = 0; i < chosen.length; i += 1) {
      cost += chosen[i].cost;
      length += chosen[i].length;
      if (i > 0 && chosen[i].startIndex < chosen[i - 1].endIndex + 2) ok = false;
    }
    if (ok && cost <= budget && length > best) best = length;
  }
  return best;
}
