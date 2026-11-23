"use strict";
/*
 * GET /api/push/cron/ — 外部の cron サービスから 5 分ごとに呼ぶ。
 *   Authorization: Bearer <CRON_SECRET> が一致しないときは何もしない。
 *   登録されている端末ごとに、雨の降り出し・強まりと、警報・注意報の新たな発表を調べて通知する。
 *   同じ雨は 1 時間は再通知せず、警報は前回から新しく加わったものだけを知らせる。
 */
const crypto = require("node:crypto");
const { storeFromEnv } = require("../_lib/store.js");
const { vapidFromEnv, sendPush } = require("../_lib/webpush.js");
const { KEY } = require("../_lib/subs.js");
const W = require("../_lib/weather.js");

const RAIN_REPEAT_MS = 60 * 60 * 1000;
const BUDGET_MS = 20000;     // cron サービスの待ち時間（30 秒）より前に終える

function authorized(req, secret) {
  if (!secret) return false;
  const got = Buffer.from(String((req.headers && req.headers.authorization) || ""));
  const want = Buffer.from("Bearer " + secret);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** 同時に走らせる数を絞って順に処理する */
async function eachLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

async function run(deps) {
  const t0 = Date.now(), now = deps.now ? deps.now() : t0;
  const store = deps.store, vapid = deps.vapid;
  const ids = (await store.cmd("SMEMBERS", KEY.set)) || [];
  if (!ids.length) return { subs: 0, sent: 0, removed: 0 };
  const raw = await store.pipeline(ids.flatMap(id => [["GET", KEY.sub(id)], ["GET", KEY.state(id)]]));
  const subs = [], orphans = [];
  ids.forEach((id, k) => {
    try {
      const rec = JSON.parse(raw[k * 2]);
      if (rec && rec.sub) subs.push({ id, rec, st: JSON.parse(raw[k * 2 + 1] || "{}") || {} });
      else orphans.push(["SREM", KEY.set, id]);    // 本体が消えた ID は一覧からも外す
    } catch (e) { /* 壊れたデータは飛ばす */ }
  });
  if (orphans.length) await store.pipeline(orphans);

  const ctx = { f: W.makeFetcher(deps.fetch), now };
  // 雨: 同じ座標はまとめて 1 回だけ調べる
  const points = new Map();
  subs.forEach(s => { if (s.rec.rain && s.rec.rain.on) points.set(s.rec.rain.lat + "," + s.rec.rain.lon, null); });
  await eachLimit(Array.from(points.keys()), 4, async key => {
    if (Date.now() - t0 > BUDGET_MS) return;
    const [lat, lon] = key.split(",").map(Number);
    points.set(key, await W.rainSeries(lat, lon, ctx));
  });
  // 警報: 府県ごとに 1 回だけ取りに行く
  const prefs = new Map();
  subs.forEach(s => { if (s.rec.warn && s.rec.warn.on) s.rec.warn.places.forEach(p => prefs.set(p.jma, null)); });
  await eachLimit(Array.from(prefs.keys()), 4, async code => {
    if (Date.now() - t0 > BUDGET_MS) return;
    try { prefs.set(code, await W.prefWarnings(code, ctx.f)); } catch (e) { /* 取れなかった府県は前回の記録を保つ */ }
  });

  let sent = 0, removed = 0;
  const writes = [];
  await eachLimit(subs, 6, async s => {
    const { rec, st } = s;
    const out = [];
    let changed = false;
    if (rec.rain && rec.rain.on) {
      const series = points.get(rec.rain.lat + "," + rec.rain.lon);
      const ev = W.rainEvent(series);
      const last = st.rain;
      if (ev && !(last && last.kind === ev.kind && now - last.at < RAIN_REPEAT_MS)) {
        out.push({ msg: W.rainMessage(rec.rain.name, ev, series.source), topic: "rain" });
        st.rain = { kind: ev.kind, at: now };
        changed = true;
      }
    }
    if (rec.warn && rec.warn.on) {
      const before = JSON.stringify(st.warn || {});
      const seen = st.warn && typeof st.warn === "object" ? Object.assign({}, st.warn) : {};
      const current = {};
      rec.warn.places.forEach(p => {
        const byArea = prefs.get(p.jma);
        if (byArea) current[p.id] = { name: p.name, list: W.warningsForPlace(byArea, p.area) };
      });
      const fresh = W.diffWarnings(seen, current);
      Object.keys(current).forEach(id => { seen[id] = current[id].list; });
      Object.keys(seen).forEach(id => { if (!rec.warn.places.some(p => p.id === id)) delete seen[id]; });
      if (JSON.stringify(seen) !== before) { st.warn = seen; changed = true; }
      if (fresh.length) out.push({ msg: W.warnMessage(fresh), topic: "warn" });
    }
    for (const n of out) {
      try {
        const r = await sendPush(rec.sub, n.msg, vapid, { fetch: deps.fetch, topic: n.topic });
        if (r.gone) { removed++; writes.push(["DEL", KEY.sub(s.id)], ["DEL", KEY.state(s.id)], ["SREM", KEY.set, s.id]); return; }
        if (r.status >= 200 && r.status < 300) sent++;
      } catch (e) { /* 送れなかった分は次の回に任せない（重複を避ける） */ }
    }
    if (changed) writes.push(["SET", KEY.state(s.id), JSON.stringify(st), "EX", String(30 * 86400)]);
  });
  if (writes.length) await store.pipeline(writes);
  return { subs: subs.length, sent, removed, ms: Date.now() - t0 };
}

function createHandler(deps) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!authorized(req, deps.secret())) return res.status(401).json({ error: "unauthorized" });
    const store = deps.store(), vapid = deps.vapid();
    if (!store || !vapid) return res.status(503).json({ error: "not_configured" });
    try {
      res.status(200).json(Object.assign({ ok: true }, await run({ store, vapid, fetch: deps.fetch, now: deps.now })));
    } catch (e) {
      res.status(500).json({ error: "failed" });
    }
  };
}

module.exports = createHandler({
  secret: () => process.env.CRON_SECRET,
  store: () => storeFromEnv(),
  vapid: () => vapidFromEnv(),
  fetch: (url, opts) => fetch(url, opts)
});
module.exports.createHandler = createHandler;
module.exports.run = run;
