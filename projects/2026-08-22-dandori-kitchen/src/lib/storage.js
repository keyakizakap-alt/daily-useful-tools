/**
 * 献立の保存・復元。
 *
 * 直列化/復元のロジック（純関数）と、localStorage への読み書き（副作用あり）を
 * 分離しており、前者だけを Node のテストから検証できるようにしている。
 * 外部への通信は一切行わない。
 */

/** @typedef {import('./scheduler.js').Dish} Dish */

/** localStorage のキー。バージョンを含めて将来のスキーマ変更に備える。 */
export const STORAGE_KEY = 'dandori-kitchen/v1';

/** 保存データの現行スキーマバージョン。 */
export const SCHEMA_VERSION = 1;

/**
 * @typedef {Object} SavedState
 * @property {number} version
 * @property {string} targetTime "18:30" 形式
 * @property {number} cooks 調理者の人数
 * @property {Dish[]} dishes
 */

/**
 * 保存用の状態をJSON文字列に直列化する。
 *
 * @param {{targetTime: string, cooks: number, dishes: Dish[]}} state
 * @returns {string}
 */
export function serializeState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('保存する状態が不正です');
  }
  const payload = {
    version: SCHEMA_VERSION,
    targetTime: String(state.targetTime ?? '18:30'),
    cooks: Number.isInteger(state.cooks) && state.cooks >= 1 ? state.cooks : 1,
    dishes: Array.isArray(state.dishes) ? state.dishes : [],
  };
  return JSON.stringify(payload);
}

/**
 * 保存されたJSON文字列を復元する。
 * 壊れたデータや未知のバージョンでもアプリを止めず、既定値にフォールバックする。
 *
 * @param {string|null|undefined} text
 * @returns {SavedState|null} 復元できなければ null
 */
export function deserializeState(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.version !== SCHEMA_VERSION) return null;
  if (!Array.isArray(parsed.dishes)) return null;

  const dishes = parsed.dishes
    .filter((dish) => dish && typeof dish === 'object' && typeof dish.name === 'string')
    .map((dish, index) => ({
      id: typeof dish.id === 'string' && dish.id !== '' ? dish.id : `dish-${index}`,
      name: dish.name,
      holdMinutes: Number.isFinite(Number(dish.holdMinutes)) ? Number(dish.holdMinutes) : 0,
      steps: Array.isArray(dish.steps)
        ? dish.steps
            .filter((step) => step && typeof step === 'object' && typeof step.name === 'string')
            .map((step) => ({
              name: step.name,
              minutes: Number.isFinite(Number(step.minutes)) ? Math.max(0, Math.round(Number(step.minutes))) : 0,
              attended: step.attended !== false,
            }))
        : [],
    }));

  return {
    version: SCHEMA_VERSION,
    targetTime: typeof parsed.targetTime === 'string' ? parsed.targetTime : '18:30',
    cooks: Number.isInteger(parsed.cooks) && parsed.cooks >= 1 ? parsed.cooks : 1,
    dishes,
  };
}

/**
 * localStorage に保存する。保存できなかった場合は false を返す
 * （プライベートブラウジング等で例外になることがあるため）。
 *
 * @param {{targetTime: string, cooks: number, dishes: Dish[]}} state
 * @param {Storage} [storage] 差し替え可能なストレージ（テスト用）
 * @returns {boolean}
 */
export function saveState(state, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serializeState(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * localStorage から復元する。読めなければ null。
 *
 * @param {Storage} [storage] 差し替え可能なストレージ（テスト用）
 * @returns {SavedState|null}
 */
export function loadState(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    return deserializeState(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
