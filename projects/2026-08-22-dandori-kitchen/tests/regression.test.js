/**
 * 模擬ユーザーの試用で見つかった不具合の再発防止テスト。
 * 各テストは feedback/review.md の指摘番号に対応する。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deserializeState, serializeState, saveState, loadState } from '../src/lib/storage.js';
import { schedule, countDishSwitches } from '../src/lib/scheduler.js';
import { createDishFromPreset } from '../src/lib/recipes.js';
import { parseTime } from '../src/lib/time.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test('F-1: すべて削除した「空の献立」が保存・復元される', () => {
  // 「料理0件」は未保存とは区別されなければならない。
  // 区別できないと、起動時に初期サンプルが復活して削除が取り消されたように見える。
  const storage = createMemoryStorage();
  saveState({ targetTime: '19:00', cooks: 1, dishes: [] }, storage);

  const restored = loadState(storage);
  assert.notEqual(restored, null, '空の献立でも保存データとして復元できること');
  assert.deepEqual(restored.dishes, [], '料理が0件のまま復元されること');
  assert.equal(restored.targetTime, '19:00', '空でも他の設定は保たれること');
});

test('F-1: 未保存の状態と、空で保存した状態が区別できる', () => {
  const empty = createMemoryStorage();
  assert.equal(loadState(empty), null, '一度も保存していなければ null');

  const cleared = createMemoryStorage();
  saveState({ targetTime: '18:30', cooks: 1, dishes: [] }, cleared);
  assert.notEqual(loadState(cleared), null, '空で保存したら null ではない');
});

test('F-1: 料理0件の直列化・復元が往復する', () => {
  const restored = deserializeState(serializeState({ targetTime: '18:30', cooks: 2, dishes: [] }));
  assert.deepEqual(restored.dishes, []);
  assert.equal(restored.cooks, 2);
});

test('F-3: 人数を増やした効果を、1人の場合と比較して算出できる', () => {
  // つきっきり工程が支配的な献立では、人数を増やすと明確に短くなる
  const attendedHeavy = [
    { id: 'a', name: 'A', steps: [{ name: '炒める', minutes: 20, attended: true }] },
    { id: 'b', name: 'B', steps: [{ name: '焼く', minutes: 20, attended: true }] },
  ];
  const solo = schedule(attendedHeavy, { targetTime: parseTime('18:30'), cooks: 1 });
  const pair = schedule(attendedHeavy, { targetTime: parseTime('18:30'), cooks: 2 });
  assert.equal(solo.totalMinutes, 40);
  assert.equal(pair.totalMinutes, 20);
  assert.ok(solo.totalMinutes - pair.totalMinutes > 0, '短縮効果が算出できる');
});

test('F-3: 放置時間が支配的な献立では、人数を増やしても総所要時間は変わらない', () => {
  // この場合は「変わらない理由」を利用者に説明する必要がある（UIの文言で対応）
  const unattendedHeavy = [
    createDishFromPreset('ごはん（炊飯）', 'rice'),
    createDishFromPreset('味噌汁', 'soup'),
  ];
  const target = parseTime('18:30');
  const solo = schedule(unattendedHeavy, { targetTime: target, cooks: 1 });
  const pair = schedule(unattendedHeavy, { targetTime: target, cooks: 2 });
  assert.equal(pair.totalMinutes, solo.totalMinutes, '炊飯の待ち時間が全体を決めている');
});

test('F-3: idleMinutes はのべ人数分の値である（表示側で呼び分ける前提を固定する）', () => {
  const dishes = [{ id: 'a', name: 'A', steps: [{ name: '炒める', minutes: 10, attended: true }] }];
  const pair = schedule(dishes, { targetTime: parseTime('18:30'), cooks: 2 });
  // 総所要10分 × 2人 - 手を動かす10分 = 10分
  assert.equal(pair.totalMinutes, 10);
  assert.equal(pair.activeMinutes, 10);
  assert.equal(pair.idleMinutes, 10, '経過時間ではなく、のべ人数分の手待ち時間');
});

test('F-5: 料理をまたぐ作業の切り替え回数を数えられる', () => {
  const entries = [
    { dishId: 'a', attended: true, minutes: 5, startTime: 0 },
    { dishId: 'a', attended: true, minutes: 5, startTime: 5 },
    { dishId: 'b', attended: true, minutes: 5, startTime: 10 },
    { dishId: 'a', attended: true, minutes: 5, startTime: 15 },
  ];
  assert.equal(countDishSwitches(entries), 2, 'a→b と b→a の2回');
});

test('F-5: 放置工程と0分の工程は切り替え回数に数えない', () => {
  const entries = [
    { dishId: 'a', attended: true, minutes: 5, startTime: 0 },
    { dishId: 'b', attended: false, minutes: 30, startTime: 5 },
    { dishId: 'c', attended: true, minutes: 0, startTime: 5 },
    { dishId: 'a', attended: true, minutes: 5, startTime: 10 },
  ];
  assert.equal(countDishSwitches(entries), 0, '同じ料理の作業が続いている');
});

test('F-5: 品数が多く細切れになる献立では警告が出る', () => {
  // 「つきっきり→別料理のつきっきり」が頻繁に入れ替わる献立を作る
  const dishes = [];
  for (let i = 0; i < 8; i += 1) {
    dishes.push({
      id: `dish-${i}`,
      name: `料理${i + 1}`,
      holdMinutes: 0,
      steps: [
        { name: '切る', minutes: 3, attended: true },
        { name: '煮る', minutes: 20, attended: false },
        { name: '仕上げる', minutes: 2, attended: true },
      ],
    });
  }
  const result = schedule(dishes, { targetTime: parseTime('19:00'), cooks: 1 });
  assert.ok(
    result.warnings.some((warning) => warning.includes('切り替え')),
    `切り替えの警告が出るべき: ${JSON.stringify(result.warnings)}`,
  );
});

test('F-5: 3品程度の現実的な献立では、切り替えの警告は出ない', () => {
  const dishes = ['ごはん（炊飯）', '味噌汁', '生姜焼き'].map((name, index) =>
    createDishFromPreset(name, `dish-${index}`),
  );
  const result = schedule(dishes, { targetTime: parseTime('18:30'), cooks: 1 });
  assert.ok(
    !result.warnings.some((warning) => warning.includes('切り替え')),
    `平日の3品で警告を出してはいけない: ${JSON.stringify(result.warnings)}`,
  );
});
