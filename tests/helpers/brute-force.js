// テスト用の総当たり探索。planner.optimize（DP）の答え合わせに使う。
// 指数時間なので、候補日が十数日程度の小さな入力にのみ使う。

import { findStreaks, SCORE_MODES, DEFAULT_MODE } from '../../src/lib/planner.js';

export function bruteForce(timeline, { budget = 0, mode = DEFAULT_MODE } = {}) {
  const { score } = SCORE_MODES[mode] ?? SCORE_MODES[DEFAULT_MODE];
  const candidates = timeline.filter((entry) => !entry.off && entry.selectable).map((entry) => entry.date);
  const cap = Math.max(0, Math.floor(budget));
  const evaluate = (picks) => findStreaks(timeline, picks).reduce((sum, s) => sum + score(s.length), 0);

  let best = { picks: [], score: evaluate([]) };
  const walk = (index, chosen) => {
    const value = evaluate(chosen);
    if (value > best.score || (value === best.score && chosen.length < best.picks.length)) {
      best = { picks: [...chosen], score: value };
    }
    if (chosen.length >= cap) return;
    for (let i = index; i < candidates.length; i += 1) {
      chosen.push(candidates[i]);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return best;
}

/** 決定的な擬似乱数（テストの再現性のため）。 */
export function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** off/selectable のパターンからタイムラインを組み立てる（日付は 2026-01-01 起点）。 */
export function timelineFromPattern(pattern, { start = '2026-01-01' } = {}) {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  return [...pattern].map((ch, i) => {
    const date = new Date(base + i * 86400000).toISOString().slice(0, 10);
    const off = ch === 'o';
    return { date, dow: new Date(base + i * 86400000).getUTCDay(), off, selectable: !off, holiday: null, labels: off ? ['休み'] : [] };
  });
}
