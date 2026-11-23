"use strict";
/* 購読データの検証と保存形式 */
const crypto = require("node:crypto");
const { isAllowedEndpoint, unb64u } = require("./webpush.js");

const MAX_SUBS = 300;          // 保存する購読の上限（無料枠を使い切らないため）
const MAX_PLACES = 20;
const KEY = { set: "sn:subs", sub: id => "sn:sub:" + id, state: id => "sn:st:" + id };

const subId = endpoint => crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
const str = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;

/** 端末から届いた購読情報を検証して、保存する形に整える。不正なら null */
function normalizeSubscription(body) {
  const s = body && body.subscription;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1024 || !isAllowedEndpoint(s.endpoint)) return null;
  const p256dh = s.keys && s.keys.p256dh, auth = s.keys && s.keys.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !/^[A-Za-z0-9_-]+=*$/.test(p256dh) || !/^[A-Za-z0-9_-]+=*$/.test(auth)) return null;
  const pk = unb64u(p256dh);
  if (pk.length !== 65 || pk[0] !== 4 || unb64u(auth).length !== 16) return null;

  const r = body.rain || {};
  const rain = r.on === true && num(r.lat, -90, 90) && num(r.lon, -180, 180)
    // 位置は約 1km 単位に丸めて保存する
    ? { on: true, lat: Math.round(r.lat * 100) / 100, lon: Math.round(r.lon * 100) / 100, name: str(r.name, 40) || "見張る地点" }
    : { on: false };
  const w = body.warn || {};
  const places = (Array.isArray(w.places) ? w.places : []).slice(0, MAX_PLACES)
    .filter(p => p && typeof p.jma === "string" && /^\d{6}$/.test(p.jma) && str(p.id, 40))
    .map(p => ({ id: str(p.id, 40), name: str(p.name, 40) || str(p.id, 40), jma: p.jma, area: str(p.area, 40) }));
  const warn = w.on === true && places.length ? { on: true, places } : { on: false, places: [] };
  return { id: subId(s.endpoint), sub: { endpoint: s.endpoint, keys: { p256dh, auth } }, rain, warn, updatedAt: Date.now() };
}

/** 本文を JSON として読む（Vercel が解析済みならそれを使う）。大きすぎるものは拒否 */
function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { if (b.length > 8000) return null; try { b = JSON.parse(b); } catch (e) { return null; } }
  if (!b || typeof b !== "object") return null;
  if (JSON.stringify(b).length > 8000) return null;
  return b;
}

/** 別のサイトのページからの書き込みを断る（Origin が付いていれば Host と一致すること） */
function sameOrigin(req) {
  const o = req.headers && req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

module.exports = { MAX_SUBS, KEY, subId, normalizeSubscription, readBody, sameOrigin };
