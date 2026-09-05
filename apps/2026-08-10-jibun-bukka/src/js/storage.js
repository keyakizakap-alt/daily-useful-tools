// じぶん物価 — localStorage 読み書きラッパー
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.JibunBukkaStorage = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'jibunBukka.records.v1';

  function loadRecords() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('じぶん物価: データの読み込みに失敗しました', e);
      return [];
    }
  }

  function saveRecords(records) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (e) {
      console.error('じぶん物価: データの保存に失敗しました', e);
      return false;
    }
  }

  return { STORAGE_KEY, loadRecords, saveRecords };
});
