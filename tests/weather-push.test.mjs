// そらならべ: アプリを閉じていても届く通知（api/push）のテスト。外部への通信はすべて偽物に差し替える。
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wp = require("../api/_lib/webpush.js");
const W = require("../api/_lib/weather.js");
const subs = require("../api/_lib/subs.js");
const cron = require("../api/push/cron.js");
const subscribe = require("../api/push/subscribe.js");
const pushTest = require("../api/push/test.js");

const u = s => Buffer.from(s, "base64url");

/* ---------- 偽物の道具 ---------- */
function makeKeys() {
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ua, auth, keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };
}
/** 受信側（ブラウザ）と同じ手順で復号する（RFC 8291） */
function decrypt(body, ua, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const hk = (s, k, info, n) => Buffer.from(crypto.hkdfSync("sha256", k, s, info, n));
  const ikm = hk(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
  const cek = hk(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hk(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const ct = body.subarray(21 + idlen);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString("utf8");
}
function vapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const j = privateKey.export({ format: "jwk" });
  return { publicKey: Buffer.concat([Buffer.from([4]), u(j.x), u(j.y)]).toString("base64url"), privateKey: j.d, subject: "mailto:test@example.com" };
}
function png({ w = 256, h = 256, type = 6, depth = 8, palette, trns, pixel }) {
  const ch = { 2: 3, 3: 1, 6: 4 }[type], stride = Math.ceil(w * ch * depth / 8);
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = y % 5;   // 行ごとに違うフィルター種別の「印」だけ付け、中身は下で正しく符号化する
    const row = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) {
      const v = pixel(x, y);
      if (type === 3 && depth < 8) { const bit = x * depth; row[bit >> 3] |= v << (8 - depth - (bit & 7)); }
      else if (type === 3) row[x] = v; else v.forEach((c, i) => { row[x * ch + i] = c; });
    }
    // フィルターを実際にかける（Sub / Up / Average / Paeth を全部通す）
    const prev = y ? raw.subarray((y - 1) * (stride + 1) + 1, y * (stride + 1)) : null;
    const prevRaw = y ? Buffer.from(prevRows[y - 1]) : Buffer.alloc(stride);
    const bpp = Math.max(1, (ch * depth) >> 3), f = y % 5;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prevRaw[i], c = i >= bpp ? prevRaw[i - bpp] : 0;
      let pr = 0;
      if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      raw[y * (stride + 1) + 1 + i] = (row[i] - pr) & 255;
    }
    prevRows[y] = row; void prev;
  }
  const chunk = (tag, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(tag), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = type;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (palette) parts.push(chunk("PLTE", Buffer.from(palette.flat())));
  if (trns) parts.push(chunk("tRNS", Buffer.from(trns)));
  parts.push(chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}
const prevRows = [];
function memoryStore() {
  const kv = new Map(), sets = new Map();
  const exec = ([c, ...a]) => {
    if (c === "GET") return kv.has(a[0]) ? kv.get(a[0]) : null;
    if (c === "SET") { if (a.includes("NX") && kv.has(a[0])) return null; kv.set(a[0], a[1]); return "OK"; }
    if (c === "DEL") { kv.delete(a[0]); return 1; }
    const s = sets.get(a[0]) || new Set(); sets.set(a[0], s);
    if (c === "SADD") { s.add(a[1]); return 1; }
    if (c === "SREM") { s.delete(a[1]); return 1; }
    if (c === "SMEMBERS") return [...s];
    if (c === "SCARD") return s.size;
    if (c === "SISMEMBER") return s.has(a[1]) ? 1 : 0;
    throw new Error("unknown " + c);
  };
  return { kv, sets, cmd: async (...a) => exec(a.map(String)), pipeline: async cmds => cmds.map(c => exec(c.map(String))) };
}
function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
}
const jt = d => d.toISOString().replace(/[-:T]/g, "").slice(0, 14);

/* ---------- 暗号・署名 ---------- */
test("通知の暗号化が RFC 8291 の例と一致する", () => {
  const out = wp.encryptPayload("When I grow up, I want to be a watermelon",
    { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
    { salt: u("DGv6ra1nlYgDCS1FRnbzlw"), senderPrivateKey: u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") });
  assert.equal(out.toString("base64url"),
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    "aes128gcm の暗号文が RFC 8291 §5 の例と違う。直し方: api/_lib/webpush.js の encryptPayload で HKDF の info 文字列・ヘッダー（salt / rs=4096 / 鍵長）を RFC と見比べる");
});

test("暗号化した日本語の本文を、受信側の手順で元に戻せる", () => {
  const { ua, auth, keys } = makeKeys();
  const msg = JSON.stringify({ title: "長崎：20分後に雨が強まります" });
  assert.equal(decrypt(wp.encryptPayload(msg, keys), ua, auth), msg,
    "復号結果が元の本文と違う。直し方: encryptPayload の末尾の区切り（0x02）と UTF-8 変換を確認する");
});

test("VAPID の署名を公開鍵で検証できる", () => {
  const v = vapidKeys();
  const h = wp.vapidAuthorization("https://fcm.googleapis.com/fcm/send/x", v, Date.UTC(2026, 9, 1));
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m, "Authorization ヘッダーの形が `vapid t=..., k=...` になっていない。直し方: vapidAuthorization の戻り値を確認する");
  const pub = u(m[4]);
  const key = crypto.createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") } });
  assert.ok(crypto.verify("sha256", Buffer.from(m[1] + "." + m[2]), { key, dsaEncoding: "ieee-p1363" }, u(m[3])),
    "JWT の署名を検証できない。直し方: crypto.sign に dsaEncoding: 'ieee-p1363' を渡しているか確認する");
  assert.equal(JSON.parse(u(m[2])).aud, "https://fcm.googleapis.com", "aud がプッシュサービスのオリジンになっていない。直し方: new URL(endpoint).origin を使う");
});

test("ブラウザ各社のプッシュサービス以外には送らない", () => {
  for (const ok of ["https://fcm.googleapis.com/fcm/send/a", "https://updates.push.services.mozilla.com/wpush/v2/a", "https://web.push.apple.com/Q", "https://wns2-par02p.notify.windows.com/w/?token=a"]) {
    assert.ok(wp.isAllowedEndpoint(ok), ok + " を拒否している。直し方: PUSH_HOST_SUFFIXES を確認する");
  }
  for (const ng of ["http://fcm.googleapis.com/x", "https://evil.example.com/fcm.googleapis.com", "https://fcm.googleapis.com.evil.com/x", "https://169.254.169.254/latest", "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x"]) {
    assert.ok(!wp.isAllowedEndpoint(ng), ng + " を受け付けている（任意の宛先へ送れてしまう）。直し方: isAllowedEndpoint でホスト名の末尾一致・https・ポート無しを確認する");
  }
});

/* ---------- PNG と雨の判定 ---------- */
test("ナウキャストのタイル（パレット・RGBA・4bit）から地点の雨の強さを読める", () => {
  const palette = [[0, 0, 0], [160, 210, 255], [250, 245, 0]];
  const pal8 = W.decodePng(png({ type: 3, palette, trns: [0, 255, 255], pixel: (x) => x < 128 ? 0 : x < 200 ? 1 : 2 }));
  assert.equal(W.levelInPng(pal8, 60, 60), 0, "透明な場所を雨ありと読んでいる。直し方: tRNS のアルファ（40 未満は無視）を確認する");
  assert.equal(W.levelInPng(pal8, 150, 10), 2, "パレット PNG の弱い雨（1〜5mm/h）を読めていない。直し方: decodePng のパレット処理とフィルター復元を確認する");
  assert.equal(W.levelInPng(pal8, 198, 10), 5, "5×5px の範囲でいちばん強い雨を採っていない。直し方: levelInPng の範囲を確認する");
  const pal4 = W.decodePng(png({ type: 3, depth: 4, palette, trns: [0], pixel: (x) => x < 100 ? 0 : 2 }));
  assert.equal(W.levelInPng(pal4, 150, 30), 5, "4bit のパレット PNG を読めていない。直し方: decodePng の 8bit 未満のサンプル取り出しを確認する");
  const rgba = W.decodePng(png({ type: 6, pixel: (x, y) => y > 100 ? [0, 65, 255, 225] : [0, 0, 0, 0] }));
  assert.equal(W.levelInPng(rgba, 10, 150), 4, "RGBA PNG のやや強い雨を読めていない。直し方: decodePng の RGBA 処理を確認する");
});

test("降り出し・強まりだけを通知の対象にする", () => {
  const s = lv => ({ points: lv.map((level, i) => ({ min: i * 5, level })) });
  assert.deepEqual(W.rainEvent(s([0, 0, 0, 2, 2])), { kind: "start", min: 15, strong: false }, "降り出しを見落としている。直し方: rainEvent の cur===0 の条件を確認する");
  assert.equal(W.rainEvent(s([0, 1, 1, 1])), null, "ぱらつく程度（区分1）で通知しようとしている。直し方: 降り出しは区分2以上にする");
  assert.deepEqual(W.rainEvent(s([2, 2, 5])), { kind: "up", min: 10, strong: true }, "強まりを見落としている。直し方: rainEvent の cur>0 の条件を確認する");
  assert.equal(W.rainEvent(s([4, 4, 4])), null, "変化のない雨で通知しようとしている。直し方: 強まり（今より強く、区分3以上）のときだけにする");
  assert.match(W.rainMessage("長崎", { kind: "start", min: 15 }, "model").title, /1時間以内/, "数値予報なのに分単位の時刻を出している。直し方: rainMessage の source による言い分けを確認する");
});

/* ---------- 購読の検証 ---------- */
test("購読の登録内容を検証し、位置を約1km単位に丸める", () => {
  const { keys } = makeKeys();
  const rec = subs.normalizeSubscription({
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys },
    rain: { on: true, lat: 32.74489, lon: 129.87361, name: "長崎<script>" },
    warn: { on: true, places: [{ id: "nagasaki", name: "長崎", jma: "420000", area: "南部" }, { id: "x", jma: "bad" }] }
  });
  assert.ok(rec, "正しい購読を拒否している。直し方: normalizeSubscription の検証条件を確認する");
  assert.equal(rec.rain.lat, 32.74, "緯度を丸めていない。直し方: Math.round(lat * 100) / 100 にする");
  assert.equal(rec.warn.places.length, 1, "府県コードが不正な地点を受け付けている。直し方: /^\\d{6}$/ で検証する");
  assert.equal(subs.normalizeSubscription({ subscription: { endpoint: "https://evil.example.com/x", keys } }), null,
    "プッシュサービス以外の宛先を受け付けている。直し方: isAllowedEndpoint で検証する");
  assert.equal(subs.normalizeSubscription({ subscription: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "AAAA", auth: keys.auth } } }), null,
    "壊れた鍵を受け付けている。直し方: p256dh が 65 バイトの非圧縮点か確認する");
});

test("登録 API: 登録・上限・別サイトからの拒否・解除", async () => {
  const store = memoryStore();
  const handler = subscribe.createHandler({ store: () => store });
  const { keys } = makeKeys();
  const body = { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/1", keys }, rain: { on: false }, warn: { on: false } };
  let res = fakeRes();
  await handler({ method: "POST", headers: { host: "a.example", origin: "https://a.example" }, body }, res);
  assert.equal(res.code, 200, "正しい登録が失敗した: " + JSON.stringify(res.body) + "。直し方: api/push/subscribe.js を確認する");
  assert.equal(store.sets.get("sn:subs").size, 1, "購読の一覧に入っていない。直し方: SADD を確認する");
  res = fakeRes();
  await handler({ method: "POST", headers: { host: "a.example", origin: "https://evil.example" }, body }, res);
  assert.equal(res.code, 403, "別のサイトからの登録を受け付けている。直し方: sameOrigin を確認する");
  for (let i = 0; i < subs.MAX_SUBS; i++) store.sets.get("sn:subs").add("dummy" + i);
  res = fakeRes();
  await handler({ method: "POST", headers: { host: "a.example" }, body: { ...body, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/2", keys } } }, res);
  assert.equal(res.code, 503, "上限を超えても登録している。直し方: MAX_SUBS の判定を確認する");
  res = fakeRes();
  await handler({ method: "POST", headers: { host: "a.example" }, body: { action: "unsubscribe", endpoint: body.subscription.endpoint } }, res);
  assert.equal(res.code, 200, "解除が失敗した。直し方: DELETE の処理を確認する");
  assert.equal(store.kv.has("sn:sub:" + subs.subId(body.subscription.endpoint)), false, "解除しても購読データが残っている。直し方: DEL を確認する");
});

/* ---------- 定期実行 ---------- */
test("定期実行: 合言葉が無ければ何もしない", async () => {
  const handler = cron.createHandler({ secret: () => "s3cret", store: () => { throw new Error("呼ばれてはいけない"); }, vapid: () => null, fetch: null });
  for (const auth of [undefined, "Bearer wrong", "s3cret", "Bearer s3cret "]) {
    const res = fakeRes();
    await handler({ headers: auth ? { authorization: auth } : {} }, res);
    assert.equal(res.code, 401, "合言葉 " + auth + " で実行できてしまう。直し方: authorized() の比較を確認する");
  }
  const res = fakeRes();
  await cron.createHandler({ secret: () => "", store: () => null, vapid: () => null })({ headers: { authorization: "Bearer " } }, res);
  assert.equal(res.code, 401, "CRON_SECRET が未設定なのに実行できてしまう。直し方: secret が空なら常に拒否する");
});

test("定期実行: 雨と新しい警報を通知し、同じものは繰り返さず、失効した端末は消す", async () => {
  const store = memoryStore();
  const vapid = vapidKeys();
  const { ua, auth, keys } = makeKeys();
  const rec = subs.normalizeSubscription({
    subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/dev1", keys },
    rain: { on: true, lat: 32.75, lon: 129.88, name: "長崎" },
    warn: { on: true, places: [{ id: "nagasaki", name: "長崎", jma: "420000", area: "南部" }] }
  });
  await store.pipeline([["SET", "sn:sub:" + rec.id, JSON.stringify(rec)], ["SADD", "sn:subs", rec.id]]);

  const now = new Date(Date.UTC(2026, 9, 31, 3, 0, 0));
  const plan = m => m >= 20 ? 5 : 2;   // 今は弱い雨、20分後から強い雨
  let warnCodes = ["10"];
  let pushStatus = 201;
  const delivered = [];
  const RGB = { 2: [160, 210, 255], 5: [250, 245, 0] };
  const fakeFetch = async (url, opts) => {
    const ok = body => ({ ok: true, status: 200, json: async () => body, arrayBuffer: async () => body });
    if (url.endsWith("targetTimes_N1.json")) return ok([{ basetime: jt(now), validtime: jt(now) }]);
    if (url.endsWith("targetTimes_N2.json")) return ok(Array.from({ length: 12 }, (_, k) => ({ basetime: jt(now), validtime: jt(new Date(+now + (k + 1) * 300e3)) })));
    if (url.includes("/hrpns/")) {
      const vt = /\/none\/(\d{14})\//.exec(url)[1];
      const m = Math.round((W.parseJmaTime(vt) - now) / 60000);
      const buf = png({ type: 6, pixel: () => [...RGB[plan(m)], 230] });
      return ok(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    }
    if (url.endsWith("area.json")) return ok({ class10s: { "420010": { name: "南部" } } });
    if (url.includes("/warning/")) return ok({ areaTypes: [{ areas: [{ code: "420010", warnings: warnCodes.map(c => ({ code: c, status: "発表" })) }] }] });
    if (url.startsWith("https://fcm.googleapis.com/")) {
      delivered.push({ topic: opts.headers.Topic, msg: JSON.parse(decrypt(Buffer.from(opts.body), ua, auth)) });
      return { ok: pushStatus < 300, status: pushStatus };
    }
    throw new Error("想定外の通信: " + url);
  };
  const go = () => cron.run({ store, vapid, fetch: fakeFetch, now: () => +now });

  let r = await go();
  assert.equal(delivered.length, 1, "1回目は雨の1件だけのはず（警報は基準として記録するだけ）: " + JSON.stringify(delivered) + "。直し方: diffWarnings の初回の扱いを確認する");
  assert.equal(delivered[0].msg.title, "長崎：20分後に雨が強まります", "雨の通知の文言が違う。直し方: rainMessage を確認する");
  assert.equal(delivered[0].topic, "rain", "Topic ヘッダーが無い。直し方: sendPush に topic を渡す");

  warnCodes = ["10", "03"];
  r = await go();
  assert.equal(delivered.length, 2, "新しく出た大雨警報を通知していない（または雨を繰り返した）。直し方: cron.js の重複判定を確認する");
  assert.equal(delivered[1].msg.title, "長崎：大雨警報が発表されました", "警報の通知の文言が違う。直し方: warnMessage を確認する");

  r = await go();
  assert.equal(delivered.length, 2, "同じ雨・同じ警報を繰り返し通知している。直し方: sn:st の記録を確認する");

  warnCodes = ["10", "03", "14"]; pushStatus = 410;
  r = await go();
  assert.equal(r.removed, 1, "失効（410）した端末を消していない。直し方: sendPush の gone の扱いを確認する");
  assert.equal(store.sets.get("sn:subs").size, 0, "失効した端末が一覧に残っている。直し方: SREM を確認する");
});

test("テスト通知 API: 登録済みの端末にだけ、1分に1回まで送る", async () => {
  const store = memoryStore();
  const vapid = vapidKeys();
  const { ua, auth, keys } = makeKeys();
  const endpoint = "https://fcm.googleapis.com/fcm/send/t1";
  const got = [];
  let status = 201;
  const handler = pushTest.createHandler({ store: () => store, vapid: () => vapid,
    fetch: async (url, opts) => { got.push(JSON.parse(decrypt(Buffer.from(opts.body), ua, auth))); return { ok: status < 300, status }; } });
  const call = async ep => { const r = fakeRes(); await handler({ method: "POST", headers: { host: "a.example" }, body: { endpoint: ep } }, r); return r.code; };
  assert.equal(await call(endpoint), 404, "未登録の端末に送ろうとしている。直し方: api/push/test.js で GET の結果を確認する");
  const rec = subs.normalizeSubscription({ subscription: { endpoint, keys }, rain: { on: false }, warn: { on: false } });
  await store.pipeline([["SET", "sn:sub:" + rec.id, JSON.stringify(rec)], ["SADD", "sn:subs", rec.id]]);
  assert.equal(await call(endpoint), 200, "登録済みの端末に送れない。直し方: sendPush の呼び出しを確認する");
  assert.equal(got[0].title, "そらならべ：テスト通知", "テスト通知の本文が違う。直し方: api/push/test.js の文言を確認する");
  assert.equal(await call(endpoint), 429, "1分以内に何度も送れてしまう。直し方: SET NX EX 60 の判定を確認する");
  store.kv.delete("sn:test:" + rec.id); status = 410;
  assert.equal(await call(endpoint), 410, "失効した端末を知らせていない。直し方: r.gone の扱いを確認する");
  assert.equal(store.kv.has("sn:sub:" + rec.id), false, "失効した端末の登録が残っている。直し方: DEL を確認する");
});
