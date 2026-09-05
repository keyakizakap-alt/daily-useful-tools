(function (root, factory) {
  var moduleExports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = moduleExports;
  }
  root.MoraUtil = moduleExports;
})(typeof self !== 'undefined' ? self : this, function () {
  // 小書き文字（拗音等）: 直前の文字と結合するため、単独ではカウントしない
  var SMALL_KANA = new Set([
    'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゎ',
    'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ヮ',
  ]);

  // 1音として数える文字: ひらがな・カタカナ全般、促音、撥音、長音符
  function isCountableChar(ch) {
    if (SMALL_KANA.has(ch)) return false;
    var code = ch.codePointAt(0);
    var isHiragana = code >= 0x3041 && code <= 0x3096;
    var isKatakana = code >= 0x30a1 && code <= 0x30fa;
    var isChoonpu = ch === 'ー';
    return isHiragana || isKatakana || isChoonpu;
  }

  function countMora(text) {
    if (!text) return 0;
    var count = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (SMALL_KANA.has(ch)) continue;
      if (isCountableChar(ch)) count++;
    }
    return count;
  }

  function judgeMora(count, target) {
    return count === target ? 'ok' : 'ng';
  }

  return {
    countMora: countMora,
    judgeMora: judgeMora,
  };
});
