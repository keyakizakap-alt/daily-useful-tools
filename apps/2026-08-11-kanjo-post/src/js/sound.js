/* ============================================================
   感情の郵便局 - sound.js
   配達通知用の、優しく短いお知らせ音(Web Audio APIで生成)。
   外部音源ファイルには依存しない。
   ============================================================ */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  } else {
    root.KanjoPost = root.KanjoPost || {};
    root.KanjoPost.Sound = mod;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function playDeliveryChime() {
    try {
      var AudioContextClass =
        (typeof window !== "undefined" &&
          (window.AudioContext || window.webkitAudioContext)) ||
        null;
      if (!AudioContextClass) return;
      var ctx = new AudioContextClass();
      var notes = [660, 880];
      notes.forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        var start = ctx.currentTime + i * 0.16;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.55);
      });
      setTimeout(function () {
        if (ctx.close) ctx.close();
      }, 900);
    } catch (err) {
      /* 音が鳴らせない環境では静かに諦める */
    }
  }

  return {
    playDeliveryChime: playDeliveryChime,
  };
});
