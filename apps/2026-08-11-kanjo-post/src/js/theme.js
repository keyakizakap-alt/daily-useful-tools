/* ============================================================
   感情の郵便局 - theme.js
   ライト/ダーク/システム追従のテーマ切り替え
   ============================================================ */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  } else {
    root.KanjoPost = root.KanjoPost || {};
    root.KanjoPost.Theme = mod;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /**
   * theme: 'light' | 'dark' | 'system'
   * documentElementのdata-theme属性を書き換える。
   * 'system' の場合は属性を外し、CSS側のprefers-color-schemeに委ねる。
   */
  function applyTheme(theme) {
    if (typeof document === "undefined") return;
    var root = document.documentElement;
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }

  return {
    applyTheme: applyTheme,
  };
});
