/* ============================================================
   感情の郵便局 - storage.js
   localStorage の読み書きラッパー
   ブラウザの <script> タグからも Node の require() からも
   読み込めるよう、UMD 風の軽量パターンを用いる。
   ============================================================ */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  } else {
    root.KanjoPost = root.KanjoPost || {};
    root.KanjoPost.Storage = mod;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var KEY_LETTERS = "kanjo-post:letters";
  var KEY_SETTINGS = "kanjo-post:settings";

  var DEFAULT_SETTINGS = {
    theme: "system",
    soundEnabled: true,
  };

  function getEngine() {
    if (typeof localStorage !== "undefined" && localStorage) {
      return localStorage;
    }
    return null;
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed;
    } catch (err) {
      return fallback;
    }
  }

  function loadLetters() {
    var engine = getEngine();
    if (!engine) return [];
    var raw = engine.getItem(KEY_LETTERS);
    var letters = safeParse(raw, []);
    return Array.isArray(letters) ? letters : [];
  }

  function saveLetters(letters) {
    var engine = getEngine();
    if (!engine) {
      throw new Error("localStorageが利用できない環境です。");
    }
    try {
      engine.setItem(KEY_LETTERS, JSON.stringify(letters || []));
    } catch (err) {
      var quotaError = new Error(
        "保存できませんでした。端末の空き容量が不足している可能性があります。"
      );
      quotaError.cause = err;
      throw quotaError;
    }
  }

  function loadSettings() {
    var engine = getEngine();
    if (!engine) return Object.assign({}, DEFAULT_SETTINGS);
    var raw = engine.getItem(KEY_SETTINGS);
    var settings = safeParse(raw, {});
    return Object.assign({}, DEFAULT_SETTINGS, settings || {});
  }

  function saveSettings(settings) {
    var engine = getEngine();
    if (!engine) {
      throw new Error("localStorageが利用できない環境です。");
    }
    var merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    engine.setItem(KEY_SETTINGS, JSON.stringify(merged));
    return merged;
  }

  return {
    KEY_LETTERS: KEY_LETTERS,
    KEY_SETTINGS: KEY_SETTINGS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    loadLetters: loadLetters,
    saveLetters: saveLetters,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
  };
});
