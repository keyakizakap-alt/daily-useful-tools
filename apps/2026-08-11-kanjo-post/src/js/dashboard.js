/* ============================================================
   感情の郵便局 - dashboard.js
   傾向ダッシュボード用の集計ロジック(純粋関数)。
   描画(SVG/CSS棒グラフ)はmain.js側で行う。
   ============================================================ */
(function (root, factory) {
  var mod = factory(
    typeof module !== "undefined" && module.exports
      ? require("./letters.js")
      : root.KanjoPost && root.KanjoPost.Letters
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  } else {
    root.KanjoPost = root.KanjoPost || {};
    root.KanjoPost.Dashboard = mod;
  }
})(typeof window !== "undefined" ? window : globalThis, function (Letters) {
  "use strict";

  /**
   * 感情タグ別の件数を集計する。0件のタグも含めて全タグ分を返す。
   * @returns {Array<{id:string,label:string,count:number}>} countの降順
   */
  function aggregateByEmotion(letters) {
    var counts = {};
    Letters.EMOTIONS.forEach(function (e) {
      counts[e.id] = 0;
    });
    (letters || []).forEach(function (letter) {
      (letter.emotionTags || []).forEach(function (tagId) {
        if (counts[tagId] == null) counts[tagId] = 0;
        counts[tagId] += 1;
      });
    });
    return Letters.EMOTIONS.map(function (e) {
      return { id: e.id, label: e.label, count: counts[e.id] || 0 };
    }).sort(function (a, b) {
      return b.count - a.count;
    });
  }

  /**
   * 関係性タグ別の件数を集計する。0件の関係性も含めて全件返す。
   */
  function aggregateByRelation(letters) {
    var counts = {};
    Letters.RELATIONS.forEach(function (r) {
      counts[r.id] = 0;
    });
    (letters || []).forEach(function (letter) {
      var id = letter.relation;
      if (counts[id] == null) counts[id] = 0;
      counts[id] += 1;
    });
    return Letters.RELATIONS.map(function (r) {
      return { id: r.id, label: r.label, count: counts[r.id] || 0 };
    }).sort(function (a, b) {
      return b.count - a.count;
    });
  }

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  /**
   * ISO週(月曜始まり)のキー "YYYY-Www" を返す。
   */
  function weekKey(date) {
    var d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + "-W" + pad2(weekNo);
  }

  function monthKey(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1);
  }

  /**
   * 期間(週/月)ごとの件数を集計する。createdAtを基準にする。
   * @param {string} granularity - 'week' | 'month'
   * @returns {Array<{key:string,count:number}>} 期間キーの昇順
   */
  function aggregateByPeriod(letters, granularity) {
    var keyFn = granularity === "month" ? monthKey : weekKey;
    var counts = {};
    (letters || []).forEach(function (letter) {
      var d = new Date(letter.createdAt);
      if (isNaN(d.getTime())) return;
      var key = keyFn(d);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts)
      .sort()
      .map(function (key) {
        return { key: key, count: counts[key] };
      });
  }

  return {
    aggregateByEmotion: aggregateByEmotion,
    aggregateByRelation: aggregateByRelation,
    aggregateByPeriod: aggregateByPeriod,
    weekKey: weekKey,
    monthKey: monthKey,
  };
});
