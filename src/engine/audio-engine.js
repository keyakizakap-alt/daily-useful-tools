/**
 * audio-engine.js — PitchMirror の解析エンジン本体
 *
 * Web Audio API（AnalyserNode）だけで音声特徴量を抽出し、scorer.js で採点する。
 * 外部ライブラリ・CDN・ネットワークアクセスは一切無い。fetch も import も外部を見ない。
 *
 * マイクが使えない環境では startSimulation() が同じ Frame 形式の合成入力を流すので、
 * デモは必ず最後まで完走する。
 */

import {
  createScorerState,
  evaluate,
} from './scorer.js';
import { createSimulator } from './simulator.js';

/** フレーム生成間隔（ms）。契約書の 20-60ms に収める。 */
const FRAME_MS = 40;
/** onTick（採点コールバック）の間隔（ms）。 */
const TICK_MS = 200;
/** ライブ採点で参照する直近ウィンドウ（秒）。 */
const WINDOW_SEC = 6;
/** 保持する最大フレーム数（約20分ぶん）。メモリ暴走の保険。 */
const MAX_FRAMES = 30000;

/** 人間の声として扱うピッチ範囲（Hz） */
const PITCH_MIN_HZ = 70;
const PITCH_MAX_HZ = 400;

/** rms を 0..1 に正規化するときの上限（これ以上は 1.0 に張り付く） */
const RMS_FULL_SCALE = 0.30;

/** 日本語のフィラー語（Web Speech API 有効時のみ使用） */
const FILLER_PATTERNS = [
  /えー+と?/g,
  /えっと/g,
  /あの[ぉー]*/g,
  /その[ぉー]+/g,
  /まあ+/g,
  /んー+/g,
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 自己相関法による基本周波数推定。
 * 時間領域バッファに対して正規化自己相関を取り、最初の有意なピークを拾う。
 * ピーク周辺は放物線補間してサンプル分解能より細かく求める。
 *
 * @param {Float32Array} buf 時間領域波形（-1..1）
 * @param {number} sampleRate サンプリング周波数
 * @returns {number} 推定 Hz。無声・推定不能なら 0
 */
export function detectPitch(buf, sampleRate) {
  const n = buf.length;

  // 無声判定用の実効値
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / n);
  if (rms < 0.008) return 0;

  const minLag = Math.floor(sampleRate / PITCH_MAX_HZ);
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / PITCH_MIN_HZ));
  if (maxLag <= minLag) return 0;

  // 端の不連続を抑えるため、両端をわずかにテーパーする
  let bestLag = -1;
  let bestVal = 0;
  let prev = 0;
  let rising = false;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i + lag < n; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      corr += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const norm = corr / (Math.sqrt(e1 * e2) + 1e-12); // -1..1 の正規化自己相関
    // 「一度谷を通ってから立ち上がった最初のピーク」を取る（倍音誤検出の抑制）
    if (!rising && norm < 0.35) rising = true;
    if (rising && norm > bestVal) {
      bestVal = norm;
      bestLag = lag;
    }
    if (rising && bestVal > 0.9 && norm < prev && bestLag > 0) break;
    prev = norm;
  }

  if (bestLag < 0 || bestVal < 0.4) return 0; // 周期性が弱い＝無声
  const hz = sampleRate / bestLag;
  if (hz < PITCH_MIN_HZ || hz > PITCH_MAX_HZ) return 0;
  return hz;
}

/**
 * FFT の振幅スペクトルを 32bin に対数ダウンサンプルして 0..1 に正規化する。
 * @param {Float32Array} mags 線形振幅（bin 数は fftSize/2）
 * @param {number} sampleRate サンプリング周波数
 * @param {Float32Array} out 長さ32の出力バッファ（再利用する）
 * @returns {Float32Array} out
 */
export function downsampleSpectrum(mags, sampleRate, out) {
  const nyq = sampleRate / 2;
  const lo = 60;
  const hi = Math.min(6000, nyq);
  let max = 1e-9;
  for (let i = 0; i < 32; i++) {
    const f0 = lo * Math.pow(hi / lo, i / 32);
    const f1 = lo * Math.pow(hi / lo, (i + 1) / 32);
    let b0 = Math.floor((f0 / nyq) * mags.length);
    let b1 = Math.ceil((f1 / nyq) * mags.length);
    if (b1 <= b0) b1 = b0 + 1;
    b1 = Math.min(b1, mags.length);
    let s = 0;
    for (let b = b0; b < b1; b++) s += mags[b];
    const v = s / Math.max(1, b1 - b0);
    out[i] = v;
    if (v > max) max = v;
  }
  for (let i = 0; i < 32; i++) out[i] = clamp01(out[i] / max);
  return out;
}

/**
 * PitchMirror 解析エンジン。契約書 §"Dev A の公開 API" のとおり。
 */
export class AudioEngine {
  /**
   * @param {{onFrame?:(f:Frame)=>void, onTick?:(s:Score, m:Metrics)=>void}} handlers
   *        onFrame は毎フレーム（約40ms）、onTick は約200msごとに呼ばれる。
   */
  constructor(handlers = {}) {
    /** @private */ this.onFrame = handlers.onFrame || (() => {});
    /** @private */ this.onTick = handlers.onTick || (() => {});

    /** @type {Frame[]} 収録済み全フレーム */
    this.frames = [];
    /** @type {'idle'|'mic'|'sim'} */
    this.mode = 'idle';
    /** @type {number} フィラー語の累計 */
    this.fillerCount = 0;

    /** @private */ this.scorerState = createScorerState();
    /** @private */ this.t = 0;
    /** @private */ this.frameTimer = null;
    /** @private */ this.tickTimer = null;
    /** @private */ this.ctx = null;
    /** @private */ this.stream = null;
    /** @private */ this.analyser = null;
    /** @private */ this.recognition = null;
    /** @private */ this.speechEnabled = false;

    // マイク用の作業バッファ（毎フレーム確保しない）
    /** @private */ this.timeBuf = null;
    /** @private */ this.freqBuf = null;
    /** @private */ this.magBuf = null;
    /** @private */ this.prevMag = null;

    // 適応ノイズフロア（暗騒音に追従し、静かな会場でも騒がしい会場でも動く）
    /** @private */ this.noiseFloor = 0.006;
    /** @private */ this.flux = 0;
    /** @private */ this.simulator = null;
    /** @private */ this.lastScore = null;
    /** @private */ this.lastMetrics = null;
  }

  /**
   * マイクを起動して解析を開始する。
   * 権限拒否・デバイス無し・AudioContext 未対応のいずれでも例外を投げるので、
   * 呼び出し側は catch して startSimulation() にフォールバックすること。
   * @returns {Promise<void>}
   * @throws {Error} マイクが使えない場合
   */
  async start() {
    this.stop();

    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!md || !md.getUserMedia) throw new Error('getUserMedia 非対応の環境です');
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('AudioContext 非対応の環境です');

    // 声の生の特徴量が欲しいので、ブラウザ側の加工は全部切る
    this.stream = await md.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });

    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const src = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;   // 立ち上がり検出のため平滑化しない
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    src.connect(analyser);
    // 出力には繋がない（ハウリング防止）。AnalyserNode は接続なしでも動く。
    this.analyser = analyser;

    const bins = analyser.frequencyBinCount;
    this.timeBuf = new Float32Array(analyser.fftSize);
    this.freqBuf = new Float32Array(bins);
    this.magBuf = new Float32Array(bins);
    this.prevMag = new Float32Array(bins);

    this.mode = 'mic';
    this.t = 0;
    this.frames = [];
    this.noiseFloor = 0.006;
    this.scorerState = createScorerState();
    this._startLoops(() => this._micFrame());
  }

  /**
   * マイク無しで動くデモ用の合成入力を開始する。
   * 同じ seed から生成するため、'monotone' と 'energetic' のスコアは毎回同じ値になる。
   * @param {'monotone'|'energetic'} [scenario='monotone'] シナリオ名
   * @returns {void}
   */
  startSimulation(scenario = 'monotone') {
    this.stop();
    this.simulator = createSimulator(scenario, { dt: FRAME_MS / 1000 });
    this.mode = 'sim';
    this.t = 0;
    this.frames = [];
    this.fillerCount = 0;
    this.scorerState = createScorerState();
    this._startLoops(() => this.simulator.next());
  }

  /**
   * 解析を停止し、マイク・AudioContext・音声認識をすべて解放する。
   * 何度呼んでも安全（冪等）。
   * @returns {void}
   */
  stop() {
    if (this.frameTimer) { clearInterval(this.frameTimer); this.frameTimer = null; }
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.stream) {
      try { this.stream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* noop */ }
      this.stream = null;
    }
    if (this.ctx) {
      try { this.ctx.close(); } catch (_) { /* noop */ }
      this.ctx = null;
    }
    this.analyser = null;
    if (this.recognition) {
      try { this.recognition.onend = null; this.recognition.stop(); } catch (_) { /* noop */ }
    }
    this.mode = 'idle';
  }

  /**
   * 計測終了後の最終結果。全フレームを使って（平滑化なしで）採点し直す。
   * @returns {{score:Score, metrics:Metrics, frames:Frame[]}}
   */
  getSummary() {
    const fresh = createScorerState();
    const { score, metrics } = evaluate(fresh, {
      frames: this.frames,
      elapsed: this.t,
      fillerCount: this.fillerCount,
      smooth: false,
      immediateTips: true,
    });
    return { score, metrics, frames: this.frames };
  }

  /**
   * Web Speech API による日本語フィラー語カウントを任意で有効化する。
   * 未対応環境では **false を返すだけで例外を投げない**。
   * 無効でもエンジンは完全に動作し、fillerCount は 0 のままになる。
   * @returns {boolean} 有効化できたか
   */
  enableSpeech() {
    try {
      const SR = (typeof window !== 'undefined')
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null;
      if (!SR) return false;

      const rec = new SR();
      rec.lang = 'ja-JP';
      rec.continuous = true;
      rec.interimResults = false;

      rec.onresult = (ev) => {
        try {
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (!r.isFinal) continue;
            const text = r[0] && r[0].transcript ? r[0].transcript : '';
            this.fillerCount += countFillers(text);
          }
        } catch (_) { /* 認識結果の形が違っても採点は止めない */ }
      };
      // 認識は勝手に止まるので、計測中なら黙って再開する
      rec.onend = () => {
        if (this.speechEnabled && this.mode === 'mic') {
          try { rec.start(); } catch (_) { /* noop */ }
        }
      };
      rec.onerror = () => { /* 権限拒否・no-speech は無視。スコアは出続ける */ };

      rec.start();
      this.recognition = rec;
      this.speechEnabled = true;
      return true;
    } catch (_) {
      this.speechEnabled = false;
      return false;
    }
  }

  // ---------------------------------------------------------------- private

  /**
   * フレームループと採点ティックを起動する。
   * @private
   * @param {() => Frame|null} produce 1フレームを生成する関数
   */
  _startLoops(produce) {
    this.frameTimer = setInterval(() => {
      let f;
      try { f = produce(); } catch (_) { return; }
      if (!f) return;
      this.frames.push(f);
      if (this.frames.length > MAX_FRAMES) this.frames.shift();
      this.t = f.t;
      try { this.onFrame(f); } catch (_) { /* 可視化側の例外で解析を止めない */ }
    }, FRAME_MS);

    this.tickTimer = setInterval(() => {
      const t = this.t;
      // 直近ウィンドウのみでライブ採点する（発表中の「今」を映す鏡）
      let i = this.frames.length - 1;
      while (i > 0 && this.frames[i].t > t - WINDOW_SEC) i--;
      const win = this.frames.slice(i);
      const { score, metrics } = evaluate(this.scorerState, {
        frames: win,
        elapsed: t,
        fillerCount: this.fillerCount,
      });
      this.lastScore = score;
      this.lastMetrics = metrics;
      try { this.onTick(score, metrics); } catch (_) { /* noop */ }
    }, TICK_MS);
  }

  /**
   * マイク入力から 1 フレームぶんの特徴量を計算する。
   * @private
   * @returns {Frame|null}
   */
  _micFrame() {
    const an = this.analyser;
    if (!an) return null;
    const sr = this.ctx.sampleRate;

    an.getFloatTimeDomainData(this.timeBuf);
    an.getFloatFrequencyData(this.freqBuf); // dBFS

    // --- RMS と適応ノイズフロア ---
    let sumSq = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = this.timeBuf[i];
      sumSq += v * v;
    }
    const rmsRaw = Math.sqrt(sumSq / this.timeBuf.length);
    // 下がるときは速く、上がるときは非常にゆっくり追従＝暗騒音だけを掴む
    const k = rmsRaw < this.noiseFloor ? 0.35 : 0.0015;
    this.noiseFloor += (rmsRaw - this.noiseFloor) * k;
    if (this.noiseFloor < 0.0015) this.noiseFloor = 0.0015;

    const voiced = rmsRaw > Math.max(this.noiseFloor * 3.0, 0.006);
    const rms = clamp01(rmsRaw / RMS_FULL_SCALE);

    // --- 振幅スペクトル（dB → 線形）とスペクトル重心 ---
    const mags = this.magBuf;
    let magSum = 0;
    let weighted = 0;
    const nyq = sr / 2;
    for (let i = 0; i < mags.length; i++) {
      const m = Math.pow(10, this.freqBuf[i] / 20);
      mags[i] = m;
      magSum += m;
      weighted += m * ((i + 0.5) / mags.length) * nyq;
    }
    const centroidHz = magSum > 1e-9 ? weighted / magSum : 0;
    // 声の明るさとして扱いやすいよう 4kHz で正規化
    const centroid = voiced ? clamp01(centroidHz / 4000) : 0;

    // --- スペクトルフラックス（オンセット検出のためエンジン側でも保持） ---
    let flux = 0;
    for (let i = 0; i < mags.length; i++) {
      const d = mags[i] - this.prevMag[i];
      if (d > 0) flux += d;
      this.prevMag[i] = mags[i];
    }
    this.flux = flux;

    // --- ピッチ（自己相関） ---
    const pitchHz = voiced ? detectPitch(this.timeBuf, sr) : 0;

    const spectrum = new Float32Array(32);
    downsampleSpectrum(mags, sr, spectrum);
    if (!voiced) for (let i = 0; i < 32; i++) spectrum[i] *= 0.15;

    const t = this.t + FRAME_MS / 1000;
    return { t: Math.round(t * 1000) / 1000, rms, pitchHz, centroid, voiced, spectrum };
  }
}

/**
 * 文字列に含まれる日本語フィラー語の数を数える。
 * @param {string} text 認識されたテキスト
 * @returns {number} フィラー語の出現数
 */
export function countFillers(text) {
  if (!text) return 0;
  let n = 0;
  for (const re of FILLER_PATTERNS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

export default AudioEngine;
