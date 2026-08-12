/**
 * のし袋アシスタント — コアロジック
 * ブラウザ（<script>タグ, window.NoshiLogic）と Node.js（require, module.exports）の
 * 両方から利用できる UMD 風の作りにしている（テストをNodeから直接実行するため）。
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NoshiLogic = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DIGITS = ['', '壱', '弐', '参', '四', '伍', '六', '七', '八', '九'];
  const UNITS = ['仟', '百', '拾', ''];

  function daijiGroup(n) {
    const s = String(n).padStart(4, '0');
    let out = '';
    for (let i = 0; i < 4; i++) {
      const d = Number(s[i]);
      if (d === 0) continue;
      out += DIGITS[d] + UNITS[i];
    }
    return out;
  }

  /**
   * 0以上99,999,999以下の整数を大字（漢数字の改ざん防止表記）に変換する。
   */
  function toDaiji(num) {
    if (!Number.isInteger(num) || num < 0 || num > 99999999) {
      throw new RangeError('金額は0円〜99,999,999円の整数で指定してください');
    }
    if (num === 0) return '零';
    const man = Math.floor(num / 10000);
    const rest = num % 10000;
    let out = '';
    if (man > 0) out += daijiGroup(man) + '萬';
    if (rest > 0) out += daijiGroup(rest);
    return out;
  }

  /**
   * 「金◯◯円」形式のご祝儀袋向け表記を返す。
   */
  function formatMoney(num) {
    return '金' + toDaiji(num) + '円';
  }

  /**
   * 「10,000円〜30,000円程度」のような文字列から金額の範囲を抽出する。
   * 数値が1つしか見つからない場合は同じ値をlow/highとする。
   * 数値が見つからない場合はnullを返す。
   */
  function parseRange(text) {
    if (!text) return null;
    const matches = text.match(/[\d,]+/g);
    if (!matches || matches.length === 0) return null;
    const nums = matches.map((m) => Number(m.replace(/,/g, '')));
    const low = Math.min(...nums);
    const high = Math.max(...nums);
    return { low, high };
  }

  /**
   * 指定した金額が相場レンジ内かどうかを判定する。
   * 判定不能な場合（相場テキストが無い等）は null を返す。
   */
  function isWithinRange(amount, rangeText) {
    const range = parseRange(rangeText);
    if (!range) return null;
    return amount >= range.low && amount <= range.high;
  }

  function findOccasion(data, occasionId) {
    return data.occasions.find((o) => o.id === occasionId) || null;
  }

  function findRelationLabel(data, relationId) {
    const found = data.relations.find((r) => r.id === relationId);
    return found ? found.label : relationId;
  }

  function findAgeGroupLabel(data, ageId) {
    const found = data.ageGroups.find((a) => a.id === ageId);
    return found ? found.label : ageId;
  }

  /**
   * 行事＋関係性（またはお年玉の場合は年齢層）から相場テキストを取得する。
   */
  function getSoubaText(occasion, relationOrAgeId) {
    if (!occasion) return null;
    if (occasion.relationMode === 'age') {
      return (occasion.soubaByAge && occasion.soubaByAge[relationOrAgeId]) || null;
    }
    return (occasion.soubaByRelation && occasion.soubaByRelation[relationOrAgeId]) || null;
  }

  return {
    toDaiji,
    formatMoney,
    parseRange,
    isWithinRange,
    findOccasion,
    findRelationLabel,
    findAgeGroupLabel,
    getSoubaText,
  };
});
