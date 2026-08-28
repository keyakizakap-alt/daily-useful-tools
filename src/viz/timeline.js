/**
 * timeline.js — 発話 / 無音の帯（右→左スクロール）
 *
 *  - 発話区間は accent 系、無音は muted の薄い帯
 *  - 0.35 秒以上の無音は「間（ま）」ブロックとして明示（長すぎる間は warn 色）
 *  - フィラー語が検出された位置に小さなマーカー
 *  - 右端に「now」プレイヘッド、背景に1秒ごとのグリッド線
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
 *
 * @typedef {Object} Metrics
 * @property {number} elapsed
 * @property {number} syllableRate
 * @property {number} speakingRatio
 * @property {number} longestPause
 * @property {number} pauseCount
 * @property {number} fillerCount
 * @property {string[]} coachTips
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

const WINDOW_SEC = 18;      // 画面に映る秒数
const PAUSE_MIN = 0.35;     // 契約上の「間」の閾値
const PAUSE_LONG = 1.2;     // これ以上は「詰まり」として warn 表示
const MAX_SAMPLES = 2400;   // 性能ガード（約90秒ぶん @40ms）
const MAX_MARKERS = 200;

export class Timeline {
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

    /** @type {{t:number, voiced:boolean, rms:number}[]} 時刻昇順 */
    this.samples = [];
    /** @type {{t:number, born:number}[]} フィラーマーカー */
    this.markers = [];

    this.latestT = 0;      // 直近フレームの t
    this.viewT = 0;        // 画面上の「now」（補間で滑らかに追従）
    this._hasData = false;
    this._fillerCount = 0;
    this._metrics = null;

    this._running = false;
    this._raf = 0;
    this._last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
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

  /**
   * @param {Frame} frame
   * @param {Metrics} [metrics]
   */
  push(frame, metrics) {
    if (frame && typeof frame === 'object') {
      const t = Number.isFinite(frame.t) ? frame.t : this.latestT;
      const rms = clamp01(Number.isFinite(frame.rms) ? frame.rms : 0);
      const s = this.samples;
      // 逆行した時刻（再計測など）は履歴をリセットして扱う
      if (s.length && t < s[s.length - 1].t - 0.5) this.clear();
      s.push({ t, voiced: !!frame.voiced, rms });
      if (t > this.latestT) this.latestT = t;
      if (!this._hasData) { this._hasData = true; this.viewT = t; }
      this._trim();
    }

    if (metrics && typeof metrics === 'object') {
      this._metrics = metrics;
      const fc = Number.isFinite(metrics.fillerCount) ? metrics.fillerCount : 0;
      if (fc > this._fillerCount) {
        const add = Math.min(fc - this._fillerCount, 8);
        for (let i = 0; i < add; i++) {
          this.markers.push({ t: this.latestT - i * 0.12, born: 0 });
        }
        while (this.markers.length > MAX_MARKERS) this.markers.shift();
      }
      // カウンタが戻った（リセットされた）場合も追随する
      this._fillerCount = fc;
    }
  }

  _trim() {
    const s = this.samples;
    const cutoff = this.latestT - WINDOW_SEC * 1.6;
    let drop = 0;
    while (drop < s.length && s[drop].t < cutoff) drop++;
    if (drop > 0) s.splice(0, drop);
    if (s.length > MAX_SAMPLES) s.splice(0, s.length - MAX_SAMPLES);

    const m = this.markers;
    let md = 0;
    while (md < m.length && m[md].t < cutoff) md++;
    if (md > 0) m.splice(0, md);
  }

  clear() {
    this.samples.length = 0;
    this.markers.length = 0;
    this.latestT = 0;
    this.viewT = 0;
    this._hasData = false;
    this._fillerCount = 0;
    this._metrics = null;
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
    this.samples.length = 0;
    this.markers.length = 0;
  }

  _step(dt) {
    if (this._hasData) {
      // フレームは約40ms間隔。等速で進めつつ、遅れ/進みは緩やかに吸収する。
      this.viewT += dt;
      const err = this.latestT - this.viewT;
      this.viewT += err * (1 - Math.pow(0.02, dt));
      if (Math.abs(err) > 1.5) this.viewT = this.latestT; // 大きくズレたら即同期
    }
    for (let i = 0; i < this.markers.length; i++) {
      if (this.markers[i].born < 1) this.markers[i].born = Math.min(1, this.markers[i].born + dt * 3);
    }
    this._themeAge += dt;
    if (this._themeAge > 1.5) { this._themeAge = 0; this.theme = readTheme(); }
  }

  _draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.w;
    const H = this.h;
    if (W <= 0 || H <= 0) return;

    const th = this.theme;
    const bg = parseColor(th['--bg']) || parseColor(FALLBACK['--bg']);
    const fg = parseColor(th['--fg']) || parseColor(FALLBACK['--fg']);
    const muted = parseColor(th['--muted']) || parseColor(FALLBACK['--muted']);
    const accent = parseColor(th['--accent']) || parseColor(FALLBACK['--accent']);
    const warn = parseColor(th['--warn']) || parseColor(FALLBACK['--warn']);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const padT = Math.max(12, H * 0.16);
    const padB = Math.max(12, H * 0.20);
    const bandY = padT;
    const bandH = Math.max(6, H - padT - padB);
    const bandY2 = bandY + bandH;

    const now = this._hasData ? this.viewT : 0;
    const t0 = now - WINDOW_SEC;
    const pxPerSec = W / WINDOW_SEC;
    const xOf = (t) => (t - t0) * pxPerSec;

    // --- 背景トラック ---
    ctx.save();
    ctx.fillStyle = rgba(muted, 0.10);
    ctx.fillRect(0, bandY, W, bandH);

    // --- 1秒グリッド ---
    ctx.lineWidth = 1;
    const firstTick = Math.ceil(t0);
    for (let s = firstTick; s <= now + 0.001; s++) {
      if (s < 0) continue;
      const x = Math.round(xOf(s)) + 0.5;
      if (x < 0 || x > W) continue;
      const major = s % 5 === 0;
      ctx.strokeStyle = rgba(muted, major ? 0.34 : 0.14);
      ctx.beginPath();
      ctx.moveTo(x, bandY - (major ? 5 : 2));
      ctx.lineTo(x, bandY2 + (major ? 5 : 2));
      ctx.stroke();
      if (major && bandH > 14) {
        ctx.fillStyle = rgba(muted, 0.75);
        ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s + 's', x, bandY2 + 16);
      }
    }
    ctx.restore();

    if (!this._hasData || this.samples.length === 0) {
      ctx.save();
      ctx.fillStyle = rgba(muted, 0.8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 12px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
      ctx.fillText('待機中 — 発話と沈黙がここに流れます', W / 2, bandY + bandH / 2);
      ctx.restore();
      return;
    }

    // --- 発話 / 無音の連続区間を組み立てる ---
    const segs = this._segments(t0 - 1, now);

    ctx.save();
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      const x1 = Math.max(0, xOf(sg.a));
      const x2 = Math.min(W, xOf(sg.b));
      const w = x2 - x1;
      if (w <= 0) continue;
      const dur = sg.b - sg.a;

      if (sg.voiced) {
        // 発話: 音量で高さが変わるブロック
        const lvl = clamp01(sg.rms / 0.45);
        const hh = bandH * (0.36 + 0.64 * lvl);
        const y = bandY2 - hh;
        const g = ctx.createLinearGradient(0, y, 0, bandY2);
        g.addColorStop(0, rgba(accent, 0.95));
        g.addColorStop(1, rgba(accent, 0.42));
        ctx.fillStyle = g;
        ctx.fillRect(x1, y, Math.max(1, w), hh);
      } else if (dur >= PAUSE_MIN) {
        // 「間」ブロック
        const isLong = dur >= PAUSE_LONG;
        const c = isLong ? warn : mixRGB(muted, accent, 0.35);
        ctx.fillStyle = rgba(c, isLong ? 0.26 : 0.18);
        ctx.fillRect(x1, bandY, Math.max(1, w), bandH);

        ctx.strokeStyle = rgba(c, isLong ? 0.85 : 0.55);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(x1) + 0.5, bandY);
        ctx.lineTo(Math.round(x1) + 0.5, bandY2);
        ctx.moveTo(Math.round(x2) - 0.5, bandY);
        ctx.lineTo(Math.round(x2) - 0.5, bandY2);
        ctx.stroke();
        ctx.setLineDash([]);

        if (w > 26 && bandH > 16) {
          ctx.fillStyle = rgba(c, 0.95);
          ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dur.toFixed(1) + 's', (x1 + x2) / 2, bandY + bandH / 2);
        }
      } else {
        // 短い無音（息継ぎ程度）
        ctx.fillStyle = rgba(muted, 0.16);
        ctx.fillRect(x1, bandY2 - bandH * 0.16, Math.max(1, w), bandH * 0.16);
      }
    }
    ctx.restore();

    // --- 帯の基線 ---
    ctx.save();
    ctx.strokeStyle = rgba(muted, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(bandY2) + 0.5);
    ctx.lineTo(W, Math.round(bandY2) + 0.5);
    ctx.stroke();
    ctx.restore();

    // --- フィラーマーカー ---
    ctx.save();
    for (let i = 0; i < this.markers.length; i++) {
      const mk = this.markers[i];
      const x = xOf(mk.t);
      if (x < -8 || x > W + 8) continue;
      const pop = mk.born;
      const r = 3.2 + (1 - pop) * 4;
      const y = bandY - 5;
      ctx.fillStyle = rgba(warn, 0.35 + 0.55 * pop);
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.lineTo(x - r, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(warn, 0.30 * pop);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, bandY);
      ctx.lineTo(Math.round(x) + 0.5, bandY2);
      ctx.stroke();
    }
    ctx.restore();

    // --- now プレイヘッド（右端に固定） ---
    const px = Math.round(xOf(now)) + 0.5;
    ctx.save();
    const ph = ctx.createLinearGradient(px - 40, 0, px, 0);
    ph.addColorStop(0, rgba(fg, 0));
    ph.addColorStop(1, rgba(fg, 0.16));
    ctx.fillStyle = ph;
    ctx.fillRect(px - 40, bandY, 40, bandH);

    ctx.strokeStyle = rgba(fg, 0.9);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, bandY - 6);
    ctx.lineTo(px, bandY2 + 6);
    ctx.stroke();

    ctx.fillStyle = rgba(fg, 0.95);
    ctx.beginPath();
    ctx.moveTo(px, bandY - 2);
    ctx.lineTo(px - 4.5, bandY - 8);
    ctx.lineTo(px + 4.5, bandY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    this._drawLegend(ctx, W, H, bandY, muted, accent, warn);
  }

  /** samples から [from, to] の連続区間（発話/無音）を作る。 */
  _segments(from, to) {
    const s = this.samples;
    const out = [];
    if (!s.length) return out;
    let cur = null;
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      if (p.t < from) continue;
      if (!cur || cur.voiced !== p.voiced) {
        if (cur) { cur.b = p.t; out.push(cur); }
        cur = { a: p.t, b: p.t, voiced: p.voiced, rms: p.rms, n: 1 };
      } else {
        cur.b = p.t;
        cur.rms = (cur.rms * cur.n + p.rms) / (cur.n + 1);
        cur.n++;
      }
    }
    if (cur) { cur.b = Math.max(cur.b, to); out.push(cur); }
    return out;
  }

  _drawLegend(ctx, W, H, bandY, muted, accent, warn) {
    if (bandY < 13 || W < 240) return;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
    let x = 4;
    const y = bandY / 2;
    const item = (col, label) => {
      ctx.fillStyle = rgba(col, 0.9);
      ctx.fillRect(x, y - 3.5, 7, 7);
      x += 11;
      ctx.fillStyle = rgba(muted, 0.95);
      ctx.textAlign = 'left';
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 12;
    };
    item(accent, '発話');
    item(muted, '間');
    item(warn, 'フィラー');

    const m = this._metrics;
    if (m && W > 380) {
      const ratio = Number.isFinite(m.speakingRatio) ? Math.round(m.speakingRatio * 100) : null;
      const bits = [];
      if (ratio !== null) bits.push('発話率 ' + ratio + '%');
      if (Number.isFinite(m.pauseCount)) bits.push('間 ' + m.pauseCount + '回');
      if (Number.isFinite(m.longestPause)) bits.push('最長 ' + m.longestPause.toFixed(1) + 's');
      if (bits.length) {
        ctx.textAlign = 'right';
        ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillStyle = rgba(muted, 0.95);
        ctx.fillText(bits.join('  ·  '), W - 4, y);
      }
    }
    ctx.restore();
  }
}

export default Timeline;
