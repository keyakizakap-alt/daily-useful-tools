// そなえ帳 engine.js の単体テスト。assert の失敗メッセージには「直し方」を書く。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const S = require("../src/engine.js");
const here = dirname(fileURLToPath(import.meta.url));

const hh = (o = {}) => ({ adults: 0, children: 0, infants: 0, elders: 0, dogs: 0, cats: 0, days: 7, ...o });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test("大人2人・7日の必要量が基準値どおり", () => {
  const r = byId(S.calcRequirements(hh({ adults: 2 })));
  const want = { water: 42, staple: 42, side: 42, gas: 12, toilet: 70, bags: 28, light: 2, radio: 1 };
  for (const [id, n] of Object.entries(want)) {
    assert.equal(r[id]?.required, n, `${id} の必要量が ${r[id]?.required}（期待 ${n}）。直し方: engine.js の REQUIREMENTS の ${id}.count を確認する`);
  }
});

test("該当者がいない品目は必要量に出ない", () => {
  const ids = S.calcRequirements(hh({ adults: 1 })).map((r) => r.id);
  for (const id of ["milk", "diaper", "medicine", "petfood", "petwater"]) {
    assert.ok(!ids.includes(id), `乳児・高齢者・ペット0なのに ${id} が出ている。直し方: calcRequirements で required>0 の品目だけ返す`);
  }
});

test("乳児は主食・ボンベの人数に含めず、水・トイレには含める", () => {
  const r = byId(S.calcRequirements(hh({ adults: 1, infants: 1, days: 3 })));
  assert.equal(r.water.required, 18, "水は乳児も含めて 3L×2人×3日=18L。直し方: water.count で humans() を使う");
  assert.equal(r.staple.required, 9, "主食は乳児を除いて 3食×1人×3日=9食。直し方: staple.count で eaters() を使う");
  assert.equal(r.milk.required, 24, "ミルクは 8回×1人×3日=24回分。直し方: milk.count を確認する");
  assert.equal(r.toilet.required, 30, "トイレは乳児も含めて 5回×2人×3日=30。直し方: toilet.count で humans() を使う");
});

test("常備薬は最低7日、ペットは最低5日で計算する", () => {
  const r = byId(S.calcRequirements(hh({ elders: 1, dogs: 1, cats: 1, days: 3 })));
  assert.equal(r.medicine.required, 7, "3日設定でも常備薬は7日分。直し方: medicine.count の Math.max(h.days, 7) を確認する");
  assert.equal(r.petfood.required, 10, "犬猫2匹×最低5日=10日分。直し方: petfood.count を確認する");
  assert.equal(r.petwater.required, 6, "犬1L+猫0.2L × 5日 = 6L。直し方: petwater.count を確認する");
});

test("家族構成の不正値は範囲内に丸める", () => {
  const h = S.normalizeHousehold({ adults: -3, children: "abc", infants: 999, days: 0, elders: "2", dogs: 1.9 });
  assert.deepEqual(
    h,
    { adults: 0, children: 0, infants: 20, elders: 2, dogs: 1, cats: 0, days: 1 },
    "直し方: normalizeHousehold / toInt の範囲処理と既定値を確認する",
  );
  assert.deepEqual(S.calcRequirements(hh()), [], "全員0人なら必要量は空。直し方: 備品の count が humans(h)>0 を見ているか確認する");
});

test("日付の検証は実在しない日を拒否する", () => {
  assert.notEqual(S.parseDate("2028-02-29"), null, "うるう日を拒否している。直し方: parseDate の検証を確認する");
  for (const bad of ["2027-02-29", "2026-13-01", "2026-1-01", "20260101", "", null, "2026-11-09T00:00"]) {
    assert.equal(S.parseDate(bad), null, `${bad} を日付として受け入れている。直し方: parseDate の正規表現と実在チェックを確認する`);
  }
});

test("期限までの日数と状態の境界", () => {
  const t = "2026-11-09";
  const cases = [
    ["2026-11-08", -1, "expired"],
    ["2026-11-09", 0, "soon"],
    ["2026-12-09", 30, "soon"],
    ["2026-12-10", 31, "rolling"],
    ["2027-01-08", 60, "rolling"],
    ["2027-01-09", 61, "ok"],
    ["", null, "none"],
  ];
  for (const [exp, days, status] of cases) {
    const d = S.daysUntil(exp, t);
    assert.equal(d, days, `${exp} の残り日数が ${d}（期待 ${days}）。直し方: daysUntil の UTC 計算を確認する`);
    assert.equal(S.expiryStatus(d), status, `${exp} の状態が ${S.expiryStatus(d)}（期待 ${status}）。直し方: expiryStatus の境界を確認する`);
  }
  assert.equal(S.daysUntil("2027-03-28", "2027-03-27"), 1, "夏時間のある地域でも1日差。直し方: Date.UTC で差を取る");
  assert.equal(S.expiryLabel(-3), "期限切れ（3日前）", "直し方: expiryLabel の文言を確認する");
});

test("期限切れの在庫は充足量に数えず、アラートは期限の近い順", () => {
  const items = [
    { id: "a", reqId: "water", name: "古い水", qty: 20, expiry: "2026-10-01" },
    { id: "b", reqId: "water", name: "新しい水", qty: 12, expiry: "2027-11-01" },
    { id: "c", reqId: "staple", name: "アルファ米", qty: 10, expiry: "2026-11-20" },
    { id: "d", reqId: "staple", name: "パン缶", qty: 5, expiry: "2026-11-15" },
    { id: "e", reqId: "other", name: "メモ帳", qty: 1, expiry: "" },
  ];
  const sum = S.summarize(hh({ adults: 2 }), items, "2026-11-09");
  const rows = byId(sum.rows);
  assert.equal(rows.water.have, 12, "期限切れの水20Lを数えている。直し方: summarize で status==='expired' を除外する");
  assert.equal(rows.water.shortage, 30, "直し方: shortage = required - have を確認する");
  assert.equal(sum.waterDays, 2, "12L ÷ (3L×2人) = 2日分。直し方: waterDays の計算を確認する");
  assert.deepEqual(sum.alerts.expired.map((a) => a.id), ["a"], "直し方: alerts.expired の抽出を確認する");
  assert.deepEqual(sum.alerts.soon.map((a) => a.id), ["d", "c"], "期限の近い順に並んでいない。直し方: alerts の sort を確認する");
  assert.ok(sum.coverage > 0 && sum.coverage < 100, `全体の充足率が ${sum.coverage}。直し方: coverage の平均計算を確認する`);
});

test("充足率は品目ごとに100%で頭打ち", () => {
  const sum = S.summarize(hh({ adults: 1, days: 1 }), [{ id: "x", reqId: "water", name: "水", qty: 300, expiry: "" }], "2026-11-09");
  assert.equal(byId(sum.rows).water.ratio, 1, "直し方: ratio を Math.min(1, …) で丸める");
  assert.ok(sum.coverage < 100, "水だけ大量にあっても全体は100%にならない。直し方: coverage は品目ごとの ratio の平均にする");
});

test("買い物リストは不足分だけを並べ、不足がなければ空", () => {
  const sum = S.summarize(hh({ adults: 1, days: 1 }), [], "2026-11-09");
  const text = S.shoppingList(sum);
  assert.match(text, /・飲料水 あと3L/, "直し方: shoppingList の行の形式を確認する");
  const full = {
    rows: sum.rows.map((r) => ({ ...r, shortage: 0 })),
  };
  assert.equal(S.shoppingList(full), "", "不足なしで空文字になっていない。直し方: shortage>0 で絞り込む");
});

test("在庫1件の検証: 数量・期限・品目・文字数", () => {
  assert.equal(S.sanitizeItem({ reqId: "water", qty: "0", expiry: "" }).ok, false, "数量0を受け入れている。直し方: qty<=0 を拒否する");
  assert.equal(S.sanitizeItem({ reqId: "water", qty: 1e9 }).ok, false, "巨大な数量を受け入れている。直し方: MAX_QTY で上限を設ける");
  assert.equal(S.sanitizeItem({ reqId: "water", qty: 1, expiry: "2026-02-30" }).ok, false, "直し方: 期限を parseDate で検証する");
  assert.equal(S.sanitizeItem({ reqId: "__proto__", qty: 1 }).ok, false, "未知の品目を受け入れている。直し方: REQ_BY_ID と 'other' だけ許可する");
  const ok = S.sanitizeItem({ reqId: "water", name: "  水\u200b\u0007" + "あ".repeat(60), qty: "2.25" });
  assert.equal(ok.ok, true, `正しい在庫を拒否: ${ok.error}。直し方: sanitizeItem を確認する`);
  assert.equal(Array.from(ok.item.name).length, S.MAX_NAME, "品名が40字に切り詰められていない。直し方: cleanText の max を確認する");
  assert.ok(!/[\u200b\u0007]/.test(ok.item.name), "制御文字・ゼロ幅文字が残っている。直し方: cleanText の正規表現を確認する");
  assert.equal(ok.item.qty, 2.3, "数量が小数1桁に丸められていない。直し方: round1 を適用する");
  assert.equal(S.sanitizeItem({ reqId: "gas", qty: 3 }).item.name, "カセットボンベ", "品名が空なら品目名を使う。直し方: sanitizeItem の name の既定値を確認する");
});

test("読み込みデータの検証: 不正な形は拒否、知らない項目は捨てる", () => {
  for (const bad of [null, [], "x", 1, { version: 2 }, { version: 1, items: "nope" }]) {
    const r = S.sanitizeState(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} を受け入れている。直し方: sanitizeState の冒頭の型チェックを確認する`);
    assert.ok(r.errors.length > 0 && typeof r.errors[0] === "string", "日本語のエラーがない。直し方: errors に理由を入れる");
  }
  const tooMany = { version: 1, items: Array.from({ length: S.MAX_ITEMS + 1 }, () => ({ reqId: "water", qty: 1 })) };
  assert.equal(S.sanitizeState(tooMany).ok, false, "直し方: MAX_ITEMS 超過を拒否する");

  const raw = JSON.parse(
    '{"version":1,"__proto__":{"polluted":true},"evil":"x","household":{"adults":3,"hack":1},' +
      '"items":[{"id":"dup","reqId":"water","name":"<img src=x onerror=alert(1)>","qty":2,"extra":1},' +
      '{"id":"dup","reqId":"staple","qty":1},{"reqId":"water","qty":-1}]}',
  );
  const r = S.sanitizeState(raw);
  assert.equal(r.ok, true, "直し方: 一部の在庫が不正でも、他は取り込む");
  assert.equal({}.polluted, undefined, "プロトタイプ汚染が起きた。直し方: 既知キーだけを写す");
  assert.deepEqual(Object.keys(r.state).sort(), ["household", "items", "version"], "知らない項目が残っている。直し方: state を新しく組み立てる");
  assert.equal(r.state.household.adults, 3);
  assert.ok(!("hack" in r.state.household), "household の知らない項目が残っている。直し方: normalizeHousehold を通す");
  assert.equal(r.state.items.length, 2, "不正な在庫（数量-1）を取り込んでいる。直し方: sanitizeItem で拒否する");
  assert.notEqual(r.state.items[0].id, r.state.items[1].id, "ID の重複が残っている。直し方: seen で重複を振り直す");
  assert.equal(r.state.items[0].name, "<img src=x onerror=alert(1)>", "品名は文字列のまま保持（表示側で textContent を使う）");
  assert.ok(!("extra" in r.state.items[0]), "在庫の知らない項目が残っている。直し方: sanitizeItem で新しく組み立てる");
  assert.equal(r.errors.length, 1, "直し方: 不正な在庫ごとに errors へ理由を積む");
});

test("画面のコードは innerHTML を使わず、通信もしない", () => {
  const src = ["../src/app.js", "../src/engine.js"].map((p) => readFileSync(join(here, p), "utf8")).join("\n");
  for (const pat of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function/, /fetch\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/]) {
    assert.ok(!pat.test(src), `${pat} が使われている。直し方: DOM は createElement + textContent で作り、通信コードを入れない`);
  }
  const html = readFileSync(join(here, "../index.html"), "utf8");
  assert.match(html, /connect-src 'none'/, "CSP に connect-src 'none' がない。直し方: index.html の CSP メタタグに追加する");
  assert.ok(!/<script>[\s\S]*?<\/script>/.test(html) && !/\son[a-z]+=/i.test(html), "インラインスクリプトがある。直し方: src/app.js に移す");
});

test("レビュー対応: Object.prototype のキーを品目・ID として受け入れない", () => {
  for (const reqId of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(S.sanitizeItem({ reqId, qty: 1 }).ok, false, `${reqId} を品目として受け入れている。直し方: isReqId で hasOwnProperty を使う`);
  }
  const r = S.sanitizeItem({ id: "__proto__", reqId: "water", qty: 1 });
  assert.notEqual(r.item.id, "__proto__", "直し方: ID の正規表現を i- 始まりに限定する");
  const sum = S.summarize(hh({ adults: 1 }), [{ id: "x", reqId: "constructor", name: "x", qty: 5, expiry: "" }], "2026-11-09");
  assert.ok(sum.rows.every((row) => typeof row.have === "number" && !Number.isNaN(row.have)), "直し方: have を Object.create(null) にする");
});

test("レビュー対応: 在庫がすべて不正なファイルは読み込みを拒否する", () => {
  const r = S.sanitizeState({ version: 1, items: [{ reqId: "x", qty: 1 }, { reqId: "water", qty: -1 }] });
  assert.equal(r.ok, false, "全件不正なのに ok になり、今のデータが空で置き換わる。直し方: sanitizeState で有効0件を拒否する");
  assert.equal(S.sanitizeState({ version: 1, items: [] }).ok, true, "在庫0件の正しいデータは受け入れる");
});

test("レビュー対応: 全体の充足率は備品だけ揃えても上がらない", () => {
  const items = ["light", "radio", "battery", "firstaid", "bags"].map((reqId, i) => ({ id: `i-${i}`, reqId, name: reqId, qty: 999, expiry: "" }));
  const sum = S.summarize(hh({ adults: 1 }), items, "2026-11-09");
  assert.equal(sum.coverage, 0, `備品だけで充足率 ${sum.coverage}%。直し方: COVERAGE_EXCLUDED_GROUP の品目を平均から除く`);
});

test("レビュー対応: 不可視文字を取り除き、ソースに不可視文字をそのまま書かない", () => {
  const name = S.cleanText("水\u2028\u2029\u00ad\u2060\u200d缶", 40);
  assert.equal(name, "水缶", `不可視文字が残る: ${JSON.stringify(name)}。直し方: cleanText の文字クラスに追加する`);
  for (const p of ["../src/engine.js", "../src/app.js", "./engine.test.mjs"]) {
    const src = readFileSync(join(here, p), "utf8");
    assert.ok(!/[\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/.test(src), `${p} に不可視文字が直接書かれている。直し方: \\u エスケープで書く`);
  }
});
