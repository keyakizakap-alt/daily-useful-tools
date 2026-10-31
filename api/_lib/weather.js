"use strict";
/*
 * サーバー側の天気判定。アプリ（weather/app.js）の雨雲レーダー・警報の判定と同じ考え方で、
 *   - 雨: 気象庁 高解像度降水ナウキャストのタイル（z=8）を読み、地点のまわり 5×5px の最大の強さを 5 分刻みで 1 時間先まで並べる
 *         ナウキャストを取れないときは Open-Meteo の 1 時間値で代用する
 *   - 警報: 気象庁の防災情報 JSON から、地点の一次細分区域（無ければ府県全体）で発表中の警報・注意報を取り出す
 * いずれも気象庁が公式に API として提供しているものではないため、失敗しても例外で止めずに null を返す。
 */
const zlib = require("node:zlib");

const NOWC_BASE = "https://www.jma.go.jp/bosai/jmatile/data/nowc/";
const JMA_WARNING_URL = "https://www.jma.go.jp/bosai/warning/data/warning/";
const JMA_AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json";
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const SAMPLE_ZOOM = 8, TILE = 256;
const JMA_TIME_RE = /^\d{14}$|^\d{8}T\d{6}$/;

/** 雨の強さの区分（app.js の RAIN_LEVELS と同じ色） */
const RAIN_RGB = [null, [242, 242, 255], [160, 210, 255], [33, 140, 255], [0, 65, 255],
  [250, 245, 0], [255, 153, 0], [255, 40, 0], [180, 0, 104]];

const JMA_WARNING_NAMES = {
  "02": "暴風雪警報", "03": "大雨警報", "04": "洪水警報", "05": "暴風警報",
  "06": "大雪警報", "07": "波浪警報", "08": "高潮警報",
  "10": "大雨注意報", "12": "大雪注意報", "13": "風雪注意報", "14": "雷注意報",
  "15": "強風注意報", "16": "波浪注意報", "17": "融雪注意報", "18": "洪水注意報",
  "19": "高潮注意報", "20": "濃霧注意報", "21": "乾燥注意報", "22": "なだれ注意報",
  "23": "低温注意報", "24": "霜注意報", "25": "着氷注意報", "26": "着雪注意報",
  "27": "その他の注意報",
  "32": "暴風雪特別警報", "33": "大雨特別警報", "35": "暴風特別警報",
  "36": "大雪特別警報", "37": "波浪特別警報", "38": "高潮特別警報"
};
function warningSeverity(name) {
  if (!name) return 0;
  if (name.indexOf("特別警報") >= 0) return 3;
  if (name.indexOf("警報") >= 0) return 2;
  if (name.indexOf("注意報") >= 0) return 1;
  return 0;
}

/* ---------------- PNG の読み取り（パレット / グレー / RGB / RGBA、8bit 以下） ---------------- */
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), tag = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (tag === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (tag === "PLTE") palette = data;
    else if (tag === "tRNS") trns = data;
    else if (tag === "IDAT") idat.push(data);
    else if (tag === "IEND") break;
    pos += 12 + len;
  }
  if (interlace) throw new Error("interlaced png is not supported");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels || depth > 8) throw new Error("unsupported png");
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil(width * channels * depth / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
    prev = out;
  }
  const maxV = (1 << depth) - 1;
  /** (x, y) の RGBA */
  function rgba(x, y) {
    const row = y * stride;
    const sample = k => {   // k 番目のサンプル値（8bit 未満も扱う）
      if (depth === 8) return px[row + k];
      const bit = k * depth, byte = px[row + (bit >> 3)];
      return (byte >> (8 - depth - (bit & 7))) & maxV;
    };
    const k = x * channels;
    if (type === 3) {
      const i = sample(k);
      if (!palette || i * 3 + 2 >= palette.length) return [0, 0, 0, 0];
      return [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2], trns && i < trns.length ? trns[i] : 255];
    }
    const s = n => depth === 8 ? sample(k + n) : Math.round(sample(k + n) * 255 / maxV);
    if (type === 0) { const g = s(0); return [g, g, g, 255]; }
    if (type === 4) { const g = s(0); return [g, g, g, s(1)]; }
    if (type === 2) return [s(0), s(1), s(2), 255];
    return [s(0), s(1), s(2), s(3)];
  }
  return { width, height, rgba };
}

function nearestLevel(r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 1; i < RAIN_RGB.length; i++) {
    const c = RAIN_RGB[i];
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** 地点のまわり 5×5px でいちばん強い雨の区分（0〜8） */
function levelInPng(png, ix, iy) {
  const sx = TILE / png.width, sy = TILE / png.height;   // 寸法が違うタイルにも合わせる
  const x0 = Math.max(0, Math.min(TILE - 5, ix - 2)), y0 = Math.max(0, Math.min(TILE - 5, iy - 2));
  let level = 0;
  for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) {
    const p = png.rgba(Math.min(png.width - 1, Math.floor(x / sx)), Math.min(png.height - 1, Math.floor(y / sy)));
    if (p[3] < 40) continue;
    level = Math.max(level, nearestLevel(p[0], p[1], p[2]));
  }
  return level;
}

const lon2px = (lon, z) => (lon + 180) / 360 * TILE * 2 ** z;
const lat2px = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * TILE * 2 ** z; };

function parseJmaTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})$/.exec(String(s));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

/** 1回の実行の中で、同じ URL は 1 度だけ取りに行く */
function makeFetcher(doFetch) {
  const memo = new Map();
  const get = (url, kind) => {
    const key = kind + " " + url;
    if (!memo.has(key)) {
      memo.set(key, (async () => {
        const res = await doFetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "soranarabe-push" } });
        if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
        return kind === "json" ? res.json() : Buffer.from(await res.arrayBuffer());
      })());
      memo.get(key).catch(() => {});
    }
    return memo.get(key);
  };
  return { json: url => get(url, "json"), bytes: url => get(url, "bytes") };
}

/** 実況の最新時刻と、同じ基準時刻の予測（1時間先まで） */
async function nowcastTimes(f) {
  const grab = async file => {
    try {
      const arr = await f.json(NOWC_BASE + file);
      return (Array.isArray(arr) ? arr : []).filter(e => e && JMA_TIME_RE.test(String(e.basetime)) && JMA_TIME_RE.test(String(e.validtime)))
        .map(e => ({ basetime: String(e.basetime), validtime: String(e.validtime) }));
    } catch (e) { return []; }
  };
  const [obs, fc] = await Promise.all([grab("targetTimes_N1.json"), grab("targetTimes_N2.json")]);
  if (!obs.length) return null;
  const byTime = (a, b) => a.validtime < b.validtime ? -1 : a.validtime > b.validtime ? 1 : 0;
  obs.sort(byTime);
  const last = obs[obs.length - 1];
  const after = fc.filter(t => t.validtime > last.validtime).sort(byTime);
  const issued = after.length ? after[0].basetime : null;
  return [last].concat(after.filter(t => t.basetime === issued).slice(0, 12));
}

async function nowcastSeries(lat, lon, times, f) {
  const z = SAMPLE_ZOOM, px = lon2px(lon, z), py = lat2px(lat, z);
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const ix = Math.floor(px - tx * TILE), iy = Math.floor(py - ty * TILE);
  const base = parseJmaTime(times[0].validtime);
  const points = await Promise.all(times.map(async t => {
    const url = NOWC_BASE + t.basetime + "/none/" + t.validtime + "/surf/hrpns/" + z + "/" + tx + "/" + ty + ".png";
    return { min: Math.round((parseJmaTime(t.validtime) - base) / 60000), level: levelInPng(decodePng(await f.bytes(url)), ix, iy) };
  }));
  return { source: "nowcast", at: base.getTime(), points };
}

function levelFromMm(mm) {
  if (typeof mm !== "number" || mm <= 0) return 0;
  return mm < 1 ? 1 : mm < 5 ? 2 : mm < 10 ? 3 : mm < 20 ? 4 : mm < 30 ? 5 : mm < 50 ? 6 : mm < 80 ? 7 : 8;
}

/** ナウキャストを使えないときの代わり（Open-Meteo の 1 時間値。app.js の modelSeries と同じ扱い） */
async function modelSeries(lat, lon, f, now) {
  const url = OPEN_METEO + "?latitude=" + lat.toFixed(2) + "&longitude=" + lon.toFixed(2)
    + "&hourly=precipitation&forecast_hours=4&timezone=UTC&timeformat=unixtime";
  const j = await f.json(url);
  const t = j && j.hourly && j.hourly.time, p = j && j.hourly && j.hourly.precipitation;
  if (!Array.isArray(t) || !Array.isArray(p)) return null;
  const i = t.findIndex(s => s * 1000 > now);
  if (i < 0) return null;
  const a = levelFromMm(p[i]), b = levelFromMm(p[i + 1]);
  return { source: "model", at: now, points: [{ min: 0, level: a }, { min: 10, level: a }, { min: 30, level: a }, { min: 60, level: b }] };
}

/** 地点の 1 時間先までの雨（ナウキャスト → だめなら数値予報） */
async function rainSeries(lat, lon, ctx) {
  try {
    if (ctx.times === undefined) ctx.times = await nowcastTimes(ctx.f);
    if (ctx.times) return await nowcastSeries(lat, lon, ctx.times, ctx.f);
  } catch (e) { /* 下で代わりを使う */ }
  try { return await modelSeries(lat, lon, ctx.f, ctx.now); } catch (e) { return null; }
}

/** 降り出し・強まりだけを取り出す（app.js の makeHeadline と同じ条件） */
function rainEvent(series) {
  if (!series || !series.points || !series.points.length) return null;
  const p = series.points, cur = p[0].level;
  const later = fn => p.find((x, i) => i > 0 && fn(x));
  const hit = cur === 0 ? later(x => x.level >= 2) : later(x => x.level > cur && x.level >= 3);
  if (!hit) return null;
  return { kind: cur === 0 ? "start" : "up", min: hit.min, strong: hit.level >= 5 };
}

function rainMessage(placeName, ev, source) {
  const verb = ev.kind === "start" ? "降り出し" : "強まり";
  const title = placeName + "：" + (source === "nowcast"
    ? ev.min + "分後に雨が" + verb + "ます"
    : "1時間以内に雨が" + (ev.kind === "start" ? "降り出す" : "強まる") + "見込みです");
  const body = (ev.strong ? "強い雨のおそれ。外出の際は雨具をご準備ください。" : "外出の際は、雨具をご準備ください。")
    + (source === "nowcast" ? "" : "（数値予報による目安）");
  return { title, body, tag: "soranarabe-rain", hash: "#radar" };
}

/* ---------------- 警報・注意報 ---------------- */
let areaNames = null, areaNamesAt = 0;
async function loadAreaNames(f) {
  if (areaNames && Date.now() - areaNamesAt < 24 * 3600e3) return areaNames;
  const json = await f.json(JMA_AREA_URL);
  const map = {};
  ["centers", "offices", "class10s", "class15s", "class20s"].forEach(k => {
    const g = json && json[k];
    if (g) Object.keys(g).forEach(code => { if (g[code] && g[code].name) map[code] = g[code].name; });
  });
  areaNames = map; areaNamesAt = Date.now();
  return map;
}

/** 府県予報区コード → { 区域名: [警報名...] } */
async function prefWarnings(code, f) {
  const names = await loadAreaNames(f).catch(() => ({}));
  const json = await f.json(JMA_WARNING_URL + code + ".json");
  const byArea = {};
  (json.areaTypes || []).forEach(type => (type.areas || []).forEach(area => (area.warnings || []).forEach(w => {
    if (w.status && (w.status.indexOf("解除") >= 0 || w.status.indexOf("なし") >= 0)) return;
    const name = JMA_WARNING_NAMES[w.code];
    if (!name) return;
    const key = names[area.code] || area.code;
    (byArea[key] = byArea[key] || []);
    if (byArea[key].indexOf(name) < 0) byArea[key].push(name);
  })));
  return byArea;
}

/** 地点で発表中の警報名（区域名が一致すればその区域、無ければ府県全体） */
function warningsForPlace(byArea, area) {
  const pick = area && byArea[area] ? [byArea[area]] : Object.values(byArea);
  const out = [];
  pick.forEach(list => list.forEach(n => { if (out.indexOf(n) < 0) out.push(n); }));
  return out;
}

/** 前回から新しく加わった警報（初めて見る地点は基準として記録するだけ） */
function diffWarnings(seen, current) {
  const fresh = [];
  Object.keys(current).forEach(id => {
    const prev = seen[id];
    if (!Array.isArray(prev)) return;
    const added = current[id].list.filter(n => prev.indexOf(n) < 0).sort((x, y) => warningSeverity(y) - warningSeverity(x));
    if (added.length) fresh.push({ name: current[id].name, added });
  });
  return fresh;
}

function warnMessage(fresh) {
  if (fresh.length === 1) {
    return { title: fresh[0].name + "：" + fresh[0].added.join("・") + "が発表されました",
             body: "気象庁の発表です。最新の情報を確認してください。", tag: "soranarabe-warn", hash: "#news" };
  }
  const top = Math.max.apply(null, fresh.map(x => warningSeverity(x.added[0])));
  return {
    title: fresh.length + "地点で" + (top >= 2 ? "警報" : "注意報") + "が発表されました",
    body: fresh.slice(0, 4).map(x => x.name + "：" + x.added.join("・")).join("\n") + (fresh.length > 4 ? "\nほか" + (fresh.length - 4) + "地点" : ""),
    tag: "soranarabe-warn", hash: "#news"
  };
}

module.exports = {
  decodePng, levelInPng, nearestLevel, makeFetcher, nowcastTimes, rainSeries, rainEvent, rainMessage,
  prefWarnings, warningsForPlace, diffWarnings, warnMessage, warningSeverity, parseJmaTime
};
