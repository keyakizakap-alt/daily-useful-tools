import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeState,
  deserializeState,
  saveState,
  loadState,
  STORAGE_KEY,
  SCHEMA_VERSION,
} from '../src/lib/storage.js';

/** localStorage 互換の最小限のスタブ。 */
function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() {
      return map.size;
    },
  };
}

const SAMPLE = {
  targetTime: '18:30',
  cooks: 2,
  dishes: [
    { id: 'a', name: '味噌汁', holdMinutes: 5, steps: [{ name: '切る', minutes: 5, attended: true }] },
  ],
};

test('serialize → deserialize で内容が保たれる', () => {
  const restored = deserializeState(serializeState(SAMPLE));
  assert.equal(restored.targetTime, '18:30');
  assert.equal(restored.cooks, 2);
  assert.equal(restored.version, SCHEMA_VERSION);
  assert.deepEqual(restored.dishes, SAMPLE.dishes);
});

test('serializeState: 不正な cooks は 1 に丸められる', () => {
  const restored = deserializeState(serializeState({ ...SAMPLE, cooks: 0 }));
  assert.equal(restored.cooks, 1);
});

test('serializeState: 状態がオブジェクトでなければ例外', () => {
  assert.throws(() => serializeState(null), /保存する状態が不正/);
});

test('deserializeState: 壊れた入力では null を返しアプリを止めない', () => {
  assert.equal(deserializeState(null), null);
  assert.equal(deserializeState(''), null);
  assert.equal(deserializeState('{壊れたJSON'), null);
  assert.equal(deserializeState('[1,2,3]'), null, '配列は不正');
  assert.equal(deserializeState('"文字列"'), null);
});

test('deserializeState: 未知のバージョンは読み込まない', () => {
  assert.equal(deserializeState(JSON.stringify({ version: 999, dishes: [] })), null);
});

test('deserializeState: dishes が欠けていれば null', () => {
  assert.equal(deserializeState(JSON.stringify({ version: SCHEMA_VERSION })), null);
});

test('deserializeState: 壊れた料理・工程は取り除かれる', () => {
  const restored = deserializeState(
    JSON.stringify({
      version: SCHEMA_VERSION,
      targetTime: '18:00',
      cooks: 1,
      dishes: [
        null,
        { name: 123 },
        { name: '正しい料理', steps: [{ name: '切る', minutes: '5' }, null, { minutes: 3 }] },
      ],
    }),
  );
  assert.equal(restored.dishes.length, 1);
  assert.equal(restored.dishes[0].name, '正しい料理');
  assert.equal(restored.dishes[0].steps.length, 1, '名前のない工程は除去される');
  assert.equal(restored.dishes[0].steps[0].minutes, 5, '文字列の数値は数値に変換される');
});

test('deserializeState: 負の所要時間は0に丸められる', () => {
  const restored = deserializeState(
    JSON.stringify({
      version: SCHEMA_VERSION,
      dishes: [{ name: 'A', steps: [{ name: '切る', minutes: -10 }] }],
    }),
  );
  assert.equal(restored.dishes[0].steps[0].minutes, 0);
});

test('saveState / loadState が localStorage 互換ストレージで往復する', () => {
  const storage = createMemoryStorage();
  assert.equal(saveState(SAMPLE, storage), true);
  assert.equal(storage.getItem(STORAGE_KEY) !== null, true);
  const restored = loadState(storage);
  assert.equal(restored.cooks, 2);
  assert.equal(restored.dishes[0].name, '味噌汁');
});

test('saveState: ストレージが使えなくても false を返すだけで落ちない', () => {
  const broken = {
    getItem: () => { throw new Error('拒否'); },
    setItem: () => { throw new Error('拒否'); },
  };
  assert.equal(saveState(SAMPLE, broken), false);
  assert.equal(loadState(broken), null);
  assert.equal(saveState(SAMPLE, null), false);
  assert.equal(loadState(null), null);
});

test('loadState: 空のストレージでは null', () => {
  assert.equal(loadState(createMemoryStorage()), null);
});
