"use strict";
/* GET /api/push/config/ — 端末が購読に使う公開鍵と、サーバー通知が使える状態かを返す */
const { vapidFromEnv } = require("../_lib/webpush.js");
const { storeFromEnv } = require("../_lib/store.js");

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "method" }); }
  const vapid = vapidFromEnv();
  const enabled = !!(vapid && storeFromEnv());
  res.status(200).json({ enabled, publicKey: enabled ? vapid.publicKey : null });
};
