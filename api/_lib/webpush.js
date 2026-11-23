"use strict";
/*
 * Web Push の送信（依存ライブラリなし。Node の crypto と fetch だけで実装）
 *   - 送信者の認証: VAPID（RFC 8292）。ES256 で署名した JWT を Authorization ヘッダーに付ける
 *   - 本文の暗号化: aes128gcm（RFC 8188 / RFC 8291）
 *   鍵は環境変数で渡す: VAPID_PUBLIC_KEY（非圧縮 P-256 公開鍵 65 バイトの base64url）
 *                       VAPID_PRIVATE_KEY（秘密鍵 32 バイトの base64url）
 *                       VAPID_SUBJECT（mailto: または https: の連絡先）
 */
const crypto = require("node:crypto");

const b64u = buf => Buffer.from(buf).toString("base64url");
const unb64u = s => Buffer.from(String(s), "base64url");

/** 通知の配信先として受け付けるホスト（ブラウザ各社のプッシュサービスだけに送る。任意の URL へは送らない） */
const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

function isAllowedEndpoint(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some(s => host === s || host.endsWith("." + s));
}

function vapidFromEnv(env) {
  const e = env || process.env;
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: e.VAPID_PUBLIC_KEY.trim(),
    privateKey: e.VAPID_PRIVATE_KEY.trim(),
    subject: (e.VAPID_SUBJECT || "").trim() || "mailto:noreply@example.com"
  };
}

function vapidPrivateKey(vapid) {
  const pub = unb64u(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY の形式が正しくありません");
  return crypto.createPrivateKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }
  });
}

/** VAPID の Authorization ヘッダー値（有効期限 12 時間） */
function vapidAuthorization(endpoint, vapid, now) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: aud, exp: Math.floor((now || Date.now()) / 1000) + 12 * 3600, sub: vapid.subject }));
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body),
    { key: vapidPrivateKey(vapid), dsaEncoding: "ieee-p1363" });
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + vapid.publicKey;
}

const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

/**
 * 通知の本文を購読者の鍵で暗号化する（aes128gcm・1レコード）。
 * opts.salt / opts.senderPrivateKey はテスト用（省略時は毎回ランダム）。
 */
function encryptPayload(payload, keys, opts) {
  const o = opts || {};
  const uaPublic = unb64u(keys && keys.p256dh);
  const authSecret = unb64u(keys && keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("p256dh の形式が正しくありません");
  if (authSecret.length !== 16) throw new Error("auth の形式が正しくありません");
  const plain = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);   // 0x02 = 最後のレコード
  if (plain.length > 3800) throw new Error("通知の本文が長すぎます");

  const ecdh = crypto.createECDH("prime256v1");
  if (o.senderPrivateKey) ecdh.setPrivateKey(o.senderPrivateKey); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32);
  const salt = o.salt || crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);    // レコードサイズ
  header[20] = asPublic.length;      // 65
  return Buffer.concat([header, asPublic, sealed]);
}

/**
 * 1件送る。戻り値の status が 404 / 410 なら購読は失効している（削除してよい）。
 * message: { title, body, tag, hash }
 */
async function sendPush(subscription, message, vapid, opts) {
  const o = opts || {};
  const doFetch = o.fetch || fetch;
  if (!isAllowedEndpoint(subscription.endpoint)) return { status: 0, gone: true, error: "endpoint not allowed" };
  const body = encryptPayload(JSON.stringify(message), subscription.keys);
  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    "TTL": String(o.ttl || 1800),
    "Urgency": o.urgency || "high",
    "Authorization": vapidAuthorization(subscription.endpoint, vapid)
  };
  if (o.topic) headers.Topic = o.topic;   // 同じ topic の未配信の通知は新しいもので置き換わる
  const res = await doFetch(subscription.endpoint, { method: "POST", headers: headers, body: body, signal: AbortSignal.timeout(8000) });
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}

module.exports = { isAllowedEndpoint, vapidFromEnv, vapidAuthorization, encryptPayload, sendPush, b64u, unb64u };
