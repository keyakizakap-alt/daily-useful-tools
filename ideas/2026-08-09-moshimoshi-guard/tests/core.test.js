"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");

// ---------------------------------------------------------------------
// テスト用の簡易フレーズセット（境界値検証・critical判定検証用）
// ---------------------------------------------------------------------
const TEST_PHRASES = [
  { id: "p1", category: "money", text: "重み1", weight: 1, critical: false },
  { id: "p2", category: "money", text: "重み2", weight: 2, critical: false },
  { id: "p3", category: "money", text: "重み3", weight: 3, critical: false },
  { id: "p4", category: "money", text: "重み4", weight: 4, critical: false },
  {
    id: "critical_low",
    category: "money",
    text: "重みは低いがcritical",
    weight: 1,
    critical: true,
  },
];

// =======================================================================
// 1. フレーズ関連
// =======================================================================

test("getAllPhrases: 17件以上のフレーズを返す", () => {
  const phrases = core.getAllPhrases();
  assert.ok(Array.isArray(phrases));
  assert.ok(phrases.length >= 15, "フレーズは最低15件以上必要");
});

test("getAllPhrases: 返す配列は複製であり、元データを破壊しない", () => {
  const phrases = core.getAllPhrases();
  phrases.push({ id: "dummy" });
  const phrases2 = core.getAllPhrases();
  assert.notEqual(phrases2.length, phrases.length);
});

test("getPhraseById: 存在するIDでフレーズを取得できる", () => {
  const phrase = core.getPhraseById("atm_visit");
  assert.ok(phrase);
  assert.equal(phrase.id, "atm_visit");
  assert.equal(phrase.critical, true);
});

test("getPhraseById: 存在しないIDはnullを返す", () => {
  assert.equal(core.getPhraseById("not_exist_id"), null);
});

test("getPhrasesByCategory: カテゴリごとにグルーピングされる", () => {
  const grouped = core.getPhrasesByCategory(TEST_PHRASES);
  assert.ok(Array.isArray(grouped.money));
  assert.equal(grouped.money.length, TEST_PHRASES.length);
});

// =======================================================================
// 2. スコアリング・危険度判定 (境界値・critical判定・空配列)
// =======================================================================

test("calcScore: 空配列はスコア0", () => {
  assert.equal(core.calcScore([], TEST_PHRASES), 0);
});

test("calcScore: undefinedを渡してもエラーにならずスコア0", () => {
  assert.equal(core.calcScore(undefined, TEST_PHRASES), 0);
});

test("calcScore: 未知のフレーズIDは無視される", () => {
  assert.equal(core.calcScore(["p1", "unknown_id"], TEST_PHRASES), 1);
});

test("calcScore: 選択したフレーズの重みを合計する", () => {
  assert.equal(core.calcScore(["p1", "p2", "p3"], TEST_PHRASES), 6);
});

test("calcLevel: フレーズ未選択時はlow", () => {
  assert.equal(core.calcLevel([], TEST_PHRASES), "low");
});

test("calcLevel: 境界値 合計4はlow", () => {
  // p3(3) + p1(1) = 4
  assert.equal(core.calcScore(["p3", "p1"], TEST_PHRASES), 4);
  assert.equal(core.calcLevel(["p3", "p1"], TEST_PHRASES), "low");
});

test("calcLevel: 境界値 合計5はmid", () => {
  // p4(4) + p1(1) = 5
  assert.equal(core.calcScore(["p4", "p1"], TEST_PHRASES), 5);
  assert.equal(core.calcLevel(["p4", "p1"], TEST_PHRASES), "mid");
});

test("calcLevel: 境界値 合計9はmid", () => {
  // p4(4) + p3(3) + p2(2) = 9
  assert.equal(core.calcScore(["p4", "p3", "p2"], TEST_PHRASES), 9);
  assert.equal(core.calcLevel(["p4", "p3", "p2"], TEST_PHRASES), "mid");
});

test("calcLevel: 境界値 合計10はhigh", () => {
  // p4(4) + p3(3) + p2(2) + p1(1) = 10
  assert.equal(
    core.calcScore(["p4", "p3", "p2", "p1"], TEST_PHRASES),
    10
  );
  assert.equal(
    core.calcLevel(["p4", "p3", "p2", "p1"], TEST_PHRASES),
    "high"
  );
});

test("calcLevel: criticalフレーズが1件でもあれば、スコアが低くてもhigh", () => {
  assert.equal(core.calcScore(["critical_low"], TEST_PHRASES), 1);
  assert.equal(core.calcLevel(["critical_low"], TEST_PHRASES), "high");
});

test("hasCriticalPhrase: criticalなしはfalse、ありはtrue", () => {
  assert.equal(core.hasCriticalPhrase(["p1", "p2"], TEST_PHRASES), false);
  assert.equal(
    core.hasCriticalPhrase(["p1", "critical_low"], TEST_PHRASES),
    true
  );
});

test("calcLevel: デフォルト(組み込み)フレーズでもcritical判定が機能する", () => {
  // atm_visit は critical:true, weight:5 のみ選択 → highになる
  assert.equal(core.calcLevel(["atm_visit"]), "high");
});

test("nextActionMessage: low/mid/highそれぞれ異なるメッセージを返す", () => {
  const low = core.nextActionMessage("low");
  const mid = core.nextActionMessage("mid");
  const high = core.nextActionMessage("high");
  assert.ok(low.length > 0);
  assert.ok(mid.length > 0);
  assert.ok(high.length > 0);
  assert.notEqual(low, mid);
  assert.notEqual(mid, high);
  assert.notEqual(low, high);
});

test("nextActionMessage: 未知のレベルでも例外を投げずフォールバック文言を返す", () => {
  const msg = core.nextActionMessage("unknown_level");
  assert.equal(typeof msg, "string");
  assert.ok(msg.length > 0);
});

// =======================================================================
// 3. セッション
// =======================================================================

test("createSession: 初期値が正しく設定される", () => {
  const session = core.createSession({
    id: "s_1",
    startedAt: "2026-08-09T10:00:00.000+09:00",
  });
  assert.equal(session.id, "s_1");
  assert.equal(session.finishedAt, null);
  assert.deepEqual(session.selectedPhraseIds, []);
  assert.equal(session.score, 0);
  assert.equal(session.level, "low");
  assert.equal(session.callerName, "");
  assert.equal(session.memo, "");
});

test("togglePhrase: 選択→選択解除で元の状態に戻る（往復）", () => {
  const s0 = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  const s1 = core.togglePhrase(s0, "p1", TEST_PHRASES);
  assert.deepEqual(s1.selectedPhraseIds, ["p1"]);
  assert.equal(s1.score, 1);

  const s2 = core.togglePhrase(s1, "p1", TEST_PHRASES);
  assert.deepEqual(s2.selectedPhraseIds, []);
  assert.equal(s2.score, 0);
  assert.equal(s2.level, "low");
});

test("togglePhrase: 元のsessionオブジェクトを変更しない（イミュータブル）", () => {
  const s0 = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  const s1 = core.togglePhrase(s0, "p1", TEST_PHRASES);
  assert.deepEqual(s0.selectedPhraseIds, []);
  assert.notEqual(s0, s1);
});

test("togglePhrase: 複数選択でスコアが加算されレベルが更新される", () => {
  let session = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  session = core.togglePhrase(session, "p4", TEST_PHRASES); // 4
  session = core.togglePhrase(session, "p3", TEST_PHRASES); // +3 = 7
  assert.equal(session.score, 7);
  assert.equal(session.level, "mid");
});

test("togglePhrase: criticalフレーズを選択すると即座にlevelがhighになる", () => {
  let session = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  session = core.togglePhrase(session, "critical_low", TEST_PHRASES);
  assert.equal(session.level, "high");
});

test("updateSessionField: フィールド更新後もスコア・レベルは不変", () => {
  let session = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  session = core.togglePhrase(session, "p3", TEST_PHRASES); // score 3, level low
  const before = { score: session.score, level: session.level };

  session = core.updateSessionField(session, "callerName", "山田太郎");
  session = core.updateSessionField(session, "callerPhone", "090-1111-2222");
  session = core.updateSessionField(session, "requestContent", "還付金の手続き");
  session = core.updateSessionField(session, "memo", "少し声が若い気がする");

  assert.equal(session.callerName, "山田太郎");
  assert.equal(session.callerPhone, "090-1111-2222");
  assert.equal(session.requestContent, "還付金の手続き");
  assert.equal(session.memo, "少し声が若い気がする");
  assert.equal(session.score, before.score);
  assert.equal(session.level, before.level);
});

test("finishSession: finishedAtが設定される", () => {
  let session = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  assert.equal(session.finishedAt, null);
  session = core.finishSession(session, { finishedAt: "2026-08-09T10:10:00Z" });
  assert.equal(session.finishedAt, "2026-08-09T10:10:00Z");
});

test("removeSessionById: 指定IDのセッションのみ除去する", () => {
  const sessions = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const result = core.removeSessionById(sessions, "b");
  assert.deepEqual(result.map((s) => s.id), ["a", "c"]);
  // 元の配列は変更されない
  assert.equal(sessions.length, 3);
});

test("removeSessionById: 存在しないIDを指定しても配列はそのまま", () => {
  const sessions = [{ id: "a" }, { id: "b" }];
  const result = core.removeSessionById(sessions, "not_exist");
  assert.equal(result.length, 2);
});

test("sortSessionsByDateDesc: startedAtの新しい順に並び替える", () => {
  const sessions = [
    { id: "old", startedAt: "2026-01-01T00:00:00Z" },
    { id: "new", startedAt: "2026-08-09T00:00:00Z" },
    { id: "mid", startedAt: "2026-05-01T00:00:00Z" },
  ];
  const sorted = core.sortSessionsByDateDesc(sessions);
  assert.deepEqual(sorted.map((s) => s.id), ["new", "mid", "old"]);
  // 元の配列は変更されない
  assert.equal(sessions[0].id, "old");
});

test("isSessionStale: 開始直後（0分経過）はstaleでない", () => {
  const now = Date.parse("2026-08-09T10:00:00Z");
  const session = { startedAt: "2026-08-09T10:00:00Z" };
  assert.equal(core.isSessionStale(session, now), false);
});

test("isSessionStale: 境界値ちょうどSESSION_STALE_MSはstaleでない", () => {
  const started = Date.parse("2026-08-09T10:00:00Z");
  const now = started + core.SESSION_STALE_MS;
  const session = { startedAt: "2026-08-09T10:00:00Z" };
  assert.equal(core.isSessionStale(session, now), false);
});

test("isSessionStale: SESSION_STALE_MSを1msでも超えるとstale", () => {
  const started = Date.parse("2026-08-09T10:00:00Z");
  const now = started + core.SESSION_STALE_MS + 1;
  const session = { startedAt: "2026-08-09T10:00:00Z" };
  assert.equal(core.isSessionStale(session, now), true);
});

test("isSessionStale: セッションがnull・startedAt欠落・不正な日付は安全側でstale扱い", () => {
  assert.equal(core.isSessionStale(null), true);
  assert.equal(core.isSessionStale({}), true);
  assert.equal(core.isSessionStale({ startedAt: "invalid-date" }), true);
});

// =======================================================================
// 4. 緊急連絡先
// =======================================================================

test("validateContact: 名前・電話番号が両方あればvalid", () => {
  const result = core.validateContact({ name: "長男 太郎", phone: "090-1234-5678" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateContact: 名前が空ならエラー", () => {
  const result = core.validateContact({ name: "", phone: "090-1234-5678" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 1);
});

test("validateContact: 電話番号が空ならエラー", () => {
  const result = core.validateContact({ name: "長男 太郎", phone: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("電話番号")));
});

test("validateContact: 名前・電話番号ともに空なら2件のエラー", () => {
  const result = core.validateContact({ name: "", phone: "" });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test("validateContact: 電話番号に不正な文字が含まれる場合エラー", () => {
  const result = core.validateContact({ name: "長男", phone: "あいうえお" });
  assert.equal(result.valid, false);
});

test("validateContact: 記号のみ（数字を1文字も含まない）電話番号はエラー", () => {
  const result = core.validateContact({ name: "長男", phone: "----" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("電話番号")));
});

test("validateContact: contact自体がundefinedでも例外を投げない", () => {
  const result = core.validateContact(undefined);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test("normalizePhoneInput: 全角数字・全角記号を半角に変換する", () => {
  assert.equal(core.normalizePhoneInput("０９０－１２３４－５６７８"), "090-1234-5678");
  assert.equal(core.normalizePhoneInput("＋８１（９０）"), "+81(90)");
});

test("normalizePhoneInput: 半角文字列はそのまま返す", () => {
  assert.equal(core.normalizePhoneInput("090-1234-5678"), "090-1234-5678");
});

test("normalizePhoneInput: 文字列以外は空文字を返す", () => {
  assert.equal(core.normalizePhoneInput(undefined), "");
  assert.equal(core.normalizePhoneInput(null), "");
});

test("pickPrimaryContact: isPrimary:trueの連絡先を返す", () => {
  const contacts = [
    { id: "1", name: "A", isPrimary: false },
    { id: "2", name: "B", isPrimary: true },
  ];
  const primary = core.pickPrimaryContact(contacts);
  assert.equal(primary.id, "2");
});

test("pickPrimaryContact: primaryが存在しない場合はnull", () => {
  const contacts = [{ id: "1", name: "A", isPrimary: false }];
  assert.equal(core.pickPrimaryContact(contacts), null);
});

test("pickPrimaryContact: 空配列はnull", () => {
  assert.equal(core.pickPrimaryContact([]), null);
});

test("setPrimaryContact: 指定IDのみtrueになり他はfalseになる（排他制御）", () => {
  const contacts = [
    { id: "1", name: "A", isPrimary: true },
    { id: "2", name: "B", isPrimary: false },
    { id: "3", name: "C", isPrimary: true }, // 不整合な初期状態も考慮
  ];
  const result = core.setPrimaryContact(contacts, "2");
  assert.equal(result.find((c) => c.id === "1").isPrimary, false);
  assert.equal(result.find((c) => c.id === "2").isPrimary, true);
  assert.equal(result.find((c) => c.id === "3").isPrimary, false);
});

test("setPrimaryContact: 複数回呼び出すと最後に指定したもののみ有効になる", () => {
  let contacts = [
    { id: "1", name: "A", isPrimary: false },
    { id: "2", name: "B", isPrimary: false },
  ];
  contacts = core.setPrimaryContact(contacts, "1");
  contacts = core.setPrimaryContact(contacts, "2");
  assert.equal(contacts.find((c) => c.id === "1").isPrimary, false);
  assert.equal(contacts.find((c) => c.id === "2").isPrimary, true);
});

test("setPrimaryContact: 存在しないIDを指定するとすべてfalseになる", () => {
  const contacts = [
    { id: "1", name: "A", isPrimary: true },
    { id: "2", name: "B", isPrimary: false },
  ];
  const result = core.setPrimaryContact(contacts, "not_exist");
  assert.ok(result.every((c) => c.isPrimary === false));
});

test("ensurePrimaryContact: 誰もprimaryでない場合は先頭を自動的に昇格させる", () => {
  const contacts = [
    { id: "1", name: "A", isPrimary: false },
    { id: "2", name: "B", isPrimary: false },
  ];
  const result = core.ensurePrimaryContact(contacts);
  assert.equal(result.find((c) => c.id === "1").isPrimary, true);
  assert.equal(result.find((c) => c.id === "2").isPrimary, false);
});

test("ensurePrimaryContact: すでにprimaryがいる場合は変更しない", () => {
  const contacts = [
    { id: "1", name: "A", isPrimary: false },
    { id: "2", name: "B", isPrimary: true },
  ];
  const result = core.ensurePrimaryContact(contacts);
  assert.deepEqual(result, contacts);
});

test("ensurePrimaryContact: 空配列はそのまま空配列を返す", () => {
  assert.deepEqual(core.ensurePrimaryContact([]), []);
});

test("removeContactById: 指定IDの連絡先を除去する", () => {
  const contacts = [{ id: "1" }, { id: "2" }];
  const result = core.removeContactById(contacts, "1");
  assert.deepEqual(result.map((c) => c.id), ["2"]);
});

// =======================================================================
// 5. フォーマットユーティリティ
// =======================================================================

test("formatDateTimeJa: 正常なISO文字列を日本語表記に変換する", () => {
  const result = core.formatDateTimeJa("2026-08-09T10:05:00+09:00");
  assert.match(result, /2026年8月9日 \d{2}:\d{2}/);
});

test("formatDateTimeJa: 不正な文字列は '-' を返す（例外を投げない）", () => {
  assert.equal(core.formatDateTimeJa("これは日付ではありません"), "-");
});

test("formatDateTimeJa: 空文字・null・undefinedは '-' を返す", () => {
  assert.equal(core.formatDateTimeJa(""), "-");
  assert.equal(core.formatDateTimeJa(null), "-");
  assert.equal(core.formatDateTimeJa(undefined), "-");
});

test("formatPhone: 前後の空白をトリムして返す", () => {
  assert.equal(core.formatPhone("  090-1234-5678  "), "090-1234-5678");
});

test("formatPhone: 文字列以外はから空文字を返す", () => {
  assert.equal(core.formatPhone(undefined), "");
  assert.equal(core.formatPhone(null), "");
  assert.equal(core.formatPhone(12345), "");
});

test("generateId: prefixを含む一意な文字列を生成する", () => {
  const id1 = core.generateId("s");
  const id2 = core.generateId("s");
  assert.ok(id1.startsWith("s_"));
  assert.notEqual(id1, id2);
});

// =======================================================================
// 6. ストレージ（インメモリのモックストレージを注入してテスト）
// =======================================================================

function createMockStore() {
  const data = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    _raw: data,
  };
}

test("loadContacts: 未保存の場合は空配列を返す", () => {
  const store = createMockStore();
  assert.deepEqual(core.loadContacts(store), []);
});

test("saveContacts→loadContacts: 保存した内容がそのまま読み込める（往復一致）", () => {
  const store = createMockStore();
  const contacts = [{ id: "1", name: "長男 太郎", phone: "090-1234-5678", isPrimary: true }];
  core.saveContacts(contacts, store);
  const loaded = core.loadContacts(store);
  assert.deepEqual(loaded, contacts);
});

test("loadContacts: 不正なJSON文字列が保存されていても例外を投げず空配列を返す", () => {
  const store = createMockStore();
  store.setItem(core.STORAGE_KEYS.contacts, "{ this is not valid json");
  assert.deepEqual(core.loadContacts(store), []);
});

test("loadSessions: 未保存の場合は空配列を返す", () => {
  const store = createMockStore();
  assert.deepEqual(core.loadSessions(store), []);
});

test("saveSessions→loadSessions: 保存した内容がそのまま読み込める（往復一致）", () => {
  const store = createMockStore();
  const sessions = [
    core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" }),
  ];
  core.saveSessions(sessions, store);
  assert.deepEqual(core.loadSessions(store), sessions);
});

test("loadSessions: 不正なJSON文字列が保存されていても例外を投げず空配列を返す", () => {
  const store = createMockStore();
  store.setItem(core.STORAGE_KEYS.sessions, "not json at all {{{");
  assert.deepEqual(core.loadSessions(store), []);
});

test("loadCurrentSession: 未保存の場合はnullを返す", () => {
  const store = createMockStore();
  assert.equal(core.loadCurrentSession(store), null);
});

test("saveCurrentSession→loadCurrentSession: 保存した内容がそのまま読み込める", () => {
  const store = createMockStore();
  const session = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  core.saveCurrentSession(session, store);
  assert.deepEqual(core.loadCurrentSession(store), session);
});

test("clearCurrentSession: 進行中セッションをクリアするとnullになる", () => {
  const store = createMockStore();
  const session = core.createSession({ id: "s1", startedAt: "2026-08-09T10:00:00Z" });
  core.saveCurrentSession(session, store);
  core.clearCurrentSession(store);
  assert.equal(core.loadCurrentSession(store), null);
});

test("getDefaultStore: Node環境でも例外を投げずストレージ互換オブジェクトを返す", () => {
  const store = core.getDefaultStore();
  assert.equal(typeof store.getItem, "function");
  assert.equal(typeof store.setItem, "function");
  // 実際に読み書きできることを確認
  store.setItem("moshimoshiGuard.__test__", JSON.stringify({ ok: true }));
  assert.deepEqual(JSON.parse(store.getItem("moshimoshiGuard.__test__")), { ok: true });
});

test("createMemoryStore: getItem/setItem/removeItemが正しく動作する", () => {
  const store = core.createMemoryStore();
  assert.equal(store.getItem("k"), null);
  store.setItem("k", "v");
  assert.equal(store.getItem("k"), "v");
  store.removeItem("k");
  assert.equal(store.getItem("k"), null);
});
