/**
 * gauges.js — PitchMirror ライブゲージ
 *
 * 大型 overall リング（太いアーク・アニメーション・数字カウントアップ）と
 * pace / energy / variation / pause の4連コンパクトゲージ。
 *
 * 依存ゼロ / Canvas 2D / ES Module。
 * データ投入は update(score) のみ。描画は自前の requestAnimationFrame ループ。
 *
 * @typedef {Object} Score
 * @property {number} pace
 * @property {number} energy
 * @property {number} variation
 * @property {number} pause
 * @property {number} overall
 */

const FALLBACK = {
  '--accent': '#3ddc97',
  '--warn': '#ff5c5c',
  '--bg': '#0b0e14',
  '--fg': '#e8ecf1',
  '--muted': '#6b7684',
};

const VAR_NAMES = ['--accent', '--warn', '--bg', '--fg', '--muted'];

/** CSS変数を読む。未設定/非ブラウザでもフォールバックで必ず値を返す。 */
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

/** '#rgb' | '#rrggbb' | 'rgb(...)' → {r,g,b}。解釈できなければ null。 */
function parseColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const h = m[1];
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.every((n) => Number.isFinite(n))) {
      return { r: p[0], g: p[1], b: p[2] };
    }
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

function rgba(c, a) {
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function num(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

const TAU = Math.PI * 2;
const KEYS = ['pace', 'energy', 'variation', 'pause'];
const LABELS = { pace: '話速', energy: '熱量', variation: '抑揚', pause: '間' };

export class Gauges {
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

    // 表示値（補間先へ追従）/ 目標値 / ゴースト（遅れて追従する残像）
    /** @type {Score} */
    this.target = { pace: 0, energy: 0, variation: 0, pause: 0, overall: 0 };
    /** @type {Score} */
    this.shown = { pace: 0, energy: 0, variation: 0, pause: 0, overall: 0 };
    /** @type {Score} */
    this.ghost = { pace: 0, energy: 0, variation: 0, pause: 0, overall: 0 };

    this._hasData = false;
    this._t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._last = this._t0;
    this._raf = 0;
    this._running = false;
    this._pulse = 0;      // スコアが大きく動いた時のフラッシュ量 0..1
    this._themeAge = 0;

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

  /** @param {Score} score */
  update(score) {
    if (!score || typeof score !== 'object') return;
    const prevOverall = this.target.overall;
    for (const k of KEYS) {
      this.target[k] = Math.max(0, Math.min(100, num(score[k], this.target[k])));
    }
    this.target.overall = Math.max(0, Math.min(100, num(score.overall, this.target.overall)));
    if (!this._hasData) {
      this._hasData = true;
      // 初回は 0 からスイープさせたいので shown は据え置き（0のまま）
    } else {
      const jump = Math.abs(this.target.overall - prevOverall);
      if (jump > 4) this._pulse = Math.min(1, this._pulse + jump / 30);
    }
  }

  resize() {
    const cv = this.canvas;
    if (!cv) return;
    let dpr = 1;
    try {
      dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    } catch (_) { dpr = 1; }
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
      if (dt > 0.1) dt = 0.1; // タブ復帰時の飛びを抑える
      try {
        this._step(dt);
        this._draw(t);
      } catch (_) { /* 描画で落とさない */ }
    };
    try {
      this._raf = requestAnimationFrame(loop);
    } catch (_) { this._running = false; }
  }

  stop() {
    this._running = false;
    try { if (this._raf) cancelAnimationFrame(this._raf); } catch (_) { /* noop */ }
    this._raf = 0;
  }

  /** リスナ解除つきの完全停止。 */
  destroy() {
    this.stop();
    try {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('resize', this._onResize);
      }
    } catch (_) { /* noop */ }
    try { if (this._ro) this._ro.disconnect(); } catch (_) { /* noop */ }
    this._ro = null;
  }

  _step(dt) {
    // 指数補間。データは約200ms間隔で来るので、それより速く・しかし滑らかに追う。
    const kMain = 1 - Math.pow(0.0025, dt);   // ≈ 時定数 170ms
    const kGhost = 1 - Math.pow(0.20, dt);    // ゴーストはかなり遅れる
    for (const k of ['overall'].concat(KEYS)) {
      this.shown[k] += (this.target[k] - this.shown[k]) * kMain;
      this.ghost[k] += (this.shown[k] - this.ghost[k]) * kGhost;
    }
    this._pulse *= Math.pow(0.06, dt);
    if (this._pulse < 0.001) this._pulse = 0;

    this._themeAge += dt;
    if (this._themeAge > 1.5) { this._themeAge = 0; this.theme = readTheme(); }
  }

  /** score 0..100 → warn→(中間の琥珀)→accent の連続グラデーション。 */
  _scoreColor(v) {
    const accent = parseColor(this.theme['--accent']) || parseColor(FALLBACK['--accent']);
    const warn = parseColor(this.theme['--warn']) || parseColor(FALLBACK['--warn']);
    const mid = { r: 246, g: 190, b: 70 }; // 中域を琥珀に振って変化を目に見えやすくする
    const t = clamp01(v / 100);
    return t < 0.5 ? mixRGB(warn, mid, t / 0.5) : mixRGB(mid, accent, (t - 0.5) / 0.5);
  }

  _draw(now) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.w;
    const H = this.h;
    if (W <= 0 || H <= 0) return; // ゼロサイズでも決して throw しない

    const th = this.theme;
    const fg = th['--fg'];
    const muted = th['--muted'];

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 縦長なら上下、横長なら左右に分割
    const vertical = H >= W * 0.85;
    let ringBox;
    let subBox;
    if (vertical) {
      const ringH = Math.min(H * 0.66, W);
      ringBox = { x: 0, y: 0, w: W, h: ringH };
      subBox = { x: 0, y: ringH, w: W, h: H - ringH };
    } else {
      const ringW = Math.min(H, W * 0.46);
      ringBox = { x: 0, y: 0, w: ringW, h: H };
      subBox = { x: ringW, y: 0, w: W - ringW, h: H };
    }

    this._drawRing(ctx, ringBox, now, fg, muted);
    this._drawSubs(ctx, subBox, vertical, fg, muted);
  }

  _drawRing(ctx, box, now, fg, muted) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const R = Math.max(6, Math.min(box.w, box.h) / 2 - Math.min(box.w, box.h) * 0.09);
    const thick = Math.max(6, R * 0.19);

    const start = -Math.PI * 0.5 - Math.PI * 0.75; // 上を中心に270°のアーク
    const span = Math.PI * 1.5;

    const val = this.shown.overall;
    const col = this._scoreColor(val);
    const ghostCol = this._scoreColor(this.ghost.overall);

    // 背景トラック
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = thick;
    ctx.strokeStyle = rgba(parseColor(muted) || FALLBACK_RGB_MUTED, 0.22);
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, start + span);
    ctx.stroke();

    // 目盛り（20点刻み）
    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.strokeStyle = rgba(parseColor(muted) || FALLBACK_RGB_MUTED, 0.5);
    for (let i = 0; i <= 5; i++) {
      const a = start + span * (i / 5);
      const r0 = R + thick * 0.62;
      const r1 = R + thick * (i % 5 === 0 ? 0.95 : 0.82);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }

    // ゴースト（直前値の残像）— 動きを目で追えるようにする
    const gEnd = start + span * clamp01(this.ghost.overall / 100);
    const vEnd = start + span * clamp01(val / 100);
    if (Math.abs(this.ghost.overall - val) > 0.4) {
      ctx.lineWidth = thick * 0.98;
      ctx.strokeStyle = rgba(ghostCol, 0.28);
      ctx.beginPath();
      ctx.arc(cx, cy, R, Math.min(gEnd, vEnd), Math.max(gEnd, vEnd));
      ctx.stroke();
    }

    // 本体アーク（グロー付き）
    ctx.lineWidth = thick;
    ctx.strokeStyle = rgba(col, 0.30);
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, vEnd);
    ctx.stroke();

    ctx.lineWidth = thick * 0.72;
    ctx.strokeStyle = rgba(col, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, vEnd);
    ctx.stroke();

    // 先端のノブ + 脈動
    const pulse = 1 + this._pulse * 0.7 + Math.sin(now / 420) * 0.05;
    const kx = cx + Math.cos(vEnd) * R;
    const ky = cy + Math.sin(vEnd) * R;
    ctx.fillStyle = rgba(col, 0.20 + this._pulse * 0.5);
    ctx.beginPath();
    ctx.arc(kx, ky, thick * 0.95 * pulse, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(col, 1);
    ctx.beginPath();
    ctx.arc(kx, ky, thick * 0.32, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 中央の数字（カウントアップ）
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const big = Math.max(14, R * 0.78);
    ctx.font = '700 ' + big.toFixed(0) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillStyle = rgba(col, 1);
    const shown = this._hasData ? Math.round(val) : 0;
    ctx.fillText(String(shown), cx, cy + big * 0.34);

    const small = Math.max(8, R * 0.155);
    ctx.font = '600 ' + small.toFixed(0) + 'px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText('OVERALL', cx, cy - big * 0.44);

    // デルタ表示（ゴーストとの差）
    const delta = val - this.ghost.overall;
    if (Math.abs(delta) > 0.8) {
      const dcol = delta > 0 ? this.theme['--accent'] : this.theme['--warn'];
      ctx.font = '600 ' + Math.max(8, R * 0.14).toFixed(0) + 'px ui-monospace, Menlo, monospace';
      ctx.fillStyle = dcol;
      ctx.fillText((delta > 0 ? '▲ +' : '▼ ') + Math.abs(delta).toFixed(1), cx, cy + big * 0.86);
    }
    ctx.restore();
  }

  _drawSubs(ctx, box, vertical, fg, muted) {
    if (box.w <= 4 || box.h <= 4) return;
    const n = KEYS.length;
    const pad = Math.max(4, Math.min(box.w, box.h) * 0.06);

    // 縦長レイアウト → 横4列 / 横長レイアウト → 縦4行
    const cols = vertical ? n : 1;
    const rows = vertical ? 1 : n;
    const cw = (box.w - pad * 2) / cols;
    const ch = (box.h - pad * 2) / rows;

    for (let i = 0; i < n; i++) {
      const k = KEYS[i];
      const cx0 = box.x + pad + (vertical ? cw * i : 0);
      const cy0 = box.y + pad + (vertical ? 0 : ch * i);
      this._drawSub(ctx, k, cx0, cy0, cw, ch, vertical, fg, muted);
    }
  }

  _drawSub(ctx, key, x, y, w, h, vertical, fg, muted) {
    const val = this.shown[key];
    const gv = this.ghost[key];
    const col = this._scoreColor(val);
    const gcol = this._scoreColor(gv);
    const mcol = parseColor(muted) || FALLBACK_RGB_MUTED;

    const inner = Math.max(2, Math.min(w, h) * 0.07);
    const bx = x + inner;
    const by = y + inner;
    const bw = Math.max(1, w - inner * 2);
    const bh = Math.max(1, h - inner * 2);

    ctx.save();
    if (vertical) {
      // 縦長: 小さな半円メーター + 値
      const label = Math.max(8, Math.min(bw * 0.20, 13));
      const numSize = Math.max(11, Math.min(bw * 0.34, bh * 0.42));
      const cx = bx + bw / 2;
      const cy = by + bh * 0.70;
      const r = Math.max(4, Math.min(bw * 0.42, bh * 0.46));
      const lw = Math.max(3, r * 0.28);
      const s = Math.PI;
      const sp = Math.PI;

      ctx.lineCap = 'round';
      ctx.lineWidth = lw;
      ctx.strokeStyle = rgba(mcol, 0.22);
      ctx.beginPath();
      ctx.arc(cx, cy, r, s, s + sp);
      ctx.stroke();

      if (Math.abs(gv - val) > 0.5) {
        const a1 = s + sp * clamp01(gv / 100);
        const a2 = s + sp * clamp01(val / 100);
        ctx.strokeStyle = rgba(gcol, 0.3);
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.min(a1, a2), Math.max(a1, a2));
        ctx.stroke();
      }

      ctx.strokeStyle = rgba(col, 1);
      ctx.beginPath();
      ctx.arc(cx, cy, r, s, s + sp * clamp01(val / 100));
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = '600 ' + label.toFixed(0) + 'px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
      ctx.fillStyle = muted;
      ctx.fillText(LABELS[key], cx, by + label);

      ctx.font = '700 ' + numSize.toFixed(0) + 'px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = rgba(col, 1);
      ctx.fillText(String(Math.round(val)), cx, cy - r * 0.06);
    } else {
      // 横長: ラベル + 横バー + 値
      const fs = Math.max(9, Math.min(bh * 0.42, 14));
      const labelW = Math.max(28, Math.min(bw * 0.24, fs * 3.4));
      const numW = Math.max(24, fs * 2.4);
      const barX = bx + labelW;
      const barW = Math.max(2, bw - labelW - numW);
      const barH = Math.max(4, Math.min(bh * 0.34, 14));
      const barY = by + (bh - barH) / 2;
      const rr = barH / 2;

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = '600 ' + fs.toFixed(0) + 'px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
      ctx.fillStyle = muted;
      ctx.fillText(LABELS[key], bx, by + bh / 2);

      roundRect(ctx, barX, barY, barW, barH, rr);
      ctx.fillStyle = rgba(mcol, 0.20);
      ctx.fill();

      if (Math.abs(gv - val) > 0.5) {
        const w1 = barW * clamp01(gv / 100);
        const w2 = barW * clamp01(val / 100);
        roundRect(ctx, barX + Math.min(w1, w2), barY, Math.max(1, Math.abs(w2 - w1)), barH, rr * 0.5);
        ctx.fillStyle = rgba(gcol, 0.32);
        ctx.fill();
      }

      const fw = barW * clamp01(val / 100);
      if (fw > 0.5) {
        roundRect(ctx, barX, barY, fw, barH, rr);
        ctx.fillStyle = rgba(col, 1);
        ctx.fill();
      }

      ctx.textAlign = 'right';
      ctx.font = '700 ' + fs.toFixed(0) + 'px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = rgba(col, 1);
      ctx.fillText(String(Math.round(val)), bx + bw, by + bh / 2);
    }
    ctx.restore();
  }
}

const FALLBACK_RGB_MUTED = { r: 107, g: 118, b: 132 };

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export default Gauges;
