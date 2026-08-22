/**
 * ランダム生成した献立に対して、スケジューラの不変条件が常に成り立つことを検証する。
 * 乱数は固定シードの線形合同法で再現可能にしてある（失敗時に必ず再現できる）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from '../src/lib/scheduler.js';

/** 固定シードの疑似乱数生成器（線形合同法）。 */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function generateMeal(random) {
  const dishCount = 1 + Math.floor(random() * 5); // 1〜5品
  const dishes = [];
  for (let d = 0; d < dishCount; d += 1) {
    const stepCount = 1 + Math.floor(random() * 5); // 1〜5工程
    const steps = [];
    for (let s = 0; s < stepCount; s += 1) {
      steps.push({
        name: `工程${s + 1}`,
        minutes: Math.floor(random() * 31), // 0〜30分（0分も混ぜる）
        attended: random() < 0.55,
      });
    }
    dishes.push({
      id: `dish-${d}`,
      name: `料理${d + 1}`,
      holdMinutes: random() < 0.3 ? Math.floor(random() * 60) : 0,
      steps,
    });
  }
  return dishes;
}

const TARGET = 18 * 60 + 30;

test('ランダムな献立300件で不変条件が成り立つ', () => {
  const random = createRandom(20260822);
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const dishes = generateMeal(random);
    const cooks = 1 + Math.floor(random() * 3); // 1〜3人
    const result = schedule(dishes, { targetTime: TARGET, cooks });
    const context = `iteration=${iteration} cooks=${cooks} dishes=${JSON.stringify(dishes)}`;

    // 不変条件1: つきっきり工程が調理者の人数を超えて重ならない
    const attended = result.entries.filter((entry) => entry.attended && entry.minutes > 0);
    for (const probe of attended) {
      const concurrent = attended.filter(
        (entry) => entry.startTime <= probe.startTime && entry.endTime > probe.startTime,
      );
      assert.ok(concurrent.length <= cooks, `つきっきり工程の重なりが上限超過。${context}`);
    }

    // 不変条件2: 各料理の工程は調理順を守る
    for (const dish of dishes) {
      const entries = result.entries
        .filter((entry) => entry.dishId === dish.id)
        .sort((a, b) => a.stepIndex - b.stepIndex);
      for (let i = 0; i < entries.length - 1; i += 1) {
        assert.ok(entries[i].endTime <= entries[i + 1].startTime, `工程順序が逆転。${context}`);
      }
    }

    // 不変条件3: どの料理もできあがり時刻までに完成する
    for (const summary of result.dishSummaries) {
      assert.ok(summary.finishTime <= TARGET, `できあがり時刻を超過。${context}`);
    }

    // 不変条件4: 開始時刻と総所要時間が整合する
    assert.equal(result.startTime, TARGET - result.totalMinutes, `開始時刻が不整合。${context}`);
    for (const entry of result.entries) {
      assert.ok(entry.startTime >= result.startTime, `開始時刻より前の工程がある。${context}`);
      assert.equal(entry.endTime - entry.startTime, entry.minutes, `工程長が不整合。${context}`);
    }

    // 不変条件5: 各工程の所要時間は入力どおり保存される
    const inputTotal = dishes.reduce((sum, dish) => sum + dish.steps.length, 0);
    assert.equal(result.entries.length, inputTotal, `工程数が変化。${context}`);
  }
});

test('つきっきり工程だけの献立は必ず直列になる', () => {
  const random = createRandom(7);
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const dishes = generateMeal(random).map((dish) => ({
      ...dish,
      holdMinutes: 0,
      steps: dish.steps.map((step) => ({ ...step, attended: true, minutes: Math.max(1, step.minutes) })),
    }));
    const result = schedule(dishes, { targetTime: TARGET, cooks: 1 });
    const expected = dishes.reduce(
      (sum, dish) => sum + dish.steps.reduce((inner, step) => inner + step.minutes, 0),
      0,
    );
    assert.equal(result.totalMinutes, expected, '全工程つきっきりなら合計時間と一致するはず');
    assert.equal(result.idleMinutes, 0);
  }
});

test('調理者を増やすと総所要時間は決して長くならない', () => {
  const random = createRandom(99);
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const dishes = generateMeal(random);
    const solo = schedule(dishes, { targetTime: TARGET, cooks: 1 });
    const pair = schedule(dishes, { targetTime: TARGET, cooks: 2 });
    assert.ok(
      pair.totalMinutes <= solo.totalMinutes,
      `人数を増やしたのに遅くなった: ${pair.totalMinutes} > ${solo.totalMinutes}\n${JSON.stringify(dishes)}`,
    );
  }
});
