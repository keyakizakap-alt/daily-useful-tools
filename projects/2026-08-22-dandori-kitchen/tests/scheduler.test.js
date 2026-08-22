import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, normalizeDishes, toTimeSlots } from '../src/lib/scheduler.js';
import { parseTime } from '../src/lib/time.js';

const AT = (name, minutes) => ({ name, minutes, attended: true });   // つきっきり
const UN = (name, minutes) => ({ name, minutes, attended: false });  // 放置

const TARGET = parseTime('18:30'); // 1110

/**
 * つきっきり工程が「調理者の人数」を超えて重なっていないことを検証するヘルパー。
 * スケジューラの最も重要な不変条件。
 */
function assertNoOverbooking(result, cooks) {
  const attended = result.entries.filter((entry) => entry.attended && entry.minutes > 0);
  for (const probe of attended) {
    // 各工程の開始直後の瞬間に、何本のつきっきり工程が走っているか数える
    const instant = probe.startTime;
    const concurrent = attended.filter(
      (entry) => entry.startTime <= instant && entry.endTime > instant,
    );
    assert.ok(
      concurrent.length <= cooks,
      `${probe.stepName} の開始時点で ${concurrent.length} 本のつきっきり工程が重なっています` +
        `（上限 ${cooks}）: ${concurrent.map((e) => e.stepName).join(', ')}`,
    );
  }
}

/** 各料理の工程が調理順どおりに並んでいることを検証する。 */
function assertStepOrder(result) {
  const byDish = new Map();
  for (const entry of result.entries) {
    if (!byDish.has(entry.dishId)) byDish.set(entry.dishId, []);
    byDish.get(entry.dishId).push(entry);
  }
  for (const [dishId, entries] of byDish) {
    entries.sort((a, b) => a.stepIndex - b.stepIndex);
    for (let i = 0; i < entries.length - 1; i += 1) {
      assert.ok(
        entries[i].endTime <= entries[i + 1].startTime,
        `${dishId}: 工程「${entries[i].stepName}」が次の工程「${entries[i + 1].stepName}」より後に終わっています`,
      );
    }
  }
}

test('1品だけなら合計時間ぶん前に開始する', () => {
  const result = schedule(
    [{ id: 'a', name: '焼き魚', steps: [AT('塩をふる', 2), UN('グリルで焼く', 12)] }],
    { targetTime: TARGET },
  );
  assert.equal(result.totalMinutes, 14);
  assert.equal(result.startTime, TARGET - 14);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].stepName, '塩をふる');
  assert.equal(result.entries[0].startTime, TARGET - 14);
  assert.equal(result.entries[1].endTime, TARGET, '最後の工程はできあがり時刻ちょうどに終わる');
});

test('holdMinutes を指定すると、その分だけ早く完成させる', () => {
  const result = schedule(
    [{ id: 'a', name: 'サラダ', holdMinutes: 30, steps: [AT('野菜を切る', 10)] }],
    { targetTime: TARGET },
  );
  assert.equal(result.entries[0].endTime, TARGET - 30, '30分前に作り終える');
  assert.equal(result.totalMinutes, 40);
  assert.equal(result.dishSummaries[0].finishTime, TARGET - 30);
});

test('放置工程どうしは何本でも並行できる', () => {
  const result = schedule(
    [
      { id: 'a', name: '煮物', steps: [UN('煮込む', 30)] },
      { id: 'b', name: 'ごはん', steps: [UN('炊く', 30)] },
      { id: 'c', name: 'スープ', steps: [UN('煮る', 30)] },
    ],
    { targetTime: TARGET },
  );
  assert.equal(result.totalMinutes, 30, '直列化されず30分のまま');
  for (const entry of result.entries) {
    assert.equal(entry.endTime, TARGET);
  }
});

test('つきっきり工程は重ならないように前倒しされる', () => {
  const result = schedule(
    [
      { id: 'a', name: '料理A', steps: [AT('炒める', 10)] },
      { id: 'b', name: '料理B', steps: [AT('焼く', 10)] },
    ],
    { targetTime: TARGET },
  );
  // 2本とも18:30に終わらせたいが、1人では無理なので片方が前倒しになる
  assert.equal(result.totalMinutes, 20);
  assertNoOverbooking(result, 1);
  const ends = result.entries.map((entry) => entry.endTime).sort((a, b) => a - b);
  assert.deepEqual(ends, [TARGET - 10, TARGET]);
});

test('前倒しされた工程より手前の工程も一緒に前倒しされる（順序が壊れない）', () => {
  const result = schedule(
    [
      { id: 'a', name: '料理A', steps: [AT('下ごしらえA', 5), AT('仕上げA', 10)] },
      { id: 'b', name: '料理B', steps: [AT('下ごしらえB', 5), AT('仕上げB', 10)] },
    ],
    { targetTime: TARGET },
  );
  assertStepOrder(result);
  assertNoOverbooking(result, 1);
  // 全工程つきっきりなので合計30分が直列に並ぶ
  assert.equal(result.totalMinutes, 30);
  assert.equal(result.activeMinutes, 30);
  assert.equal(result.idleMinutes, 0, '手が空く時間はない');
});

test('放置時間に別の料理のつきっきり工程を差し込める', () => {
  // 煮込み30分の裏でサラダ(10分)を作れるので、合計は40分ではなく35分に収まる
  const result = schedule(
    [
      { id: 'a', name: '煮物', steps: [AT('切る', 5), UN('煮込む', 30)] },
      { id: 'b', name: 'サラダ', holdMinutes: 0, steps: [AT('切る', 10)] },
    ],
    { targetTime: TARGET },
  );
  assertNoOverbooking(result, 1);
  assertStepOrder(result);
  assert.equal(result.totalMinutes, 35);
  assert.equal(result.activeMinutes, 15);
  assert.equal(result.idleMinutes, 20, '35分のうち20分は手が空く');
});

test('調理者が2人なら、つきっきり工程を2本まで並行できる', () => {
  const dishes = [
    { id: 'a', name: '料理A', steps: [AT('炒める', 10)] },
    { id: 'b', name: '料理B', steps: [AT('焼く', 10)] },
  ];
  const solo = schedule(dishes, { targetTime: TARGET, cooks: 1 });
  const pair = schedule(dishes, { targetTime: TARGET, cooks: 2 });
  assert.equal(solo.totalMinutes, 20);
  assert.equal(pair.totalMinutes, 10, '2人なら同時にできる');
  assertNoOverbooking(pair, 2);
  for (const entry of pair.entries) {
    assert.equal(entry.endTime, TARGET);
  }
});

test('3本競合を2人でさばくと、2本並行＋1本前倒しになる', () => {
  const result = schedule(
    [
      { id: 'a', name: 'A', steps: [AT('作業A', 10)] },
      { id: 'b', name: 'B', steps: [AT('作業B', 10)] },
      { id: 'c', name: 'C', steps: [AT('作業C', 10)] },
    ],
    { targetTime: TARGET, cooks: 2 },
  );
  assert.equal(result.totalMinutes, 20);
  assertNoOverbooking(result, 2);
});

test('現実的な献立（ごはん・味噌汁・生姜焼き・サラダ）が破綻せず組める', () => {
  const result = schedule(
    [
      {
        id: 'rice',
        name: 'ごはん',
        holdMinutes: 10,
        steps: [AT('米をとぐ', 5), UN('浸水', 30), UN('炊飯', 40), UN('蒸らす', 10)],
      },
      {
        id: 'soup',
        name: '味噌汁',
        holdMinutes: 5,
        steps: [AT('具材を切る', 5), UN('だしを沸かす', 5), UN('煮る', 7), AT('味噌を溶く', 2)],
      },
      {
        id: 'main',
        name: '生姜焼き',
        holdMinutes: 0,
        steps: [AT('たれを合わせる', 3), UN('豚肉を漬ける', 10), AT('玉ねぎを切る', 3), AT('焼く', 7)],
      },
      {
        id: 'salad',
        name: 'サラダ',
        holdMinutes: 45,
        steps: [AT('野菜を切る', 7), UN('冷やす', 15)],
      },
    ],
    { targetTime: TARGET, cooks: 1 },
  );
  assertNoOverbooking(result, 1);
  assertStepOrder(result);
  assert.ok(result.totalMinutes >= 85, `ごはんの85分は最低限かかる: ${result.totalMinutes}`);
  assert.ok(result.totalMinutes <= 150, `現実的な範囲に収まる: ${result.totalMinutes}`);
  assert.equal(result.startTime, TARGET - result.totalMinutes);
  // 生姜焼きは熱々で出したいので、できあがり時刻ちょうどに終わる
  const main = result.dishSummaries.find((d) => d.dishId === 'main');
  assert.equal(main.finishTime, TARGET);
});

test('工程が1つもない料理でも落ちない', () => {
  const result = schedule([{ id: 'a', name: '買ってきた惣菜', steps: [] }], { targetTime: TARGET });
  assert.equal(result.totalMinutes, 0);
  assert.equal(result.entries.length, 0);
  assert.ok(result.warnings.some((w) => w.includes('工程が登録されていません')));
});

test('所要時間0分の工程は競合解消の対象にならない', () => {
  const result = schedule(
    [
      { id: 'a', name: 'A', steps: [AT('確認する', 0), AT('焼く', 10)] },
      { id: 'b', name: 'B', steps: [AT('焼く', 10)] },
    ],
    { targetTime: TARGET },
  );
  assert.equal(result.totalMinutes, 20);
  assertNoOverbooking(result, 1);
});

test('開始が前日にずれ込む場合は警告を出す', () => {
  const result = schedule(
    [{ id: 'a', name: '仕込み', steps: [UN('寝かせる', 600)] }],
    { targetTime: parseTime('07:00') },
  );
  assert.ok(result.startTime < 0, '前日にずれ込む');
  assert.ok(result.warnings.some((w) => w.includes('前日')));
});

test('総所要時間が長い場合は短縮のヒントを出す', () => {
  const result = schedule(
    [{ id: 'a', name: '煮込み', steps: [UN('煮込む', 200)] }],
    { targetTime: TARGET },
  );
  assert.ok(result.warnings.some((w) => w.includes('長め')));
});

test('待ち時間が発生する場合は料理ごとに集計される', () => {
  // 料理Bの仕上げに押し出されて、料理Aの工程間に待ちが生まれる
  const result = schedule(
    [
      { id: 'a', name: '料理A', steps: [AT('下ごしらえ', 20), AT('仕上げ', 5)] },
      { id: 'b', name: '料理B', steps: [AT('じっくり作業', 30)] },
    ],
    { targetTime: TARGET },
  );
  assertStepOrder(result);
  assertNoOverbooking(result, 1);
  const summary = result.dishSummaries.find((d) => d.dishId === 'a');
  assert.ok(summary.waitMinutes >= 0);
  assert.equal(result.totalMinutes, 55);
});

test('entries は時間の早い順に並ぶ', () => {
  const result = schedule(
    [
      { id: 'a', name: 'A', steps: [AT('切る', 5), UN('煮る', 20)] },
      { id: 'b', name: 'B', steps: [AT('焼く', 10)] },
    ],
    { targetTime: TARGET },
  );
  for (let i = 0; i < result.entries.length - 1; i += 1) {
    assert.ok(
      result.entries[i].startTime <= result.entries[i + 1].startTime,
      'entries が時系列順になっていない',
    );
  }
});

test('同じ入力からは常に同じ結果が得られる（決定的）', () => {
  const dishes = [
    { id: 'a', name: 'A', steps: [AT('切る', 5), UN('煮る', 20), AT('盛る', 3)] },
    { id: 'b', name: 'B', steps: [AT('焼く', 10), AT('和える', 4)] },
    { id: 'c', name: 'C', holdMinutes: 20, steps: [AT('作る', 8)] },
  ];
  const first = schedule(dishes, { targetTime: TARGET });
  const second = schedule(dishes, { targetTime: TARGET });
  assert.deepEqual(first, second);
});

test('schedule は入力の料理オブジェクトを書き換えない', () => {
  const dishes = [{ id: 'a', name: 'A', steps: [AT('切る', 5)] }];
  const snapshot = JSON.parse(JSON.stringify(dishes));
  schedule(dishes, { targetTime: TARGET });
  assert.deepEqual(dishes, snapshot);
});

test('normalizeDishes: 不正な入力を日本語メッセージで弾く', () => {
  assert.throws(() => normalizeDishes([]), /1品以上/);
  assert.throws(() => normalizeDishes('x'), /配列で指定/);
  assert.throws(() => normalizeDishes([{ name: '  ', steps: [] }]), /料理名を入力/);
  assert.throws(() => normalizeDishes([{ name: 'A', steps: 'x' }]), /工程は配列/);
  assert.throws(
    () => normalizeDishes([{ name: 'A', steps: [{ name: '切る', minutes: -1 }] }]),
    /所要時間が不正/,
  );
  assert.throws(
    () => normalizeDishes([{ name: 'A', steps: [{ name: '切る', minutes: 1.5 }] }]),
    /整数（分）/,
  );
  assert.throws(
    () => normalizeDishes([
      { id: 'same', name: 'A', steps: [] },
      { id: 'same', name: 'B', steps: [] },
    ]),
    /IDが重複/,
  );
});

test('normalizeDishes: attended は省略時 true、holdMinutes は省略時 0', () => {
  const [dish] = normalizeDishes([{ name: 'A', steps: [{ name: '切る', minutes: 5 }] }]);
  assert.equal(dish.steps[0].attended, true);
  assert.equal(dish.holdMinutes, 0);
  assert.equal(dish.id, 'dish-0');
});

test('schedule: targetTime と cooks の不正値を弾く', () => {
  const dishes = [{ id: 'a', name: 'A', steps: [AT('切る', 5)] }];
  assert.throws(() => schedule(dishes, { targetTime: 'あとで' }), /できあがり時刻/);
  assert.throws(() => schedule(dishes, { targetTime: TARGET, cooks: 0 }), /1以上の整数/);
  assert.throws(() => schedule(dishes, { targetTime: TARGET, cooks: 1.5 }), /1以上の整数/);
});

test('toTimeSlots: 同時刻の作業と、裏で進行中の放置工程をまとめる', () => {
  const result = schedule(
    [
      { id: 'a', name: '煮物', steps: [AT('切る', 5), UN('煮込む', 30)] },
      { id: 'b', name: 'サラダ', steps: [AT('切る', 10)] },
    ],
    { targetTime: TARGET },
  );
  const slots = toTimeSlots(result.entries);
  assert.ok(slots.length > 0);
  for (let i = 0; i < slots.length - 1; i += 1) {
    assert.ok(slots[i].startTime < slots[i + 1].startTime, 'スロットが時系列順でない');
  }
  // サラダを切っている最中は、煮物が裏で煮込まれている
  const saladSlot = slots.find((slot) => slot.attended.some((e) => e.dishName === 'サラダ'));
  assert.ok(saladSlot, 'サラダの作業スロットが見つからない');
  assert.ok(
    saladSlot.running.some((e) => e.dishName === '煮物'),
    '裏で進行中の煮込みが検出されていない',
  );
});

test('toTimeSlots: 配列以外は例外になる', () => {
  assert.throws(() => toTimeSlots(null), /配列で指定/);
});
