/**
 * 段取りキッチンの中核スケジューラ。
 *
 * 「できあがり時刻」から逆算して、複数の料理の工程を1本のタイムラインに並べる。
 * 調理者の人数という有限リソースの下で、つきっきり工程が重ならないように後ろ向きに
 * リストスケジューリングを行う。すべて副作用のない純関数。
 *
 * ── 用語 ──
 * offset : 「できあがり時刻の何分前か」。値が大きいほど時間的に早い。
 *          目標時刻そのものが offset = 0。
 * attended（つきっきり）  : 手が塞がる工程。同時に調理者の人数までしか実行できない。
 * unattended（放置）      : 煮る・焼く・寝かせる等。手が空くので何本でも並行できる。
 */

/**
 * @typedef {Object} Step 工程
 * @property {string} name 工程名（例: "玉ねぎを切る"）
 * @property {number} minutes 所要時間（分・0以上の整数）
 * @property {boolean} attended つきっきりなら true、放置なら false
 */

/**
 * @typedef {Object} Dish 料理
 * @property {string} id 一意なID
 * @property {string} name 料理名
 * @property {Step[]} steps 調理順に並んだ工程列
 * @property {number} [holdMinutes] 完成後に置いておける時間（分）。
 *   0 なら「できあがり時刻ちょうどに熱々で出したい」。
 *   例えばサラダのように先に作っておける料理は 30 などを指定する。
 */

/**
 * @typedef {Object} ScheduleEntry タイムラインの1行
 * @property {string} dishId
 * @property {string} dishName
 * @property {string} stepName
 * @property {number} stepIndex
 * @property {boolean} attended
 * @property {number} minutes
 * @property {number} startTime 開始時刻（00:00 からの経過分。負なら前日）
 * @property {number} endTime 終了時刻
 * @property {number} startOffset できあがり時刻の何分前に開始するか
 * @property {number} endOffset できあがり時刻の何分前に終了するか
 */

const DEFAULT_COOKS = 1;

/**
 * 逆算スケジューリングを実行する。
 *
 * アルゴリズム（決定的・乱数を使わない）:
 *  1. 各料理について、最後の工程が「できあがり時刻 - holdMinutes」に終わるものとして、
 *     工程を後ろから積み上げ、リソース競合を無視した理想 offset を求める。
 *  2. つきっきり工程だけを集め、「終了 offset が小さい順」＝時間的に遅い順に確定させる。
 *     盛り付けなど提供直前の工程を優先して固定し、前の工程を前倒ししていく。
 *  3. 確定済みの工程と重なる場合、重なりが「調理者の人数未満」になるところまで前倒しする。
 *     前倒しした工程より前（調理順で手前）の同じ料理の工程も、同じ分だけ一緒に前倒しする。
 *  4. 全工程の開始 offset の最大値が「総所要時間」。目標時刻から引くと調理開始時刻になる。
 *
 * @param {Dish[]} dishes 料理の配列
 * @param {{targetTime: number, cooks?: number}} options
 *   targetTime: できあがり目標時刻（00:00 からの経過分）
 *   cooks: 同時に手を動かせる人数（既定 1）
 * @returns {{
 *   startTime: number,
 *   targetTime: number,
 *   totalMinutes: number,
 *   activeMinutes: number,
 *   idleMinutes: number,
 *   （idleMinutes は「のべ人数分」の手待ち時間。2人で95分調理し45分手を動かしたなら
 *     95×2-45 = 145分になる。経過時間そのものではない点に注意）
 *   entries: ScheduleEntry[],
 *   dishSummaries: Array<{dishId: string, dishName: string, startTime: number, finishTime: number, waitMinutes: number}>,
 *   warnings: string[]
 * }}
 */
export function schedule(dishes, options) {
  const { targetTime, cooks = DEFAULT_COOKS } = options ?? {};
  if (typeof targetTime !== 'number' || !Number.isFinite(targetTime)) {
    throw new Error('できあがり時刻（targetTime）を数値で指定してください');
  }
  if (!Number.isInteger(cooks) || cooks < 1) {
    throw new Error(`調理者の人数は1以上の整数で指定してください: ${cooks}`);
  }
  const normalized = normalizeDishes(dishes);

  // ── 1. リソース競合を無視した理想 offset を後ろ向きに計算 ──
  // plan[d][i] = { startOffset, endOffset }
  const plan = normalized.map((dish) => {
    const offsets = new Array(dish.steps.length);
    let nextStartOffset = dish.holdMinutes; // 最後の工程が終わるべき offset
    for (let i = dish.steps.length - 1; i >= 0; i -= 1) {
      const endOffset = nextStartOffset;
      const startOffset = endOffset + dish.steps[i].minutes;
      offsets[i] = { startOffset, endOffset };
      nextStartOffset = startOffset;
    }
    return offsets;
  });

  // ── 2〜3. つきっきり工程の競合解消 ──
  const pending = [];
  for (let d = 0; d < normalized.length; d += 1) {
    for (let i = 0; i < normalized[d].steps.length; i += 1) {
      if (normalized[d].steps[i].attended && normalized[d].steps[i].minutes > 0) {
        pending.push({ dish: d, step: i });
      }
    }
  }

  const placed = [];
  while (pending.length > 0) {
    // 未確定のうち「終了 offset が最小」＝時間的に最も遅い工程を選ぶ。
    // 前倒しで offset が変わるため、毎回選び直す。
    let pickIndex = 0;
    for (let k = 1; k < pending.length; k += 1) {
      const a = plan[pending[k].dish][pending[k].step];
      const best = plan[pending[pickIndex].dish][pending[pickIndex].step];
      if (a.endOffset < best.endOffset) pickIndex = k;
    }
    const current = pending.splice(pickIndex, 1)[0];

    // 重なりが cooks 未満になるまで前倒しする。
    for (;;) {
      const self = plan[current.dish][current.step];
      const overlapping = placed.filter((other) => {
        const o = plan[other.dish][other.step];
        return o.endOffset < self.startOffset && self.endOffset < o.startOffset;
      });
      if (overlapping.length < cooks) break;

      // 重なりを cooks-1 本まで減らすには、startOffset の小さい方から
      // (overlapping.length - cooks + 1) 本を追い越す必要がある。
      const starts = overlapping
        .map((other) => plan[other.dish][other.step].startOffset)
        .sort((a, b) => a - b);
      const newEndOffset = starts[overlapping.length - cooks];
      const delta = newEndOffset - self.endOffset;
      if (delta <= 0) break; // 前進しない場合は無限ループを避けて打ち切る
      shiftDishStepsBefore(plan[current.dish], current.step, delta);
    }
    placed.push(current);
  }

  // ── 4. 実時刻へ変換 ──
  let totalMinutes = 0;
  for (let d = 0; d < normalized.length; d += 1) {
    for (let i = 0; i < normalized[d].steps.length; i += 1) {
      totalMinutes = Math.max(totalMinutes, plan[d][i].startOffset);
    }
  }

  const entries = [];
  for (let d = 0; d < normalized.length; d += 1) {
    const dish = normalized[d];
    for (let i = 0; i < dish.steps.length; i += 1) {
      const step = dish.steps[i];
      const { startOffset, endOffset } = plan[d][i];
      entries.push({
        dishId: dish.id,
        dishName: dish.name,
        stepName: step.name,
        stepIndex: i,
        attended: step.attended,
        minutes: step.minutes,
        startOffset,
        endOffset,
        startTime: targetTime - startOffset,
        endTime: targetTime - endOffset,
      });
    }
  }
  // 早い順（offset の大きい順）。同時刻ならつきっきりを先に、次いで料理名で安定ソート。
  entries.sort((a, b) => {
    if (b.startOffset !== a.startOffset) return b.startOffset - a.startOffset;
    if (a.attended !== b.attended) return a.attended ? -1 : 1;
    return a.dishName.localeCompare(b.dishName, 'ja');
  });

  const activeMinutes = entries
    .filter((entry) => entry.attended)
    .reduce((sum, entry) => sum + entry.minutes, 0);

  const dishSummaries = normalized.map((dish, d) => {
    const offsets = plan[d];
    if (offsets.length === 0) {
      return {
        dishId: dish.id,
        dishName: dish.name,
        startTime: targetTime,
        finishTime: targetTime,
        waitMinutes: 0,
      };
    }
    let waitMinutes = 0;
    for (let i = 0; i < offsets.length - 1; i += 1) {
      // 工程 i が終わってから工程 i+1 が始まるまでの空き
      waitMinutes += offsets[i].endOffset - offsets[i + 1].startOffset;
    }
    return {
      dishId: dish.id,
      dishName: dish.name,
      startTime: targetTime - offsets[0].startOffset,
      finishTime: targetTime - offsets[offsets.length - 1].endOffset,
      waitMinutes,
    };
  });

  return {
    startTime: targetTime - totalMinutes,
    targetTime,
    totalMinutes,
    activeMinutes,
    idleMinutes: Math.max(0, totalMinutes * cooks - activeMinutes),
    entries,
    dishSummaries,
    warnings: buildWarnings({
      normalized,
      dishSummaries,
      totalMinutes,
      startTime: targetTime - totalMinutes,
      switchCount: countDishSwitches(entries),
    }),
  };
}

/**
 * 指定した工程とそれより手前の工程を、まとめて delta 分だけ前倒しする。
 *
 * @param {Array<{startOffset: number, endOffset: number}>} offsets 1つの料理の offset 配列
 * @param {number} stepIndex この工程まで（含む）を前倒しする
 * @param {number} delta 前倒しする分数（正の数）
 */
function shiftDishStepsBefore(offsets, stepIndex, delta) {
  for (let i = 0; i <= stepIndex; i += 1) {
    offsets[i].startOffset += delta;
    offsets[i].endOffset += delta;
  }
}

/**
 * 入力を検証し、既定値を埋めた料理配列を返す。元の配列は変更しない。
 *
 * @param {Dish[]} dishes
 * @returns {Dish[]}
 */
export function normalizeDishes(dishes) {
  if (!Array.isArray(dishes)) {
    throw new Error('料理は配列で指定してください');
  }
  if (dishes.length === 0) {
    throw new Error('料理を1品以上追加してください');
  }
  const seenIds = new Set();
  return dishes.map((dish, index) => {
    if (!dish || typeof dish !== 'object') {
      throw new Error(`${index + 1}品目の指定が不正です`);
    }
    const name = typeof dish.name === 'string' ? dish.name.trim() : '';
    if (name === '') {
      throw new Error(`${index + 1}品目の料理名を入力してください`);
    }
    const id = typeof dish.id === 'string' && dish.id !== '' ? dish.id : `dish-${index}`;
    if (seenIds.has(id)) {
      throw new Error(`料理のIDが重複しています: ${id}`);
    }
    seenIds.add(id);

    if (!Array.isArray(dish.steps)) {
      throw new Error(`「${name}」の工程は配列で指定してください`);
    }
    const steps = dish.steps.map((step, stepIndex) => {
      if (!step || typeof step !== 'object') {
        throw new Error(`「${name}」の${stepIndex + 1}番目の工程が不正です`);
      }
      const stepName = typeof step.name === 'string' ? step.name.trim() : '';
      if (stepName === '') {
        throw new Error(`「${name}」の${stepIndex + 1}番目の工程名を入力してください`);
      }
      const minutes = Number(step.minutes);
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new Error(`「${name}」の「${stepName}」の所要時間が不正です: ${step.minutes}`);
      }
      if (!Number.isInteger(minutes)) {
        throw new Error(`「${name}」の「${stepName}」の所要時間は整数（分）で指定してください: ${step.minutes}`);
      }
      return { name: stepName, minutes, attended: step.attended !== false };
    });

    const holdMinutes = dish.holdMinutes === undefined ? 0 : Number(dish.holdMinutes);
    if (!Number.isFinite(holdMinutes) || holdMinutes < 0) {
      throw new Error(`「${name}」の余裕時間（holdMinutes）が不正です: ${dish.holdMinutes}`);
    }
    return { id, name, steps, holdMinutes };
  });
}

/**
 * スケジュール結果から日本語の注意書きを組み立てる。
 */
function buildWarnings({ normalized, dishSummaries, totalMinutes, startTime, switchCount }) {
  const warnings = [];
  if (totalMinutes === 0) {
    warnings.push('所要時間が0分です。工程の時間を入力してください。');
  }
  if (startTime < 0) {
    warnings.push('調理開始が前日にずれ込みます。品数を減らすか、できあがり時刻を遅くしてください。');
  }
  if (totalMinutes > 180) {
    warnings.push(`総所要時間が${Math.round(totalMinutes)}分と長めです。作り置きできる料理はhold時間を設定すると短縮できます。`);
  }
  for (const summary of dishSummaries) {
    if (summary.waitMinutes >= 15) {
      warnings.push(`「${summary.dishName}」は途中で合計${summary.waitMinutes}分の待ちが入ります。`);
    }
  }
  for (const dish of normalized) {
    if (dish.steps.length === 0) {
      warnings.push(`「${dish.name}」に工程が登録されていません。`);
    }
  }
  if (switchCount >= 12) {
    warnings.push(
      `料理をまたぐ作業の切り替えが${switchCount}回あります。手順を追いきれない場合は品数を減らすか、` +
        '先に作れる料理の「できあがりの◯分前でOK」を大きくしてください。',
    );
  }
  return warnings;
}

/**
 * つきっきり工程を時系列に並べたとき、直前と違う料理に移る回数を数える。
 * 「2〜4分おきに別の料理へ切り替わって現実には追えない」状態の検出に使う。
 *
 * @param {ScheduleEntry[]} entries
 * @returns {number}
 */
export function countDishSwitches(entries) {
  const attended = entries
    .filter((entry) => entry.attended && entry.minutes > 0)
    .sort((a, b) => a.startTime - b.startTime);
  let switches = 0;
  for (let i = 1; i < attended.length; i += 1) {
    if (attended[i].dishId !== attended[i - 1].dishId) switches += 1;
  }
  return switches;
}

/**
 * タイムラインを「同時に進行する工程のまとまり」に区切る。
 * UI で「18:05 - 玉ねぎを炒める（味噌汁は煮込み中）」のように見せるために使う。
 *
 * @param {ScheduleEntry[]} entries schedule() が返した entries
 * @returns {Array<{startTime: number, attended: ScheduleEntry[], running: ScheduleEntry[]}>}
 */
export function toTimeSlots(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('entries は配列で指定してください');
  }
  const startTimes = [...new Set(entries.map((entry) => entry.startTime))].sort((a, b) => a - b);
  return startTimes.map((startTime) => ({
    startTime,
    attended: entries.filter((entry) => entry.attended && entry.startTime === startTime),
    running: entries.filter(
      (entry) => !entry.attended && entry.startTime <= startTime && entry.endTime > startTime,
    ),
  }));
}
