// 連休の解析・効率ランキング・有給取得日の最適化。
//
// タイムラインを「休みの塊（ブロック）」と「出勤日の隙間（ギャップ）」の交互列として扱う。
//   OFF_0  GAP_0  OFF_1  GAP_1 … GAP_{m-1}  OFF_m
// ギャップ j に対する選択は (a, b) の2変数で表せる。
//   a … 先頭から連続して取る有給日数（左のブロックを伸ばす）
//   b … 末尾から連続して取る有給日数（右のブロックを伸ばす）
//   a + b === ギャップ長 のとき、左右のブロックが連結する
// 有給を飛び飛びに取ることもできるが、間に出勤日が残れば連休にならないため、
// 「連休を作る」という目的の下では上記が候補の全体を尽くす。

/** 3日以上を「連休」とみなす。 */
export const MIN_STREAK = 3;

export const SCORE_MODES = {
  // 各連休の「3日目以降の日数」の合計を最大化する。
  // 単純に連休の日数を合計すると、もともと長い休みに1日足すのと、
  // 週末をつないで5連休を作るのが同じ価値になってしまうため、
  // 「2日（ふつうの週末）を超えた部分」だけを数えて、つなぐ取り方を評価する。
  balanced: {
    label: '連休を増やす（おすすめ）',
    score: (n) => Math.max(0, n - (MIN_STREAK - 1)),
  },
  // 同じ日数でも1本の長い連休に集中させる。
  longest: {
    label: 'ひとつの長い連休をつくる',
    score: (n) => (n >= MIN_STREAK ? n * n : 0),
  },
};

export const DEFAULT_MODE = 'balanced';

function scoreFnOf(mode) {
  return (SCORE_MODES[mode] ?? SCORE_MODES[DEFAULT_MODE]).score;
}

/**
 * タイムラインをブロックとギャップに分解する。
 * blocks.length === gaps.length + 1 が常に成り立つ（両端は長さ0のブロックで埋める）。
 */
export function segments(timeline) {
  const blocks = [];
  const gaps = [];
  const empty = () => ({ len: 0, dates: [] });

  if (timeline.length === 0) return { blocks: [empty()], gaps: [] };
  if (!timeline[0].off) blocks.push(empty());

  let i = 0;
  while (i < timeline.length) {
    const { off } = timeline[i];
    let j = i;
    while (j < timeline.length && timeline[j].off === off) j += 1;
    const run = timeline.slice(i, j);
    const dates = run.map((entry) => entry.date);
    if (off) {
      blocks.push({ len: run.length, dates });
    } else {
      let maxA = 0;
      while (maxA < run.length && run[maxA].selectable) maxA += 1;
      let maxB = 0;
      while (maxB < run.length && run[run.length - 1 - maxB].selectable) maxB += 1;
      gaps.push({
        len: run.length,
        dates,
        maxA,
        maxB,
        canMerge: run.every((entry) => entry.selectable),
      });
    }
    i = j;
  }
  if (gaps.length === blocks.length) blocks.push(empty());
  return { blocks, gaps };
}

/** 休み + 取得した有給で構成される連休の一覧。 */
export function findStreaks(timeline, picks = []) {
  const picked = picks instanceof Set ? picks : new Set(picks);
  const streaks = [];
  let run = null;
  for (const entry of timeline) {
    const isOff = entry.off || picked.has(entry.date);
    if (!isOff) {
      if (run) streaks.push(run);
      run = null;
      continue;
    }
    if (!run) run = { start: entry.date, end: entry.date, length: 0, days: [], leaveDates: [] };
    run.end = entry.date;
    run.length += 1;
    run.days.push(entry.date);
    if (!entry.off && picked.has(entry.date)) run.leaveDates.push(entry.date);
  }
  if (run) streaks.push(run);
  return streaks;
}

/** 連休の集計。minStreak 日以上のものだけを数える。 */
export function summarize(timeline, picks = [], { minStreak = MIN_STREAK, within = null } = {}) {
  const all = findStreaks(timeline, picks);
  const inRange = within
    ? all.filter((streak) => streak.end >= within.from && streak.start <= within.to)
    : all;
  const streaks = inRange.filter((streak) => streak.length >= minStreak);
  const longest = streaks.reduce((max, streak) => Math.max(max, streak.length), 0);
  const picked = picks instanceof Set ? [...picks] : [...new Set(picks)];
  return {
    streaks,
    count: streaks.length,
    longest,
    usedDays: picked.length,
    offDaysInStreaks: streaks.reduce((sum, streak) => sum + streak.length, 0),
  };
}

/**
 * 「有給を何日使うと何連休になるか」の候補（アトム）を列挙する。
 * 他の候補を選ばない前提での単独評価だが、並び順は optimize と同じ評価関数の増分で決める。
 * （「連休日数 ÷ 有給日数」で並べると、すでに5連休ある休みに1日足す取り方が 6.0倍 と
 *  最上位に出てしまい、推奨プランと食い違ううえ、実際に得られるものも小さい。）
 */
export function listOpportunities(timeline, {
  maxCost = Infinity,
  minStreak = MIN_STREAK,
  limit = 40,
  mode = DEFAULT_MODE,
} = {}) {
  const score = scoreFnOf(mode);
  const { blocks, gaps } = segments(timeline);
  const out = [];

  gaps.forEach((gap, j) => {
    const left = blocks[j].len;
    const right = blocks[j + 1].len;

    // 前伸ばし・後伸ばし（ギャップを埋め切らない）
    for (let k = 1; k < gap.len; k += 1) {
      if (k > maxCost) break;
      if (k <= gap.maxA) {
        out.push(makeOpportunity('extend', gap.dates.slice(0, k), k, left, 0, score));
      }
      if (k <= gap.maxB) {
        out.push(makeOpportunity('extend', gap.dates.slice(gap.len - k), k, right, 0, score));
      }
    }
    // 橋渡し（ギャップを埋めて左右をつなぐ）
    if (gap.canMerge && gap.len <= maxCost) {
      out.push(makeOpportunity('bridge', gap.dates.slice(), gap.len, left, right, score));
    }
  });

  return out
    .filter((item) => item.streakLength >= minStreak && item.cost > 0)
    .sort(
      (a, b) =>
        b.valuePerLeave - a.valuePerLeave ||
        b.streakLength - a.streakLength ||
        a.cost - b.cost ||
        (a.dates[0] < b.dates[0] ? -1 : 1),
    )
    .slice(0, limit);
}

function makeOpportunity(type, dates, cost, left, right, score) {
  const streakLength = left + cost + right;
  // もともと連続していた休みの日数。「何日から何日に伸びるのか」を隠さずに示すために持つ。
  const baseLength = left + right;
  const value = score(streakLength) - score(left) - score(right);
  return {
    type,
    dates,
    cost,
    streakLength,
    baseLength,
    value,
    valuePerLeave: value / cost,
    note: noteOf(type, left, right),
  };
}

function noteOf(type, left, right) {
  if (type === 'bridge') return `${left}日と${right}日の休みをつなぐ`;
  if (left === 0) return '休みのない週に連休をつくる';
  return `${left}日の休みに続けて休む`;
}

/**
 * 予算内で評価関数を最大化する有給取得日を求める（連鎖 DP による厳密解）。
 * @returns {{picks: string[], score: number, baseline: number, gained: number, usedDays: number}}
 */
export function optimize(timeline, { budget = 0, mode = DEFAULT_MODE } = {}) {
  const score = scoreFnOf(mode);
  const { blocks, gaps } = segments(timeline);
  const baseline = blocks.reduce((sum, block) => sum + score(block.len), 0);
  const cap = Math.max(0, Math.floor(budget));

  if (cap === 0 || gaps.length === 0) {
    return { picks: [], score: baseline, baseline, gained: 0, usedDays: 0 };
  }

  const optionsPerGap = gaps.map((gap) => gapOptions(gap, cap));

  // 状態: `${使用日数}|${いま開いている連休の長さ}` → 最良値
  const layers = [new Map([['0|0', { value: 0, used: 0, len: 0, prev: null, choice: null }]])];

  for (let j = 0; j < gaps.length; j += 1) {
    const current = layers[j];
    const next = new Map();
    for (const [key, state] of current) {
      const openLen = state.len + blocks[j].len;
      const remaining = cap - state.used;
      for (const option of optionsPerGap[j]) {
        if (option.cost > remaining) continue;
        const used = state.used + option.cost;
        const value = option.merge ? state.value : state.value + score(openLen + option.a);
        const len = option.merge ? openLen + gaps[j].len : option.b;
        const nextKey = `${used}|${len}`;
        const existing = next.get(nextKey);
        if (!existing || value > existing.value) {
          next.set(nextKey, { value, used, len, prev: key, choice: option });
        }
      }
    }
    layers.push(next);
  }

  const lastBlock = blocks[blocks.length - 1].len;
  let best = null;
  for (const [key, state] of layers[gaps.length]) {
    const value = state.value + score(state.len + lastBlock);
    // 同点なら有給の使用日数が少ない方を選ぶ
    if (!best || value > best.value || (value === best.value && state.used < best.used)) {
      best = { value, used: state.used, key };
    }
  }

  const picks = [];
  let key = best.key;
  for (let j = gaps.length - 1; j >= 0; j -= 1) {
    const state = layers[j + 1].get(key);
    const { choice } = state;
    const gap = gaps[j];
    if (choice.merge) {
      picks.push(...gap.dates);
    } else {
      if (choice.a > 0) picks.push(...gap.dates.slice(0, choice.a));
      if (choice.b > 0) picks.push(...gap.dates.slice(gap.len - choice.b));
    }
    key = state.prev;
  }
  picks.sort();

  return {
    picks,
    score: best.value,
    baseline,
    gained: best.value - baseline,
    usedDays: picks.length,
  };
}

function gapOptions(gap, budget) {
  const options = [];
  const maxA = Math.min(gap.maxA, budget, gap.len);
  for (let a = 0; a <= maxA; a += 1) {
    const maxB = Math.min(gap.maxB, budget - a, gap.len - a);
    for (let b = 0; b <= maxB; b += 1) {
      if (a + b === gap.len) continue; // 埋め切りは merge として別に持つ
      options.push({ a, b, cost: a + b, merge: false });
    }
  }
  if (gap.canMerge && gap.len <= budget) {
    options.push({ a: gap.len, b: 0, cost: gap.len, merge: true });
  }
  return options;
}
