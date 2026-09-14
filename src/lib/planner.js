/**
 * planner — 有給休暇の置き方から連休を設計する。
 *
 * 用語
 *   連休(break)      連続した休みの並び
 *   予算(budget)     使ってよい有給の日数
 *   1日あたり(perDay) 連休日数 ÷ 使った有給日数（効率指標）
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dateutil.js'));
  } else {
    global.Yasumi = global.Yasumi || {};
    global.Yasumi.planner = factory(global.Yasumi.dateutil);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (dateutil) {
  'use strict';

  var MAX_BUDGET = 40;

  function assertDays(days) {
    if (!Array.isArray(days) || days.length === 0) {
      throw new Error('カレンダーの日付配列が空です');
    }
  }

  function normalizeBudget(budget) {
    if (!Number.isInteger(budget) || budget < 0 || budget > MAX_BUDGET) {
      throw new Error('有給日数は 0〜' + MAX_BUDGET + ' の整数で指定してください: ' + String(budget));
    }
    return budget;
  }

  /**
   * 有給を使わずに成立している連休（土日・GW・シルバーウィークなど）。
   *
   * @param {Array} days calendar.buildCalendar() の days
   * @param {{minLength?: number}} [options]
   */
  function findExistingBreaks(days, options) {
    assertDays(days);
    var minLength = (options && options.minLength) || 3;
    var breaks = [];
    var i = 0;
    while (i < days.length) {
      if (!days[i].off) {
        i += 1;
        continue;
      }
      var start = i;
      while (i + 1 < days.length && days[i + 1].off) i += 1;
      var length = i - start + 1;
      if (length >= minLength) breaks.push(describeBreak(days, start, i, []));
      i += 1;
    }
    return breaks;
  }

  /**
   * 連休候補の「範囲・コスト・長さ」だけを列挙する軽量版。
   *
   * 端が休みの区間は「有給を無駄に置いた区間」なので、有給を置く区間の
   * 両端は必ず勤務日とする。得られた区間は前後の既存の休みで最大まで延長する。
   *
   * 説明文（reason）や内訳の生成は重いので、ここでは作らない。
   * 表示する候補にだけ describeBreak() を適用する。
   *
   * @returns {Array<{startIndex: number, endIndex: number, cost: number,
   *                  length: number, ptoIndexes: number[]}>} 開始位置の昇順
   */
  function enumerateCandidates(days, options) {
    assertDays(days);
    var opts = options || {};
    var budget = normalizeBudget(opts.budget === undefined ? 1 : opts.budget);
    var minLength = opts.minLength === undefined ? 3 : opts.minLength;
    if (budget === 0) return [];

    var out = [];
    var seen = new Set();

    for (var i = 0; i < days.length; i += 1) {
      if (days[i].off) continue;
      var cost = 0;
      var ptoIndexes = [];
      for (var j = i; j < days.length; j += 1) {
        if (days[j].off) continue;
        cost += 1;
        if (cost > budget) break;
        ptoIndexes.push(j);

        var left = i;
        while (left - 1 >= 0 && days[left - 1].off) left -= 1;
        var right = j;
        while (right + 1 < days.length && days[right + 1].off) right += 1;
        var length = right - left + 1;
        if (length < minLength) continue;

        // 同じ連休範囲は 1 件だけ（範囲が決まれば必要な有給も一意に決まる）
        var key = left * (days.length + 1) + right;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          startIndex: left,
          endIndex: right,
          cost: cost,
          length: length,
          ptoIndexes: ptoIndexes.slice(),
        });
      }
    }

    return out;
  }

  /**
   * 有給を 1〜budget 日使ってできる連休の候補を、説明付きで列挙する。
   *
   * @returns {Array} perDay 降順に並んだ候補
   */
  function findPlans(days, options) {
    return enumerateCandidates(days, options)
      .map(function (candidate) {
        return describeBreak(days, candidate.startIndex, candidate.endIndex, candidate.ptoIndexes);
      })
      .sort(comparePlans);
  }

  /**
   * 予算内で、重複しない連休の組み合わせを作り、合計の休み日数を最大化する。
   * 重み付き区間スケジューリング + 予算次元の動的計画法。
   *
   * 採用した連休同士は「1 日以上の勤務日を挟む」ことを条件にする
   * （隣接すると 1 つの連休に融合してしまい、回数の表示が実態と合わなくなる）。
   *
   * @returns {{plans: Array, totalDays: number, usedDays: number, budget: number}}
   */
  function planYear(days, options) {
    assertDays(days);
    var opts = options || {};
    var budget = normalizeBudget(opts.budget === undefined ? 0 : opts.budget);
    var minLength = opts.minLength === undefined ? 3 : opts.minLength;
    if (budget === 0) {
      return { plans: [], totalDays: 0, usedDays: 0, budget: budget };
    }

    // 終了位置の昇順に並べる（DP の前提）
    var items = enumerateCandidates(days, { budget: budget, minLength: minLength }).sort(
      function (a, b) {
        if (a.endIndex !== b.endIndex) return a.endIndex - b.endIndex;
        if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
        return a.cost - b.cost;
      }
    );

    var n = items.length;
    if (n === 0) {
      return { plans: [], totalDays: 0, usedDays: 0, budget: budget };
    }

    // prev[i] = items[0..i-1] のうち endIndex <= items[i].startIndex - 2 を満たす件数
    var endIndexes = new Int32Array(n);
    for (var k = 0; k < n; k += 1) endIndexes[k] = items[k].endIndex;
    var prev = new Int32Array(n);
    for (var p = 0; p < n; p += 1) prev[p] = upperBound(endIndexes, items[p].startIndex - 2);

    // dp[i * width + b] = items[0..i-1] までを見て予算 b を使ったときの最大合計連休日数
    // （行ごとに配列を確保すると候補数が多いとき確保コストが支配的になるため平坦化する）
    var width = budget + 1;
    var dp = new Int32Array((n + 1) * width);

    for (var idx = 0; idx < n; idx += 1) {
      var item = items[idx];
      var row = idx * width;
      var nextRow = row + width;
      var prevRow = prev[idx] * width;
      for (var b = 0; b < width; b += 1) {
        var best = dp[row + b];
        if (item.cost <= b) {
          var withItem = dp[prevRow + b - item.cost] + item.length;
          if (withItem > best) best = withItem;
        }
        dp[nextRow + b] = best;
      }
    }

    // 復元
    var chosen = [];
    var cursor = n;
    var remaining = budget;
    while (cursor > 0) {
      if (dp[cursor * width + remaining] === dp[(cursor - 1) * width + remaining]) {
        cursor -= 1;
        continue;
      }
      var current = items[cursor - 1];
      chosen.push(describeBreak(days, current.startIndex, current.endIndex, current.ptoIndexes));
      remaining -= current.cost;
      cursor = prev[cursor - 1];
    }
    chosen.reverse();

    var totalDays = chosen.reduce(function (sum, item) {
      return sum + item.length;
    }, 0);
    var usedDays = chosen.reduce(function (sum, item) {
      return sum + item.cost;
    }, 0);

    return { plans: chosen, totalDays: totalDays, usedDays: usedDays, budget: budget };
  }

  /**
   * 上位の候補に完全に含まれ、かつ有給も多く使う「劣った候補」を落とす。
   * 同じ連休の細切れが並ぶのを防ぐ。plans は順位付け済みであること。
   */
  function dropDominatedPlans(plans) {
    var kept = [];
    plans.forEach(function (plan) {
      var dominated = kept.some(function (other) {
        return (
          other.startIndex <= plan.startIndex &&
          other.endIndex >= plan.endIndex &&
          other.cost <= plan.cost
        );
      });
      if (!dominated) kept.push(plan);
    });
    return kept;
  }

  /**
   * 表示する候補を選ぶ。効率の順位を保ったまま、
   * 「範囲が重なる候補（＝同じ時期の変種）」は maxPerCluster 件までに抑える。
   *
   * 効率だけで上から取ると、ゴールデンウィークのような当たり年の変種で
   * 一覧が埋まり、ほかの時期の候補が見えなくなるため。
   * 同じ時期の案を 2 件残すのは「1日で7連休」と「2日で9連休」を見比べたい
   * 利用者の要求に応えるため。
   *
   * @param {Array} plans 順位付け済みの候補
   * @param {{limit?: number, maxPerCluster?: number}} [options]
   */
  function selectVariedPlans(plans, options) {
    var opts = options || {};
    var limit = opts.limit === undefined ? 12 : opts.limit;
    var maxPerCluster = opts.maxPerCluster === undefined ? 2 : opts.maxPerCluster;
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error('表示件数は 0 以上の整数で指定してください: ' + String(limit));
    }
    if (!Number.isInteger(maxPerCluster) || maxPerCluster < 1) {
      throw new Error('同一時期の上限は 1 以上の整数で指定してください: ' + String(maxPerCluster));
    }

    var kept = [];
    for (var i = 0; i < plans.length && kept.length < limit; i += 1) {
      var plan = plans[i];
      var overlapping = 0;
      for (var j = 0; j < kept.length; j += 1) {
        if (kept[j].startIndex <= plan.endIndex && plan.startIndex <= kept[j].endIndex) {
          overlapping += 1;
        }
      }
      if (overlapping < maxPerCluster) kept.push(plan);
    }
    return kept;
  }

  /** value 以下の要素数（sorted は昇順） */
  function upperBound(sorted, value) {
    var low = 0;
    var high = sorted.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      if (sorted[mid] <= value) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  function comparePlans(a, b) {
    if (b.perDay !== a.perDay) return b.perDay - a.perDay;
    if (b.length !== a.length) return b.length - a.length;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.startIndex - b.startIndex;
  }

  /**
   * 連休 1 件の説明オブジェクトを組み立てる。
   */
  function describeBreak(days, startIndex, endIndex, ptoIndexes) {
    var slice = days.slice(startIndex, endIndex + 1);
    var cost = ptoIndexes.length;
    var length = slice.length;
    var ptoDates = ptoIndexes.map(function (index) {
      return days[index].date;
    });
    var ptoSet = new Set(ptoDates);

    var composition = { holiday: 0, substitute: 0, citizens: 0, weekly: 0, company: 0, pto: 0 };
    slice.forEach(function (day) {
      if (ptoSet.has(day.date)) composition.pto += 1;
      else if (day.off) composition[day.kind] += 1;
    });

    return {
      startIndex: startIndex,
      endIndex: endIndex,
      start: days[startIndex].date,
      end: days[endIndex].date,
      length: length,
      cost: cost,
      perDay: cost === 0 ? Infinity : Math.round((length / cost) * 100) / 100,
      ptoDates: ptoDates,
      composition: composition,
      // 期間の端に接している連休は、実際にはさらに前後へ伸びている可能性がある
      truncatedStart: startIndex === 0,
      truncatedEnd: endIndex === days.length - 1,
      reason: buildReason(slice, ptoSet),
    };
  }

  /**
   * 「なぜこの連休が成立するか」を日本語で説明する（色や記号に頼らない根拠表示）。
   */
  function buildReason(slice, ptoSet) {
    var parts = [];
    slice.forEach(function (day) {
      var role = ptoSet.has(day.date) ? '有給' : day.label;
      parts.push(dateutil.formatShortJa(day.date) + ' ' + role);
    });
    return parts.join(' / ');
  }

  return {
    MAX_BUDGET: MAX_BUDGET,
    findExistingBreaks: findExistingBreaks,
    enumerateCandidates: enumerateCandidates,
    findPlans: findPlans,
    dropDominatedPlans: dropDominatedPlans,
    selectVariedPlans: selectVariedPlans,
    planYear: planYear,
    describeBreak: describeBreak,
  };
});
