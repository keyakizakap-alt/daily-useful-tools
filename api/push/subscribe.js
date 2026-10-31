"use strict";
/*
 * POST /api/push/subscribe/  … 購読の登録・設定の更新（本文: { subscription, rain, warn }）
 *                              購読の解除（本文: { action: "unsubscribe", endpoint }。DELETE でも可）
 * 購読の識別は endpoint（端末ごとに推測できない URL）で行う。ログインは無い。
 */
const { storeFromEnv } = require("../_lib/store.js");
const { MAX_SUBS, KEY, subId, normalizeSubscription, readBody, sameOrigin } = require("../_lib/subs.js");

function createHandler(deps) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST" && req.method !== "DELETE") { res.setHeader("Allow", "POST, DELETE"); return res.status(405).json({ error: "method" }); }
    if (!sameOrigin(req)) return res.status(403).json({ error: "origin" });
    const store = deps.store();
    if (!store) return res.status(503).json({ error: "not_configured" });
    const body = readBody(req);
    if (!body) return res.status(400).json({ error: "body" });
    try {
      if (req.method === "DELETE" || body.action === "unsubscribe") {
        if (typeof body.endpoint !== "string" || body.endpoint.length > 1024) return res.status(400).json({ error: "endpoint" });
        const id = subId(body.endpoint);
        await store.pipeline([["DEL", KEY.sub(id)], ["DEL", KEY.state(id)], ["SREM", KEY.set, id]]);
        return res.status(200).json({ ok: true });
      }
      const rec = normalizeSubscription(body);
      if (!rec) return res.status(400).json({ error: "subscription" });
      const [isMember, count] = await store.pipeline([["SISMEMBER", KEY.set, rec.id], ["SCARD", KEY.set]]);
      if (!isMember && count >= MAX_SUBS) return res.status(503).json({ error: "full" });
      await store.pipeline([["SET", KEY.sub(rec.id), JSON.stringify(rec)], ["SADD", KEY.set, rec.id]]);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(502).json({ error: "store" });
    }
  };
}

module.exports = createHandler({ store: () => storeFromEnv() });
module.exports.createHandler = createHandler;
