"use strict";
/**
 * letters.js (手紙のCRUD・配達判定ロジック) のテスト。
 * 実行: node tests/letters.test.js
 */
const { test, summary, assert } = require("./_test-helpers.js");
const Letters = require("../src/js/letters.js");

console.log("letters.js のテスト");

test("createLetterは正しい入力からsealed状態の手紙を作る", function () {
  const now = new Date("2026-08-11T22:00:00+09:00");
  const input = {
    eventText: "会議で理不尽な指摘を受けた",
    relation: "boss",
    trueFeelingText: "ちゃんと話を聞いてほしかった",
    emotionTags: ["anger", "moya"],
    deliveryPreset: "3days",
  };
  const letter = Letters.createLetter(input, now);
  assert.strictEqual(letter.status, "sealed");
  assert.strictEqual(letter.relation, "boss");
  assert.deepStrictEqual(letter.emotionTags, ["anger", "moya"]);
  assert.strictEqual(letter.openedAt, null);
  assert.deepStrictEqual(letter.reflections, []);
  assert.ok(letter.id.indexOf("letter-") === 0);

  const deliverAt = new Date(letter.deliverAt);
  const expected = new Date(now.getTime());
  expected.setDate(expected.getDate() + 3);
  assert.strictEqual(deliverAt.getTime(), expected.getTime());
});

test("validateComposeInputは未入力の項目をすべて検出する", function () {
  const errors = Letters.validateComposeInput({});
  assert.ok(errors.length >= 4, "エラーが4件以上検出されるはず: " + errors.length);
});

test("createLetterは不正な入力で例外を投げる", function () {
  assert.throws(function () {
    Letters.createLetter({}, new Date());
  }, /何があったか/);
});

test("computeDeliverAtはプリセットごとに正しい日数を加算する", function () {
  const now = new Date("2026-01-01T00:00:00+09:00");
  const week = Letters.computeDeliverAt("1week", now);
  const diffDaysWeek = Math.round((week.getTime() - now.getTime()) / 86400000);
  assert.strictEqual(diffDaysWeek, 7);

  const month = Letters.computeDeliverAt("1month", now);
  const diffDaysMonth = Math.round(
    (month.getTime() - now.getTime()) / 86400000
  );
  assert.strictEqual(diffDaysMonth, 30);

  const threeDays = Letters.computeDeliverAt("3days", now);
  const diffDays3 = Math.round(
    (threeDays.getTime() - now.getTime()) / 86400000
  );
  assert.strictEqual(diffDays3, 3);
});

test("computeDeliverAtはcustomの日付文字列から日時を作る", function () {
  const now = new Date("2026-01-01T00:00:00+09:00");
  const d = Letters.computeDeliverAt("custom", now, "2026-02-14");
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 1);
  assert.strictEqual(d.getDate(), 14);
});

test("computeDeliverAtはcustomで日付未指定なら例外を投げる", function () {
  assert.throws(function () {
    Letters.computeDeliverAt("custom", new Date());
  });
});

test("computeDeliverAtはcustomで今日・過去の日付なら例外を投げる(時間差を守るガード)", function () {
  const now = new Date("2026-08-11T22:00:00+09:00");
  assert.throws(function () {
    Letters.computeDeliverAt("custom", now, "2026-08-11");
  }, /明日以降/);
  assert.throws(function () {
    Letters.computeDeliverAt("custom", now, "2026-08-01");
  }, /明日以降/);
});

test("computeDeliverAtはcustomで明日の日付なら例外を投げない", function () {
  const now = new Date("2026-08-11T22:00:00+09:00");
  const d = Letters.computeDeliverAt("custom", now, "2026-08-12");
  assert.strictEqual(d.getDate(), 12);
});

test("checkDeliveryは配達予定日を過ぎたsealedをdeliveredに変える", function () {
  const now = new Date("2026-08-11T00:00:00+09:00");
  const past = new Date(now.getTime() - 1000).toISOString();
  const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString();
  const letters = [
    { id: "a", status: "sealed", deliverAt: past },
    { id: "b", status: "sealed", deliverAt: future },
    { id: "c", status: "opened", deliverAt: past },
  ];
  const result = Letters.checkDelivery(letters, now);
  const a = result.letters.filter(function (l) { return l.id === "a"; })[0];
  const b = result.letters.filter(function (l) { return l.id === "b"; })[0];
  const c = result.letters.filter(function (l) { return l.id === "c"; })[0];
  assert.strictEqual(a.status, "delivered");
  assert.strictEqual(b.status, "sealed");
  assert.strictEqual(c.status, "opened"); // 既にopenedのものは変化しない
  assert.deepStrictEqual(result.newlyDeliveredIds, ["a"]);
});

test("checkDeliveryは元の配列・要素をイミュータブルに保つ", function () {
  const now = new Date();
  const past = new Date(now.getTime() - 1000).toISOString();
  const letters = [{ id: "a", status: "sealed", deliverAt: past }];
  const result = Letters.checkDelivery(letters, now);
  assert.strictEqual(letters[0].status, "sealed", "元データが変化していないこと");
  assert.strictEqual(result.letters[0].status, "delivered");
});

test("checkDeliveryは配達日を迎えた手紙が無ければ何も変えない", function () {
  const now = new Date("2026-08-11T00:00:00+09:00");
  const future = new Date(now.getTime() + 86400000).toISOString();
  const letters = [{ id: "a", status: "sealed", deliverAt: future }];
  const result = Letters.checkDelivery(letters, now);
  assert.deepStrictEqual(result.newlyDeliveredIds, []);
  assert.strictEqual(result.letters[0].status, "sealed");
});

test("openLetterはsealedの手紙を開封できない", function () {
  assert.throws(function () {
    Letters.openLetter({ status: "sealed" }, new Date());
  }, /配達されていない/);
});

test("openLetterはdeliveredをopenedに変え、openedAtを記録する", function () {
  const now = new Date("2026-08-18T10:00:00+09:00");
  const result = Letters.openLetter({ id: "x", status: "delivered" }, now);
  assert.strictEqual(result.status, "opened");
  assert.strictEqual(result.openedAt, now.toISOString());
});

test("openLetterは既にopenedならopenedAtを上書きしない", function () {
  const original = {
    id: "x",
    status: "opened",
    openedAt: "2026-01-01T00:00:00.000Z",
  };
  const result = Letters.openLetter(
    original,
    new Date("2026-08-18T00:00:00+09:00")
  );
  assert.strictEqual(result, original);
  assert.strictEqual(result.openedAt, "2026-01-01T00:00:00.000Z");
});

test("addReflectionは振り返りを追加し、元の手紙は変更しない", function () {
  const letter = { id: "x", reflections: [] };
  const now = new Date("2026-08-18T21:00:00+09:00");
  const updated = Letters.addReflection(
    letter,
    { nowThink: "少し落ち着いた", whatHappened: "", nextAction: "" },
    now
  );
  assert.strictEqual(updated.reflections.length, 1);
  assert.strictEqual(updated.reflections[0].nowThink, "少し落ち着いた");
  assert.strictEqual(updated.reflections[0].createdAt, now.toISOString());
  assert.strictEqual(letter.reflections.length, 0);
});

test("addReflectionは全項目が空文字なら例外を投げる", function () {
  assert.throws(function () {
    Letters.addReflection(
      { reflections: [] },
      { nowThink: "  ", whatHappened: "", nextAction: "" },
      new Date()
    );
  });
});

test("addReflectionは複数回の追記を時系列に積み重ねられる(往復書簡)", function () {
  let letter = { id: "x", reflections: [] };
  letter = Letters.addReflection(letter, { nowThink: "1回目" }, new Date());
  letter = Letters.addReflection(letter, { nowThink: "2回目" }, new Date());
  assert.strictEqual(letter.reflections.length, 2);
  assert.strictEqual(letter.reflections[0].nowThink, "1回目");
  assert.strictEqual(letter.reflections[1].nowThink, "2回目");
});

test("filterLettersはstatus/relation/emotionで絞り込める", function () {
  const letters = [
    { id: "a", status: "sealed", relation: "boss", emotionTags: ["anger"] },
    { id: "b", status: "delivered", relation: "friend", emotionTags: ["sad"] },
    { id: "c", status: "delivered", relation: "boss", emotionTags: ["sad"] },
  ];
  assert.strictEqual(
    Letters.filterLetters(letters, { status: "delivered" }).length,
    2
  );
  assert.strictEqual(
    Letters.filterLetters(letters, { relation: "boss" }).length,
    2
  );
  assert.strictEqual(
    Letters.filterLetters(letters, { emotion: "sad" }).length,
    2
  );
  assert.strictEqual(
    Letters.filterLetters(letters, { status: "delivered", relation: "boss" })
      .length,
    1
  );
});

test("filterLettersはstatusに配列を渡すといずれかに一致するものを返す(届いた手紙=未読+既読)", function () {
  const letters = [
    { id: "a", status: "sealed", relation: "boss", emotionTags: [] },
    { id: "b", status: "delivered", relation: "boss", emotionTags: [] },
    { id: "c", status: "opened", relation: "boss", emotionTags: [] },
  ];
  const result = Letters.filterLetters(letters, {
    status: ["delivered", "opened"],
  });
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(
    result.map(function (l) { return l.id; }).sort(),
    ["b", "c"]
  );
});

test("sortByCreatedAtDescは新しい順に並べる", function () {
  const letters = [
    { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", createdAt: "2026-03-01T00:00:00.000Z" },
    { id: "c", createdAt: "2026-02-01T00:00:00.000Z" },
  ];
  const sorted = Letters.sortByCreatedAtDesc(letters);
  assert.deepStrictEqual(
    sorted.map(function (l) { return l.id; }),
    ["b", "c", "a"]
  );
});

test("relationLabel/emotionLabelは日本語ラベルを返す", function () {
  assert.strictEqual(Letters.relationLabel("boss"), "上司");
  assert.strictEqual(Letters.emotionLabel("moya"), "モヤモヤ");
});

test("generateIdは呼び出すたびに異なるIDを返す", function () {
  const ids = {};
  let unique = 0;
  for (let i = 0; i < 50; i++) {
    const id = Letters.generateId("letter");
    if (!ids[id]) unique += 1;
    ids[id] = true;
  }
  assert.strictEqual(unique, 50);
});

summary("letters.js");
