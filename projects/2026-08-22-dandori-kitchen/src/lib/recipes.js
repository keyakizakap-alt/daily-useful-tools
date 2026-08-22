/**
 * よく作る日本の家庭料理のプリセット。
 * 起動直後から使えるようにするための初期データで、副作用はない。
 *
 * minutes は家庭での目安。attended: false は「火にかけて放置できる」工程。
 */

/** @typedef {import('./scheduler.js').Dish} Dish */

/** @type {ReadonlyArray<Omit<Dish, 'id'> & {category: string}>} */
export const PRESET_RECIPES = Object.freeze([
  {
    name: 'ごはん（炊飯）',
    category: '主食',
    holdMinutes: 10,
    steps: [
      { name: '米をとぐ', minutes: 5, attended: true },
      { name: '浸水させる', minutes: 30, attended: false },
      { name: '炊飯する', minutes: 40, attended: false },
      { name: '蒸らす', minutes: 10, attended: false },
    ],
  },
  {
    name: '味噌汁',
    category: '汁物',
    holdMinutes: 5,
    steps: [
      { name: '具材を切る', minutes: 5, attended: true },
      { name: 'だしを沸かす', minutes: 5, attended: false },
      { name: '具材を煮る', minutes: 7, attended: false },
      { name: '味噌を溶く', minutes: 2, attended: true },
    ],
  },
  {
    name: '肉じゃが',
    category: '主菜',
    holdMinutes: 15,
    steps: [
      { name: 'じゃがいも・にんじん・玉ねぎを切る', minutes: 10, attended: true },
      { name: '肉と野菜を炒める', minutes: 6, attended: true },
      { name: '調味料を入れて煮込む', minutes: 20, attended: false },
      { name: '味を含ませる', minutes: 10, attended: false },
    ],
  },
  {
    name: '生姜焼き',
    category: '主菜',
    holdMinutes: 0,
    steps: [
      { name: 'たれを合わせる', minutes: 3, attended: true },
      { name: '豚肉を漬ける', minutes: 10, attended: false },
      { name: '玉ねぎを切る', minutes: 3, attended: true },
      { name: 'フライパンで焼く', minutes: 7, attended: true },
    ],
  },
  {
    name: 'ほうれん草のおひたし',
    category: '副菜',
    holdMinutes: 60,
    steps: [
      { name: 'お湯を沸かす', minutes: 6, attended: false },
      { name: 'ほうれん草を茹でる', minutes: 2, attended: true },
      { name: '冷水にとって絞る', minutes: 3, attended: true },
      { name: '切って和える', minutes: 3, attended: true },
    ],
  },
  {
    name: '冷奴',
    category: '副菜',
    holdMinutes: 30,
    steps: [
      { name: '豆腐を切って薬味をのせる', minutes: 3, attended: true },
    ],
  },
  {
    name: 'サラダ',
    category: '副菜',
    holdMinutes: 45,
    steps: [
      { name: '野菜を洗って切る', minutes: 7, attended: true },
      { name: '冷蔵庫で冷やす', minutes: 15, attended: false },
    ],
  },
  {
    name: 'カレー',
    category: '主菜',
    holdMinutes: 20,
    steps: [
      { name: '野菜と肉を切る', minutes: 12, attended: true },
      { name: '炒める', minutes: 8, attended: true },
      { name: '水を入れて煮込む', minutes: 20, attended: false },
      { name: 'ルウを入れて煮る', minutes: 10, attended: false },
    ],
  },
  {
    name: '焼き魚',
    category: '主菜',
    holdMinutes: 0,
    steps: [
      { name: '魚に塩をふる', minutes: 2, attended: true },
      { name: 'グリルで焼く', minutes: 12, attended: false },
    ],
  },
  {
    name: '唐揚げ',
    category: '主菜',
    holdMinutes: 0,
    steps: [
      { name: '鶏肉を切って下味をつける', minutes: 10, attended: true },
      { name: '漬け込む', minutes: 20, attended: false },
      { name: '衣をつける', minutes: 5, attended: true },
      { name: '油を熱する', minutes: 5, attended: false },
      { name: '揚げる', minutes: 10, attended: true },
    ],
  },
]);

/**
 * プリセットを scheduler が受け取れる Dish に変換する。
 *
 * @param {string} name プリセットの料理名
 * @param {string} [id] 付与するID（省略時は料理名から生成）
 * @returns {Dish}
 * @throws {Error} 該当するプリセットがない場合
 */
export function createDishFromPreset(name, id) {
  const preset = PRESET_RECIPES.find((recipe) => recipe.name === name);
  if (!preset) {
    throw new Error(`プリセットが見つかりません: ${name}`);
  }
  return {
    id: id ?? `preset-${name}`,
    name: preset.name,
    holdMinutes: preset.holdMinutes,
    steps: preset.steps.map((step) => ({ ...step })),
  };
}

/**
 * プリセットをカテゴリごとにまとめる（UIの選択リスト用）。
 *
 * @returns {Array<{category: string, recipes: string[]}>}
 */
export function groupPresetsByCategory() {
  const groups = new Map();
  for (const recipe of PRESET_RECIPES) {
    if (!groups.has(recipe.category)) groups.set(recipe.category, []);
    groups.get(recipe.category).push(recipe.name);
  }
  return [...groups.entries()].map(([category, recipes]) => ({ category, recipes }));
}

/**
 * 料理の合計調理時間（工程時間の単純合計）を返す。プリセット一覧の表示に使う。
 *
 * @param {Dish} dish
 * @returns {number} 分
 */
export function totalStepMinutes(dish) {
  if (!dish || !Array.isArray(dish.steps)) {
    throw new Error('料理の指定が不正です');
  }
  return dish.steps.reduce((sum, step) => sum + Number(step.minutes || 0), 0);
}
