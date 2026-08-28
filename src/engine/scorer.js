/**
 * scorer.js — PitchMirror 採点エンジン（純粋関数のみ）
 *
 * DOM も Web Audio も一切触らない。Frame の配列と付随情報だけを受け取り、
 * 契約書（docs/02-architecture-contract.md）の Score / Metrics を返す。
 * これによりヘッドレス Node でも同じロジックをそのまま検証できる。
 *
 * 依存ゼロ・ネットワークゼロ。
 */

/* eslint-disable no-bitwise */

/** 1フレームの想定間隔（秒）。実測が取れる場合はフレームの t から算出する。 */
const DEFAULT_DT = 0.04;

/**
 * overall の加重平均の重み。合計 1.0。
 * @type {{pace:number, energy:number, variation:number, pause:number}}
 */
export const SCORE_WEIGHTS = Object.freeze({
  pace: 0.30,
  energy: 0.25,
  variation: 0.25,
  pause: 0.20,
});

/** 日本語として自然な話速（モーラ/秒）の目標帯 */
export const PACE_TARGET = Object.freeze({ min: 5.0, max: 7.0 });

/** 「良い間」と見なす無音の長さ（秒） */
export const PAUSE_GOOD = Object.freeze({ min: 0.35, max: 1.2 });

/** これを超える無音は「詰まり」として減点（秒） */
export const PAUSE_TOO_LONG = 2.5;

/** 指摘文が点灯／消灯するまでに条件が継続すべき秒数（チラつき防止） */
export const TIP_HOLD_SEC = 1.5;

const clamp = (v, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** ガウス型の減点カーブ。center から離れるほどなだらかに 0 へ。 */
function gaussScore(value, center, sigma) {
  const d = value - center;
  return 100 * Math.exp(-(d * d) / (2 * sigma * sigma));
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

/** Hz → セムトーン（100Hz 基準）。ピッチの分散は対数軸で見るのが自然。 */
function toSemitone(hz) {
  return 12 * Math.log2(hz / 100);
}

/**
 * 採点の可変状態（EMA と指摘文の安定化タイマー）を作る。
 * 純粋関数側にこの箱を渡し込む形にして、モジュール自体はステートレスに保つ。
 * @returns {Object} スコア平滑化・Tips安定化のための状態オブジェクト
 */
export function createScorerState() {
  return {
    /** @type {Score|null} 平滑化済みスコア */
    smoothed: null,
    /** @type {Record<string,{onSince:number, offSince:number, shown:boolean}>} */
    tipTimers: Object.create(null),
    /** @type {string[]} 直近に確定した指摘文 */
    tips: [],
  };
}

/**
 * フレーム列から発話構造（音節オンセット・無音区間）を抽出する。
 * オンセットは RMS の半波整流フラックスの局所ピークで検出するため、
 * 抑揚の浅い棒読みでも取りこぼさず、かつ「立ち上がりの鋭さ」も同時に得られる。
 *
 * @param {Frame[]} frames 解析対象のフレーム列（時系列昇順）
 * @returns {{dt:number, elapsed:number, onsets:number[], onsetSharpness:number,
 *            pauses:number[], voicedRatio:number, meanRms:number,
 *            rmsCv:number, pitchStdSemitone:number, meanCentroid:number}}
 */
export function analyzeFrames(frames) {
  const n = frames.length;
  const empty = {
    dt: DEFAULT_DT,
    elapsed: 0,
    onsets: [],
    onsetSharpness: 0,
    pauses: [],
    voicedRatio: 0,
    meanRms: 0,
    rmsCv: 0,
    pitchStdSemitone: 0,
    meanCentroid: 0,
  };
  if (n < 2) return empty;

  const dt = Math.max(0.005, (frames[n - 1].t - frames[0].t) / (n - 1)) || DEFAULT_DT;
  const elapsed = Math.max(dt, frames[n - 1].t - frames[0].t + dt);

  // --- 音量・ピッチ統計（有声フレームのみ） ---
  const voicedRms = [];
  const voicedSemi = [];
  const centroids = [];
  let voicedCount = 0;
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    if (f.voiced) {
      voicedCount++;
      voicedRms.push(f.rms);
      centroids.push(f.centroid);
      if (f.pitchHz > 0) voicedSemi.push(toSemitone(f.pitchHz));
    }
  }
  const meanRms = mean(voicedRms);
  const rmsCv = meanRms > 1e-6 ? stdev(voicedRms) / meanRms : 0;
  const pitchStdSemitone = stdev(voicedSemi);

  // --- オンセット検出（RMS 上昇フラックスの局所ピーク） ---
  const flux = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const d = frames[i].rms - frames[i - 1].rms;
    flux[i] = d > 0 ? d : 0;
  }
  let fluxSum = 0;
  for (let i = 0; i < n; i++) fluxSum += flux[i];
  const fluxMean = fluxSum / n;
  // 適応閾値: 平均フラックスの 1.0 倍。浅い変調でも相対的に拾える。
  const thresh = Math.max(fluxMean, 1e-7);
  const minGap = 0.075; // 秒。これ未満の連続検出は同一音節とみなす
  const onsets = [];
  let sharpSum = 0;
  let lastT = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (!frames[i].voiced) continue;
    const v = flux[i];
    if (v <= thresh) continue;
    if (v < flux[i - 1] || v < flux[i + 1]) continue; // 局所ピークのみ
    const t = frames[i].t;
    if (t - lastT < minGap) continue;
    lastT = t;
    onsets.push(t);
    sharpSum += v;
  }
  // 立ち上がりの鋭さ = 平均オンセット強度 / 平均音量（無次元化）
  const onsetSharpness = onsets.length && meanRms > 1e-6
    ? (sharpSum / onsets.length) / meanRms
    : 0;

  // --- 無音区間（前後を有声に挟まれたものだけを「間」とみなす） ---
  const pauses = [];
  let firstVoiced = -1;
  let lastVoiced = -1;
  for (let i = 0; i < n; i++) {
    if (frames[i].voiced) {
      if (firstVoiced < 0) firstVoiced = i;
      lastVoiced = i;
    }
  }
  if (firstVoiced >= 0) {
    let runStart = -1;
    for (let i = firstVoiced; i <= lastVoiced; i++) {
      if (!frames[i].voiced) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        pauses.push((i - runStart) * dt);
        runStart = -1;
      }
    }
  }

  return {
    dt,
    elapsed,
    onsets,
    onsetSharpness,
    pauses,
    voicedRatio: voicedCount / n,
    meanRms,
    rmsCv,
    pitchStdSemitone,
    meanCentroid: mean(centroids),
  };
}

/**
 * 抽出済み統計から生スコア（平滑化前）を計算する。
 * @param {ReturnType<typeof analyzeFrames>} st analyzeFrames の戻り値
 * @param {{fillerCount?:number}} [extra] フィラー語数など補助情報
 * @returns {Score} 0..100 の5指標
 */
export function scoreFromStats(st, extra = {}) {
  const speakSec = Math.max(0.001, st.elapsed * st.voicedRatio);
  const syllableRate = st.onsets.length / speakSec;

  // --- pace: 5〜7 モーラ/秒が満点。両方向に減点。 ---
  let pace;
  if (syllableRate >= PACE_TARGET.min && syllableRate <= PACE_TARGET.max) {
    pace = 100;
  } else if (syllableRate < PACE_TARGET.min) {
    pace = 100 - (PACE_TARGET.min - syllableRate) * 24;
  } else {
    pace = 100 - (syllableRate - PACE_TARGET.max) * 24;
  }
  pace = clamp(pace);

  // --- energy: 平均音量 + 立ち上がりの鋭さ ---
  const level = clamp01((st.meanRms - 0.03) / 0.19) * 100;
  const sharp = clamp01(st.onsetSharpness / 0.55) * 100;
  const energy = clamp(0.7 * level + 0.3 * sharp);

  // --- variation: 抑揚。棒読みを確実に落とす主指標。 ---
  const pitchScore = clamp01(st.pitchStdSemitone / 2.6) * 100;
  const dynScore = clamp01(st.rmsCv / 0.45) * 100;
  const variation = clamp(0.6 * pitchScore + 0.4 * dynScore);

  // --- pause: 0.35〜1.2秒の間を加点、無しも長すぎも減点 ---
  const good = st.pauses.filter((d) => d >= PAUSE_GOOD.min && d <= PAUSE_GOOD.max);
  const tooLong = st.pauses.filter((d) => d > PAUSE_TOO_LONG);
  const per10s = good.length / Math.max(0.5, st.elapsed / 10);
  let pause = gaussScore(per10s, 2.4, 1.7); // 10秒に2〜3回の「間」が理想
  pause -= Math.min(45, tooLong.length * 22);
  if (st.voicedRatio > 0.95) pause -= 12;   // 息継ぎ無しのマシンガン
  if (st.voicedRatio < 0.35) pause -= 20;   // 沈黙が支配的
  pause = clamp(pause);

  // --- フィラー語はごく軽い減点（Speech API 未対応時は 0 で無影響） ---
  const fillerPer10s = (extra.fillerCount || 0) / Math.max(0.5, st.elapsed / 10);
  const fillerPenalty = Math.min(12, fillerPer10s * 6);

  const overall = clamp(
    SCORE_WEIGHTS.pace * pace +
    SCORE_WEIGHTS.energy * energy +
    SCORE_WEIGHTS.variation * variation +
    SCORE_WEIGHTS.pause * pause -
    fillerPenalty
  );

  return {
    pace: Math.round(pace),
    energy: Math.round(energy),
    variation: Math.round(variation),
    pause: Math.round(pause),
    overall: Math.round(overall),
  };
}

/**
 * 指数移動平均でスコアをなめらかにする（ゲージがガタつかないように）。
 * @param {Score|null} prev 直前の平滑化済みスコア
 * @param {Score} next 今回の生スコア
 * @param {number} [alpha=0.18] 追従係数 0..1
 * @returns {Score}
 */
export function smoothScore(prev, next, alpha = 0.18) {
  if (!prev) return { ...next };
  const out = {};
  for (const k of ['pace', 'energy', 'variation', 'pause', 'overall']) {
    out[k] = Math.round(prev[k] + (next[k] - prev[k]) * alpha);
  }
  return /** @type {Score} */ (out);
}

/**
 * 指摘文の候補定義。id / 条件 / 文面 / 優先度。
 * 条件は「1.5秒以上継続」して初めて点灯するので、ティックごとに入れ替わらない。
 */
const TIP_RULES = [
  {
    id: 'fast',
    priority: 1,
    text: '早口です。1割ゆっくり',
    test: (c) => c.syllableRate > 7.6,
  },
  {
    id: 'slow',
    priority: 4,
    text: 'ゆっくりすぎます。少し前へ',
    test: (c) => c.syllableRate > 0 && c.syllableRate < 4.0,
  },
  {
    id: 'flat',
    priority: 2,
    text: '抑揚が平坦です。語尾を動かして',
    test: (c) => c.raw.variation < 45,
  },
  {
    id: 'longpause',
    priority: 1,
    text: '間が長すぎます',
    test: (c) => c.longestPause > PAUSE_TOO_LONG,
  },
  {
    id: 'nopause',
    priority: 3,
    text: '間がありません。文の切れ目で止めて',
    test: (c) => c.elapsed > 6 && c.pauseCount === 0 && c.speakingRatio > 0.9,
  },
  {
    id: 'quiet',
    priority: 3,
    text: '声が小さいです。もう一段前へ',
    test: (c) => c.raw.energy < 38,
  },
  {
    id: 'filler',
    priority: 2,
    text: '「えー」「あの」が多いです',
    test: (c) => c.fillerCount / Math.max(0.5, c.elapsed / 10) > 1.5,
  },
  {
    id: 'good',
    priority: 9,
    text: 'いいテンポです。この調子で',
    test: (c) => c.raw.overall >= 78,
  },
];

/**
 * 指摘文を安定化しながら更新する（条件が TIP_HOLD_SEC 継続して初めて点灯／消灯）。
 * @param {Object} state createScorerState() の状態
 * @param {Object} ctx 判定に使う文脈（syllableRate, longestPause, raw など）
 * @param {number} now 現在時刻（秒）
 * @param {boolean} [immediate=false] true なら継続判定を飛ばし、その瞬間の条件で確定する（サマリー用）
 * @returns {string[]} 最大3件の日本語指摘文
 */
export function updateTips(state, ctx, now, immediate = false) {
  const timers = state.tipTimers;
  const active = [];
  for (const rule of TIP_RULES) {
    let t = timers[rule.id];
    if (!t) {
      t = timers[rule.id] = { onSince: Infinity, offSince: now, shown: false };
    }
    const hit = !!rule.test(ctx);
    if (hit) {
      if (!isFinite(t.onSince)) t.onSince = now;
      t.offSince = Infinity;
      if (!t.shown && (immediate || now - t.onSince >= TIP_HOLD_SEC)) t.shown = true;
    } else {
      if (!isFinite(t.offSince)) t.offSince = now;
      t.onSince = Infinity;
      if (t.shown && (immediate || now - t.offSince >= TIP_HOLD_SEC)) t.shown = false;
    }
    if (t.shown) active.push(rule);
  }
  active.sort((a, b) => a.priority - b.priority);
  state.tips = active.slice(0, 3).map((r) => r.text);
  return state.tips;
}

/**
 * 採点の入口。フレーム列から Score と Metrics をまとめて返す。
 * AudioEngine からも、ヘッドレス検証からも同じ関数を通す。
 *
 * @param {Object} state createScorerState() の状態（EMA・Tips安定化に使用）
 * @param {Object} input
 * @param {Frame[]} input.frames        評価対象フレーム（通常は直近ウィンドウ）
 * @param {number} [input.elapsed]      計測開始からの経過秒（省略時はフレームから推定）
 * @param {number} [input.fillerCount]  フィラー語数（Speech API 無効時は 0）
 * @param {boolean} [input.smooth=true] EMA 平滑化を行うか（サマリーでは false）
 * @param {number} [input.alpha=0.18]   EMA 係数
 * @param {boolean} [input.immediateTips=false] 継続判定を飛ばして即座に指摘を出す（サマリー用）
 * @returns {{score:Score, metrics:Metrics}}
 */
export function evaluate(state, input) {
  const frames = input.frames || [];
  const st = analyzeFrames(frames);
  const fillerCount = input.fillerCount || 0;
  const raw = scoreFromStats(st, { fillerCount });

  const speakSec = Math.max(0.001, st.elapsed * st.voicedRatio);
  const syllableRate = st.onsets.length / speakSec;
  const goodPauses = st.pauses.filter((d) => d >= PAUSE_GOOD.min);
  const longestPause = st.pauses.length ? Math.max(...st.pauses) : 0;
  const elapsed = input.elapsed != null ? input.elapsed : st.elapsed;

  const score = input.smooth === false
    ? raw
    : (state.smoothed = smoothScore(state.smoothed, raw, input.alpha ?? 0.18));

  const ctx = {
    syllableRate,
    longestPause,
    pauseCount: goodPauses.length,
    speakingRatio: st.voicedRatio,
    elapsed,
    fillerCount,
    raw,
  };
  const coachTips = updateTips(state, ctx, elapsed, input.immediateTips === true);

  /** @type {Metrics} */
  const metrics = {
    elapsed: Math.round(elapsed * 10) / 10,
    syllableRate: Math.round(syllableRate * 100) / 100,
    speakingRatio: Math.round(st.voicedRatio * 1000) / 1000,
    longestPause: Math.round(longestPause * 100) / 100,
    pauseCount: goodPauses.length,
    fillerCount,
    coachTips,
  };

  return { score, metrics };
}
