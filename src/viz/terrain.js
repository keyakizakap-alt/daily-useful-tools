/**
 * terrain.js — PitchMirror の主役ビジュアル「声の地形」
 *
 * 各 Frame の 32bin スペクトルを 1本の稜線として描き、奥へスクロールさせる
 * アイソメトリック擬似3D。
 *   - 音量が大きく変化に富む話し方 → 荒々しい山脈
 *   - 棒読み                       → のっぺりした平原
 * この落差がデモの punchline なので、非線形ゲインで意図的に誇張してある。
 *
 * 依存ゼロ / Canvas 2D / ES Module。push() はデータ投入のみ。
 *
 * @typedef {Object} Frame
 * @property {number} t
 * @property {number} rms
 * @property {number} pitchHz
 * @property {number} centroid
 * @property {boolean} voiced
 * @property {Float32Array} spectrum
 */

const FALLBACK = {
  '--accent': '#3ddc97',
  '--warn': '#ff5c5c',
  '--bg': '#0b0e14',
  '--fg': '#e8ecf1',
  '--muted': '#6b7684',
};
const VAR_NAMES = ['--accent', '--warn', '--bg', '--fg', '--muted'];

function readTheme() {
  const out = Object.assign({}, FALLBACK);
  try {
    if (typeof document === 'undefined' || !document.documentElement) return out;
    const cs = getComputedStyle(document.documentElement);
    for (const name of VAR_NAMES) {
      const v = cs.getPropertyValue(name);
      if (v && v.trim()) out[name] = v.trim();
    }
  } catch (_) { /* noop */ }
  return out;
}

function parseColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const h = m[1];
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.every((n) => Number.isFinite(n))) return { r: p[0], g: p[1], b: p[2] };
  }
  return null;
}

function mixRGB(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}
function rgba(c, a) { return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

const BINS = 32;
const MAX_RIDGES = 120;      // 保持する稜線の上限（性能ガード）
const WINDOW_SEC = 4.6;      // 手前→地平線までの所要秒数
const MIN_PITCH = 70;
const MAX_PITCH = 400;

export class Terrain {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas || null;
    this.ctx = null;
    try {
      if (this.canvas && typeof this.canvas.getContext === 'function') {
        this.ctx = this.canvas.getContext('2d');
      }
    } catch (_) { this.ctx = null; }

    this.theme = readTheme();
    this.dpr = 1;
    this.w = 0;
    this.h = 0;

    /** @type {{age:number, spec:Float32Array, rms:number, pitch:number, centroid:number, voiced:boolean}[]}
     *  age が小さいほど手前。リングバッファ代わりに配列を使い、必ず MAX_RIDGES で切る。 */
    this.ridges = [];
    this._pool = [];           // Float32Array を使い回して GC 圧を下げる
    this._drama = 0;           // 直近の激しさ 0..1（背景演出に使う）
    this._rmsAvg = 0;
    this._rmsVar = 0;

    this._running = false;
    this._raf = 0;
    this._last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._themeAge = 0;
    this._starPhase = 0;

    this._onResize = () => this.resize();
    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', this._onResize);
      }
    } catch (_) { /* noop */ }

    // レイアウト確定が構築より後になっても自動で追随する（マウント側の resize() 呼び出し不要）
    this._ro = null;
    try {
      if (typeof ResizeObserver !== 'undefined' && this.canvas) {
        this._ro = new ResizeObserver(this._onResize);
        this._ro.observe(this.canvas);
      }
    } catch (_) { this._ro = null; }

    this.resize();
    this.start();
  }

  /** @param {Frame} frame */
  push(frame) {
    if (!frame || typeof frame !== 'object') return;
    const src = frame.spectrum;
    let spec = this._pool.pop();
    if (!spec) spec = new Float32Array(BINS);

    if (src && typeof src.length === 'number' && src.length > 0) {
      const n = src.length;
      for (let i = 0; i < BINS; i++) {
        // 長さが 32 でなくても線形リサンプルで受ける
        const p = (i / (BINS - 1)) * (n - 1);
        const i0 = Math.floor(p);
        const i1 = Math.min(n - 1, i0 + 1);
        const f = p - i0;
        const v = src[i0] * (1 - f) + src[i1] * f;
        spec[i] = Number.isFinite(v) ? clamp01(v) : 0;
      }
    } else {
      spec.fill(0);
    }

    const rms = clamp01(Number.isFinite(frame.rms) ? frame.rms : 0);
    const pitch = Number.isFinite(frame.pitchHz) ? frame.pitchHz : 0;
    const centroid = clamp01(Number.isFinite(frame.centroid) ? frame.centroid : 0);

    this.ridges.unshift({
      age: 0,
      spec,
      rms,
      pitch,
      centroid,
      voiced: !!frame.voiced,
    });

    // 動的レンジ統計（棒読み/熱量の差を背景演出にも効かせる）
    const a = 0.06;
    const d = rms - this._rmsAvg;
    this._rmsAvg += a * d;
    this._rmsVar += a * (d * d - this._rmsVar);
    const dramaNow = clamp01(Math.sqrt(this._rmsVar) * 6.5 + this._rmsAvg * 0.7);
    this._drama += (dramaNow - this._drama) * 0.08;

    this._trim();
  }

  _trim() {
    while (this.ridges.length > MAX_RIDGES) {
      const r = this.ridges.pop();
      if (r && r.spec && this._pool.length < MAX_RIDGES + 8) this._pool.push(r.spec);
    }
  }

  resize() {
    const cv = this.canvas;
    if (!cv) return;
    let dpr = 1;
    try { dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1; } catch (_) { dpr = 1; }
    dpr = Math.max(1, Math.min(3, dpr));

    let cssW = 0;
    let cssH = 0;
    try {
      const r = typeof cv.getBoundingClientRect === 'function' ? cv.getBoundingClientRect() : null;
      cssW = r ? r.width : 0;
      cssH = r ? r.height : 0;
    } catch (_) { /* noop */ }
    if (!cssW) cssW = cv.clientWidth || 0;
    if (!cssH) cssH = cv.clientHeight || 0;

    this.dpr = dpr;
    this.w = Math.max(0, Math.floor(cssW));
    this.h = Math.max(0, Math.floor(cssH));
    const pw = Math.max(1, Math.floor(this.w * dpr));
    const ph = Math.max(1, Math.floor(this.h * dpr));
    if (cv.width !== pw) cv.width = pw;
    if (cv.height !== ph) cv.height = ph;

    this.theme = readTheme();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const loop = (now) => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(loop);
      const t = Number.isFinite(now) ? now : Date.now();
      let dt = (t - this._last) / 1000;
      this._last = t;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.1) dt = 0.1;
      try {
        this._step(dt);
        this._draw(t);
      } catch (_) { /* 描画で落とさない */ }
    };
    try { this._raf = requestAnimationFrame(loop); } catch (_) { this._running = false; }
  }

  stop() {
    this._running = false;
    try { if (this._raf) cancelAnimationFrame(this._raf); } catch (_) { /* noop */ }
    this._raf = 0;
  }

  destroy() {
    this.stop();
    try {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('resize', this._onResize);
      }
    } catch (_) { /* noop */ }
    try { if (this._ro) this._ro.disconnect(); } catch (_) { /* noop */ }
    this._ro = null;
    this.ridges.length = 0;
    this._pool.length = 0;
  }

  /** 全消去（再計測の頭出し用）。 */
  clear() {
    while (this.ridges.length) {
      const r = this.ridges.pop();
      if (r && r.spec && this._pool.length < MAX_RIDGES + 8) this._pool.push(r.spec);
    }
    this._drama = 0;
    this._rmsAvg = 0;
    this._rmsVar = 0;
  }

  _step(dt) {
    // 稜線を実時間で奥へ流す。push レートに依らず滑らかに動く。
    const arr = this.ridges;
    for (let i = 0; i < arr.length; i++) arr[i].age += dt;
    // 地平線を越えたものを捨てる
    while (arr.length && arr[arr.length - 1].age > WINDOW_SEC) {
      const r = arr.pop();
      if (r && r.spec && this._pool.length < MAX_RIDGES + 8) this._pool.push(r.spec);
    }
    this._trim();
    this._starPhase += dt;

    this._themeAge += dt;
    if (this._themeAge > 1.5) { this._themeAge = 0; this.theme = readTheme(); }
  }

  /** 深さ d(0..1) → 遠近係数 f(1..~0.22) */
  _persp(d) {
    return 1 / (1 + d * 3.2);
  }

  /** ピッチ(Hz)と振幅から稜線の色を作る。低い=寒色 / 高い=暖色。 */
  _ridgeColor(pitch, amp, centroid) {
    const accent = parseColor(this.theme['--accent']) || parseColor(FALLBACK['--accent']);
    const warn = parseColor(this.theme['--warn']) || parseColor(FALLBACK['--warn']);
    const cool = { r: 58, g: 122, b: 232 };   // 深い青（最低域）
    const amber = { r: 250, g: 186, b: 62 };  // 琥珀（中高域）

    let t;
    if (pitch > 0) {
      const lo = Math.log(MIN_PITCH);
      const hi = Math.log(MAX_PITCH);
      t = clamp01((Math.log(Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch))) - lo) / (hi - lo));
    } else {
      // 無声区間は明るさ(centroid)で代替し、寒色寄りに落とす
      t = clamp01(centroid) * 0.35;
    }

    // 4ストップの寒→暖ランプ
    let c;
    if (t < 0.34) c = mixRGB(cool, accent, t / 0.34);
    else if (t < 0.67) c = mixRGB(accent, amber, (t - 0.34) / 0.33);
    else c = mixRGB(amber, warn, (t - 0.67) / 0.33);

    // 振幅で発光量（小さい声はくすみ、大きい声は白く抜ける）
    const white = { r: 255, g: 255, b: 255 };
    return mixRGB(c, white, clamp01(amp) * 0.42);
  }

  _draw(now) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.w;
    const H = this.h;
    if (W <= 0 || H <= 0) return;

    const th = this.theme;
    const bg = parseColor(th['--bg']) || parseColor(FALLBACK['--bg']);
    const muted = parseColor(th['--muted']) || parseColor(FALLBACK['--muted']);
    const accent = parseColor(th['--accent']) || parseColor(FALLBACK['--accent']);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const horizonY = H * 0.30;
    const frontY = H * 0.94;
    const cx = W * 0.5;

    // --- 背景: 地平線のグロー（drama で強くなる） ---
    ctx.save();
    const glow = ctx.createLinearGradient(0, horizonY - H * 0.28, 0, horizonY + H * 0.16);
    glow.addColorStop(0, rgba(bg, 0));
    glow.addColorStop(0.65, rgba(accent, 0.05 + this._drama * 0.16));
    glow.addColorStop(1, rgba(bg, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, horizonY + H * 0.18);

    // 地平線
    ctx.strokeStyle = rgba(muted, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(horizonY) + 0.5);
    ctx.lineTo(W, Math.round(horizonY) + 0.5);
    ctx.stroke();
    ctx.restore();

    const arr = this.ridges;
    if (!arr.length) {
      this._drawIdle(ctx, W, H, horizonY, frontY, muted);
      return;
    }

    // --- 稜線を奥から手前へ描く（後から描いた方が手前に重なる） ---
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const maxH = (frontY - horizonY) * 0.92;
    const halfW = W * 0.46;

    // 奥の稜線は間引く（圧縮されて見分けがつかないため、見た目を落とさず描画量を半減）
    const NEAR = 34;

    for (let i = arr.length - 1; i >= 0; i--) {
      if (i >= NEAR && (i & 1) === 1) continue;
      const r = arr[i];
      const d = clamp01(r.age / WINDOW_SEC);
      const f = this._persp(d);
      const fn = (f - this._persp(1)) / (1 - this._persp(1)); // 0..1 に正規化

      const baseY = horizonY + (frontY - horizonY) * fn;
      const sx = halfW * (0.30 + 0.70 * fn);              // 奥ほど幅が縮む
      const shear = (1 - fn) * W * 0.055;                 // わずかな横ずれでアイソメトリック感
      // 奥ほど強く消す。遠方の階段状シルエットを目立たせないため。
      const alpha = 0.02 + 0.98 * Math.pow(fn, 1.7);

      // --- 高さのゲイン: ここが「山脈 vs 平原」を分ける肝 ---
      // rms を 0.72 乗で持ち上げ、さらに 32bin を 1.45 乗で尖らせる。
      // 小さく一定の声は amp が小さいまま → ほぼ直線。
      // 大きく変化する声は amp が跳ね上がり、bin ごとの差も強調される → 険しい山。
      const amp = Math.pow(r.rms, 0.72) * (r.voiced ? 1 : 0.30);
      const rowH = maxH * fn * amp * 1.35;

      const col = this._ridgeColor(r.pitch, amp, r.centroid);
      const isFront = i === 0;

      // 稜線ポリライン
      const pts = TMP_PTS;
      for (let b = 0; b < BINS; b++) {
        const u = b / (BINS - 1);
        const x = cx + shear + (u - 0.5) * 2 * sx;
        // 端は必ず 0 に落として山の輪郭を閉じる
        const edge = Math.sin(Math.PI * u);
        const s = Math.pow(clamp01(r.spec[b]), 1.45);
        const y = baseY - rowH * s * edge;
        pts[b * 2] = x;
        pts[b * 2 + 1] = y;
      }

      // 面（奥の稜線を隠して重なりを作る＝立体感の要）
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b * 2], pts[b * 2 + 1]);
      const skirt = baseY + maxH * 0.022 * fn;
      ctx.lineTo(pts[(BINS - 1) * 2], skirt);
      ctx.lineTo(pts[0], skirt);
      ctx.closePath();
      // 面は「奥を隠す」ためのもの。濃くしすぎると色が濁るので背景寄りに保つ。
      const fill = mixRGB(bg, col, 0.13 + 0.17 * clamp01(amp * 1.6));
      ctx.fillStyle = rgba(fill, Math.min(1, alpha * 0.55 + 0.45));
      ctx.fill();

      // 稜線そのもの
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let b = 1; b < BINS; b++) ctx.lineTo(pts[b * 2], pts[b * 2 + 1]);
      ctx.lineWidth = Math.max(0.6, (isFront ? 2.6 : 1.5) * fn);
      ctx.strokeStyle = rgba(col, Math.min(1, alpha * (isFront ? 1 : 0.85)));
      ctx.stroke();

      // 最前列だけグローを重ねて「今」を強調
      if (isFront && amp > 0.05) {
        ctx.lineWidth = Math.max(2, 7 * fn);
        ctx.strokeStyle = rgba(col, 0.16 + 0.22 * clamp01(amp * 2));
        ctx.stroke();
      }
    }
    ctx.restore();

    // --- 手前のフェード（キャンバス下端を背景色に溶かす） ---
    ctx.save();
    const fade = ctx.createLinearGradient(0, H * 0.86, 0, H);
    fade.addColorStop(0, rgba(bg, 0));
    fade.addColorStop(1, rgba(bg, 0.85));
    ctx.fillStyle = fade;
    ctx.fillRect(0, H * 0.86, W, H * 0.14);
    ctx.restore();

    this._drawHUD(ctx, W, H, muted);
  }

  /** データが来る前の待機表示。 */
  _drawIdle(ctx, W, H, horizonY, frontY, muted) {
    ctx.save();
    ctx.strokeStyle = rgba(muted, 0.16);
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const fn = 0.12 + (i / 6) * 0.88;
      const y = horizonY + (frontY - horizonY) * fn;
      const sx = W * 0.46 * (0.30 + 0.70 * fn);
      const shear = (1 - fn) * W * 0.055;
      ctx.beginPath();
      ctx.moveTo(W / 2 + shear - sx, y);
      ctx.lineTo(W / 2 + shear + sx, y);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(muted, 0.7);
    ctx.textAlign = 'center';
    ctx.font = '600 ' + Math.max(10, Math.min(W * 0.028, 15)).toFixed(0) + 'px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
    ctx.fillText('話し始めると、ここに声の地形が現れます', W / 2, horizonY - H * 0.05);
    ctx.restore();
  }

  /** 右下に「起伏の激しさ」インジケータ。山脈/平原の差を数値でも見せる。 */
  _drawHUD(ctx, W, H, muted) {
    if (W < 180 || H < 110) return;
    const accent = parseColor(this.theme['--accent']) || parseColor(FALLBACK['--accent']);
    const warn = parseColor(this.theme['--warn']) || parseColor(FALLBACK['--warn']);
    const d = clamp01(this._drama);
    const col = mixRGB(warn, accent, d);

    const bw = Math.min(120, W * 0.28);
    const bh = 5;
    const x = W - bw - 14;
    const y = H - 18;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '600 10px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
    ctx.fillStyle = rgba(muted, 0.9);
    // 閾値は実測に基づく較正値: 棒読みモード≈0.09 / 熱量モード≈0.49-0.56。
    // どちらも境界から十分離れるよう 0.25 / 0.45 を採用している。
    ctx.fillText(d < 0.25 ? '平原（棒読み寄り）' : d < 0.45 ? '丘陵' : '山脈（熱量あり）', W - 14, y - 7);
    ctx.fillStyle = rgba(muted, 0.25);
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = rgba(col, 1);
    ctx.fillRect(x, y, Math.max(2, bw * d), bh);
    ctx.restore();
  }
}

// 稜線1本ぶんの座標テンポラリ（毎フレームの配列確保を避ける）
const TMP_PTS = new Float32Array(BINS * 2);

export default Terrain;
