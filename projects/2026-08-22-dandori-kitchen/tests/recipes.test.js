import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESET_RECIPES,
  createDishFromPreset,
  groupPresetsByCategory,
  totalStepMinutes,
} from '../src/lib/recipes.js';
import { normalizeDishes, schedule } from '../src/lib/scheduler.js';
import { parseTime } from '../src/lib/time.js';

test('すべてのプリセットが scheduler の検証を通る', () => {
  const dishes = PRESET_RECIPES.map((recipe, index) =>
    createDishFromPreset(recipe.name, `dish-${index}`),
  );
  assert.doesNotThrow(() => normalizeDishes(dishes));
});

test('すべてのプリセットに料理名・カテゴリ・工程がある', () => {
  for (const recipe of PRESET_RECIPES) {
    assert.ok(recipe.name.length > 0, '料理名が空');
    assert.ok(recipe.category.length > 0, `${recipe.name}: カテゴリが空`);
    assert.ok(recipe.steps.length > 0, `${recipe.name}: 工程が空`);
    assert.ok(Number.isInteger(recipe.holdMinutes) && recipe.holdMinutes >= 0, `${recipe.name}: holdMinutes が不正`);
    for (const step of recipe.steps) {
      assert.ok(step.name.length > 0, `${recipe.name}: 工程名が空`);
      assert.ok(Number.isInteger(step.minutes) && step.minutes > 0, `${recipe.name}/${step.name}: 所要時間が不正`);
      assert.equal(typeof step.attended, 'boolean', `${recipe.name}/${step.name}: attended が真偽値でない`);
    }
  }
});

test('プリセットの料理名は重複しない', () => {
  const names = PRESET_RECIPES.map((recipe) => recipe.name);
  assert.equal(new Set(names).size, names.length);
});

test('createDishFromPreset: 独立したコピーを返す（プリセットを汚さない）', () => {
  const first = createDishFromPreset('味噌汁', 'a');
  first.steps[0].minutes = 999;
  const second = createDishFromPreset('味噌汁', 'b');
  assert.notEqual(second.steps[0].minutes, 999);
});

test('createDishFromPreset: IDを省略すると料理名から生成する', () => {
  assert.equal(createDishFromPreset('カレー').id, 'preset-カレー');
});

test('createDishFromPreset: 存在しない名前は例外になる', () => {
  assert.throws(() => createDishFromPreset('存在しない料理'), /プリセットが見つかりません/);
});

test('groupPresetsByCategory: カテゴリごとにまとまり、総数が一致する', () => {
  const groups = groupPresetsByCategory();
  const total = groups.reduce((sum, group) => sum + group.recipes.length, 0);
  assert.equal(total, PRESET_RECIPES.length);
  assert.ok(groups.some((group) => group.category === '主菜'));
});

test('totalStepMinutes: 工程時間を合計する', () => {
  assert.equal(totalStepMinutes(createDishFromPreset('焼き魚')), 14);
  assert.equal(totalStepMinutes({ steps: [] }), 0);
  assert.throws(() => totalStepMinutes(null), /料理の指定が不正/);
});

test('プリセットだけで組んだ献立が実際にスケジュールできる', () => {
  const dishes = ['ごはん（炊飯）', '味噌汁', '生姜焼き', 'サラダ'].map((name, index) =>
    createDishFromPreset(name, `dish-${index}`),
  );
  const result = schedule(dishes, { targetTime: parseTime('19:00'), cooks: 1 });
  assert.ok(result.totalMinutes > 0);
  assert.equal(result.entries.length, dishes.reduce((sum, dish) => sum + dish.steps.length, 0));
});
