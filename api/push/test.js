"use strict";
/*
 * POST /api/push/test/ — 登録済みの端末に、サーバーからテスト通知を 1 件送る（本文: { endpoint }）。
 *   アプリを閉じた状態で届くかを確かめるためのもの。同じ端末へは 1 分に 1 回まで。
 */
const { storeFromEnv } = require("../_lib/store.js");
const { vapidFromEnv, sendPush } = require("../_lib/webpush.js");
const { KEY, subId, readBody, sameOrigin } = require("../_lib/subs.js");

function createHandler(deps) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method" }); }
    if (!sameOrigin(req)) return res.status(403).json({ error: "origin" });
    const store = deps.store(), vapid = deps.vapid();
    if (!store || !vapid) return res.status(503).json({ error: "not_configured" });
    const body = readBody(req);
    if (!body || typeof body.endpoint !== "string" || body.endpoint.length > 1024) return res.status(400).json({ error: "body" });
    const id = subId(body.endpoint);
    try {
      const rec = JSON.parse((await store.cmd("GET", KEY.sub(id))) || "null");
      if (!rec || !rec.sub) return res.status(404).json({ error: "not_registered" });
      const first = await store.cmd("SET", "sn:test:" + id, "1", "NX", "EX", "60");
      if (first !== "OK") return res.status(429).json({ error: "too_many" });
      const r = await sendPush(rec.sub, { title: "そらならべ：テスト通知", body: "サーバーからの通知が届いています。アプリを閉じていても、雨や警報・注意報をお知らせします。", tag: "soranarabe-test", hash: "#menu" },
        vapid, { fetch: deps.fetch, ttl: 300 });
      if (r.gone) {
        await store.pipeline([["DEL", KEY.sub(id)], ["DEL", KEY.state(id)], ["SREM", KEY.set, id]]);
        return res.status(410).json({ error: "gone" });
      }
      return res.status(r.status >= 200 && r.status < 300 ? 200 : 502).json({ ok: r.status < 300 });
    } catch (e) {
      return res.status(502).json({ error: "failed" });
    }
  };
}

module.exports = createHandler({ store: () => storeFromEnv(), vapid: () => vapidFromEnv(), fetch: (u, o) => fetch(u, o) });
module.exports.createHandler = createHandler;
