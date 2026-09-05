"use strict";
/**
 * storage.js (localStorageラッパー) のテスト。
 * Node環境にはlocalStorageが無いため、簡易モックをglobalに差し込んで検証する。
 * 実行: node tests/storage.test.js
 */
const { test, summary, assert } = require("./_test-helpers.js");
const Storage = require("../src/js/storage.js");

console.log("storage.js のテスト");

function createMockLocalStorage(opts) {
  opts = opts || {};
  const store = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    setItem: function (key, value) {
      if (opts.throwOnSet) {
        throw new Error("QuotaExceededError");
      }
      store[key] = String(value);
    },
    removeItem: function (key) {
      delete store[key];
    },
  };
}

test("loadLettersは未保存時に空配列を返す", function () {
  global.localStorage = createMockLocalStorage();
  assert.deepStrictEqual(Storage.loadLetters(), []);
});

test("saveLetters/loadLettersで内容を往復できる", function () {
  global.localStorage = createMockLocalStorage();
  const letters = [{ id: "a" }, { id: "b" }];
  Storage.saveLetters(letters);
  assert.deepStrictEqual(Storage.loadLetters(), letters);
});

test("loadSettingsは未保存時にデフォルト設定を返す", function () {
  global.localStorage = createMockLocalStorage();
  assert.deepStrictEqual(Storage.loadSettings(), Storage.DEFAULT_SETTINGS);
});

test("loadSettingsは保存済みの値とデフォルト値をマージする", function () {
  global.localStorage = createMockLocalStorage();
  global.localStorage.setItem(
    Storage.KEY_SETTINGS,
    JSON.stringify({ theme: "dark" })
  );
  const settings = Storage.loadSettings();
  assert.strictEqual(settings.theme, "dark");
  assert.strictEqual(settings.soundEnabled, true); // デフォルト値が補われる
});

test("saveSettingsは保存した値をそのまま読み込める", function () {
  global.localStorage = createMockLocalStorage();
  Storage.saveSettings({ theme: "light", soundEnabled: false });
  const settings = Storage.loadSettings();
  assert.strictEqual(settings.theme, "light");
  assert.strictEqual(settings.soundEnabled, false);
});

test("saveLettersは容量超過時に分かりやすいエラーメッセージで例外を投げる", function () {
  global.localStorage = createMockLocalStorage({ throwOnSet: true });
  assert.throws(function () {
    Storage.saveLetters([{ id: "a" }]);
  }, /保存できません/);
});

test("loadLettersは壊れたJSONが保存されていても空配列にフォールバックする", function () {
  global.localStorage = createMockLocalStorage();
  global.localStorage.setItem(Storage.KEY_LETTERS, "{not json");
  assert.deepStrictEqual(Storage.loadLetters(), []);
});

test("loadLettersはlocalStorage自体が使えない環境でも空配列を返す", function () {
  delete global.localStorage;
  assert.deepStrictEqual(Storage.loadLetters(), []);
});

summary("storage.js");

delete global.localStorage;
