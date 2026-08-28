/**
 * simulator.js — マイク無しでも完走できる合成 Frame ストリーム生成器
 *
 * デモ会場でマイク権限が拒否されても、そもそもマイクが無くても、
 * PitchMirror は必ず最後まで動き切る（W4：デモは絶対に落ちない）。
 *
 * 乱数は seed 付き擬似乱数（mulberry32）のみを使う。Math.random は使わない。
 * よって 'monotone' と 'energetic' のスコアは毎回まったく同じ値に着地する。
 * これがデモの「ビフォー／アフター」の仕込みになる。
 */

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * mulberry32 — 32bit seed の高速決定性 PRNG。
 * @param {number} seed 整数シード
 * @returns {() => number} 0..1 の擬似乱数を返す関数
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * シナリオ定義。数値はすべて実測に基づいて調整済み。
 * monotone → overall 30〜45 / energetic → overall 78〜92 に着地する。
 * @type {Record<'monotone'|'energetic', Object>}
 */
export const SCENARIOS = Object.freeze({
  // 棒読み：一定ピッチ・一定音量・息継ぎ無しの早口
  monotone: {
    seed: 20260828,
    pitchHz: 128,
    pitchDriftSemi: 0.05,   // ほぼ動かない
    contourSemi: 0.0,
    syllableRate: 8.4,      // 早口
    envFloor: 0.87,         // 音節の谷が浅い＝抑揚が無い
    envShape: 1.0,
    baseRms: 0.090,
    phraseSec: [30, 30],    // 事実上ずっと喋りっぱなし
    pauseSec: [0, 0],
    phraseLevelJitter: 0.02,
    centroid: 0.30,
    centroidSwing: 0.02,
  },
  // 熱量のある話し方：ピッチ contour・強弱・適度な間
  energetic: {
    seed: 777,
    pitchHz: 152,
    pitchDriftSemi: 1.6,    // 音節ごとの揺れ
    contourSemi: 4.4,       // フレーズ内の下降イントネーション
    syllableRate: 6.2,
    envFloor: 0.20,         // 音節がはっきり立つ
    envShape: 1.25,
    baseRms: 0.235,
    phraseSec: [2.4, 3.6],
    pauseSec: [0.45, 0.95],
    phraseLevelJitter: 0.22,
    centroid: 0.42,
    centroidSwing: 0.14,
  },
});

const SILENCE_RMS = 0.0035;

/**
 * 32bin のスペクトルを声のパラメータから合成する。
 * 60Hz〜6kHz を対数配置し、基本周波数の倍音列を立てる。
 * @param {number} pitchHz 基本周波数（0 なら無声）
 * @param {number} level   0..1 の音量係数
 * @param {number} centroid 0..1 の明るさ（高次倍音の傾き）
 * @param {() => number} rnd 決定性乱数
 * @returns {Float32Array} 長さ32・値域 0..1
 */
function synthSpectrum(pitchHz, level, centroid, rnd) {
  const bins = new Float32Array(32);
  const lo = 60, hi = 6000;
  const centers = [];
  for (let i = 0; i < 32; i++) centers.push(lo * Math.pow(hi / lo, i / 31));

  if (pitchHz > 0 && level > 0.02) {
    const tilt = 2.4 - centroid * 1.8; // centroid が高いほど倍音が減衰しにくい
    for (let h = 1; h <= 16; h++) {
      const f = pitchHz * h;
      if (f > hi) break;
      const amp = Math.pow(h, -tilt);
      for (let i = 0; i < 32; i++) {
        const d = Math.log2(centers[i] / f);
        if (Math.abs(d) > 0.6) continue;
        bins[i] += amp * Math.exp(-(d * d) / (2 * 0.18 * 0.18));
      }
    }
  }
  let max = 0;
  for (let i = 0; i < 32; i++) max = Math.max(max, bins[i]);
  const norm = max > 1e-9 ? 1 / max : 0;
  for (let i = 0; i < 32; i++) {
    // わずかなノイズ床を足して「本物っぽさ」を出す（見た目のためだけ）
    bins[i] = clamp01(bins[i] * norm * level + rnd() * 0.03 * level + 0.01);
  }
  return bins;
}

/**
 * 合成フレームの逐次生成器を作る。AudioEngine が setInterval で next() を回す。
 *
 * @param {'monotone'|'energetic'} [scenario='monotone'] シナリオ名
 * @param {{dt?:number, seed?:number}} [opts] dt はフレーム間隔（秒）
 * @returns {{scenario:string, dt:number, next:()=>Frame, reset:()=>void}}
 */
export function createSimulator(scenario = 'monotone', opts = {}) {
  const cfg = SCENARIOS[scenario] || SCENARIOS.monotone;
  const dt = opts.dt || 0.04;
  const seed = opts.seed != null ? opts.seed : cfg.seed;

  let rnd, t, segEnd, speaking, syllPhase, phraseStart, phraseLen, phraseLevel, wobble;

  const nextSegment = () => {
    if (speaking) {
      // フレーズ終了 → 間へ（pauseSec が 0 のシナリオでは間を作らない）
      const [pa, pb] = cfg.pauseSec;
      const d = pa + (pb - pa) * rnd();
      if (d <= 0.01) {
        // 息継ぎ無しシナリオ：そのまま次のフレーズへ
        phraseStart = t;
        const [qa, qb] = cfg.phraseSec;
        phraseLen = qa + (qb - qa) * rnd();
        segEnd = t + phraseLen;
        phraseLevel = 1 - cfg.phraseLevelJitter * rnd();
        return;
      }
      speaking = false;
      segEnd = t + d;
    } else {
      speaking = true;
      phraseStart = t;
      const [qa, qb] = cfg.phraseSec;
      phraseLen = qa + (qb - qa) * rnd();
      segEnd = t + phraseLen;
      phraseLevel = 1 - cfg.phraseLevelJitter * rnd();
      syllPhase = 0;
    }
  };

  const reset = () => {
    rnd = mulberry32(seed);
    t = 0;
    syllPhase = 0;
    wobble = 0;
    speaking = false;
    segEnd = 0;
    phraseStart = 0;
    phraseLen = 1;
    phraseLevel = 1;
    nextSegment(); // 最初のフレーズを開始
  };

  /**
   * 次の1フレームを返す。
   * @returns {Frame}
   */
  const next = () => {
    if (t >= segEnd) nextSegment();

    let rms, pitchHz, voiced, centroid;

    if (speaking) {
      const progress = phraseLen > 0 ? clamp01((t - phraseStart) / phraseLen) : 0;
      // フレーズ端の 0.1s は立ち上がり／立ち下がりをなだらかに
      const edge = Math.min(1, (t - phraseStart) / 0.1, (segEnd - t) / 0.1);

      syllPhase += dt * cfg.syllableRate;
      const frac = syllPhase - Math.floor(syllPhase);
      const shape = Math.pow(Math.sin(Math.PI * frac), cfg.envShape);
      const env = cfg.envFloor + (1 - cfg.envFloor) * shape;

      wobble = wobble * 0.9 + (rnd() - 0.5) * 0.1; // ゆっくりした音量の揺らぎ
      rms = cfg.baseRms * env * phraseLevel * edge * (1 + wobble * 0.5);
      rms = Math.max(SILENCE_RMS, Math.min(1, rms));

      // ピッチ：フレーズ内の下降 contour ＋ 音節ごとの揺れ
      const contour = -cfg.contourSemi * (progress - 0.35);
      const jitter = (rnd() - 0.5) * 2 * cfg.pitchDriftSemi;
      const accent = cfg.contourSemi * 0.35 * Math.sin(TAU * syllPhase * 0.5);
      pitchHz = cfg.pitchHz * Math.pow(2, (contour + jitter + accent) / 12);
      pitchHz = Math.max(70, Math.min(400, pitchHz));
      voiced = true;
      centroid = clamp01(cfg.centroid + cfg.centroidSwing * (shape - 0.5) * 2);
    } else {
      rms = SILENCE_RMS * (0.6 + rnd() * 0.8);
      pitchHz = 0;
      voiced = false;
      centroid = clamp01(cfg.centroid * 0.35);
    }

    const frame = {
      t: Math.round(t * 1000) / 1000,
      rms,
      pitchHz: voiced ? Math.round(pitchHz * 10) / 10 : 0,
      centroid,
      voiced,
      spectrum: synthSpectrum(pitchHz, voiced ? Math.min(1, rms / cfg.baseRms) : 0, centroid, rnd),
    };
    t += dt;
    return frame;
  };

  reset();
  return { scenario, dt, next, reset };
}

/**
 * 指定秒数ぶんの Frame 配列を一括生成する（ヘッドレス検証・サマリー再計算用）。
 * @param {'monotone'|'energetic'} scenario シナリオ名
 * @param {number} [seconds=20] 生成する長さ（秒）
 * @param {{dt?:number, seed?:number}} [opts]
 * @returns {Frame[]}
 */
export function generateFrames(scenario, seconds = 20, opts = {}) {
  const sim = createSimulator(scenario, opts);
  const n = Math.round(seconds / sim.dt);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = sim.next();
  return out;
}
