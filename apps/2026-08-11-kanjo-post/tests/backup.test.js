"use strict";
/**
 * backup.js (JSONエクスポート/インポートロジック) のテスト。
 * 実行: node tests/backup.test.js
 */
const { test, summary, assert } = require("./_test-helpers.js");
const Backup = require("../src/js/backup.js");
const Letters = require("../src/js/letters.js");

console.log("backup.js のテスト");

function sampleLetter(seed) {
  return Letters.createLetter(
    {
      eventText: "出来事" + seed,
      relation: "friend",
      trueFeelingText: "本音" + seed,
      emotionTags: ["sad"],
      deliveryPreset: "3days",
    },
    new Date("2026-08-01T00:00:00.000Z")
  );
}

test("buildExportPayloadは仕様通りの形式のペイロードを作る", function () {
  const letters = [sampleLetter(1)];
  const settings = { theme: "dark", soundEnabled: false };
  const now = new Date("2026-08-11T00:00:00.000Z");
  const payload = Backup.buildExportPayload(letters, settings, now);
  assert.strictEqual(payload.version, 1);
  assert.strictEqual(payload.exportedAt, now.toISOString());
  assert.deepStrictEqual(payload.settings, settings);
  assert.strictEqual(payload.letters.length, 1);
});

test("エクスポート→インポートで手紙と設定が往復できる", function () {
  const letters = [sampleLetter(1), sampleLetter(2)];
  const payload = Backup.buildExportPayload(
    letters,
    { theme: "light", soundEnabled: true },
    new Date()
  );
  const json = JSON.stringify(payload);
  const parsed = Backup.parseImportPayload(json);
  assert.strictEqual(parsed.letters.length, 2);
  assert.strictEqual(parsed.settings.theme, "light");
  assert.deepStrictEqual(parsed.letters[0], letters[0]);
});

test("parseImportPayloadは壊れたJSON文字列で分かりやすい例外を投げる", function () {
  assert.throws(function () {
    Backup.parseImportPayload("{not valid json");
  }, /JSON/);
});

test("parseImportPayloadはlettersが配列でなければ例外を投げる", function () {
  assert.throws(function () {
    Backup.parseImportPayload(JSON.stringify({ letters: "x" }));
  });
});

test("parseImportPayloadは手紙データの形が不正なら例外を投げる", function () {
  const bad = JSON.stringify({ letters: [{ id: "a" }] });
  assert.throws(function () {
    Backup.parseImportPayload(bad);
  });
});

test("isValidLetterShapeは定義されていないrelation/emotionの値を不正と判定する", function () {
  const base = sampleLetter(1);
  const badRelation = Object.assign({}, base, { relation: "unknown-id" });
  assert.strictEqual(Backup.isValidLetterShape(badRelation), false);

  const badEmotion = Object.assign({}, base, { emotionTags: ["unknown-id"] });
  assert.strictEqual(Backup.isValidLetterShape(badEmotion), false);

  assert.strictEqual(Backup.isValidLetterShape(base), true);
});

test("parseImportPayloadは未定義のrelation値を含む手紙データを拒否する", function () {
  const base = sampleLetter(1);
  const bad = JSON.stringify({
    letters: [Object.assign({}, base, { relation: "not-a-real-relation" })],
  });
  assert.throws(function () {
    Backup.parseImportPayload(bad);
  }, /正しい形式/);
});

test("parseImportPayloadはsettingsが無くても空オブジェクトとして扱う", function () {
  const payload = JSON.stringify({ letters: [] });
  const parsed = Backup.parseImportPayload(payload);
  assert.deepStrictEqual(parsed.settings, {});
  assert.deepStrictEqual(parsed.letters, []);
});

test("mergeLettersは同じidの手紙を取り込んだ側の内容で上書きする", function () {
  const existing = [
    Object.assign(sampleLetter(1), { id: "shared", eventText: "古い内容" }),
    Object.assign(sampleLetter(2), { id: "keep-a" }),
  ];
  const incoming = [
    Object.assign(sampleLetter(3), { id: "shared", eventText: "新しい内容" }),
    Object.assign(sampleLetter(4), { id: "keep-b" }),
  ];
  const merged = Backup.mergeLetters(existing, incoming);
  assert.strictEqual(merged.length, 3);
  const shared = merged.filter(function (l) { return l.id === "shared"; })[0];
  assert.strictEqual(shared.eventText, "新しい内容");
  const ids = merged.map(function (l) { return l.id; }).sort();
  assert.deepStrictEqual(ids, ["keep-a", "keep-b", "shared"]);
});

test("buildExportFilenameは.jsonで終わるファイル名を作る", function () {
  const name = Backup.buildExportFilename(
    new Date("2026-08-11T22:30:00.000Z")
  );
  assert.ok(name.indexOf("kanjo-post-backup-") === 0);
  assert.ok(name.slice(-5) === ".json");
});

summary("backup.js");
