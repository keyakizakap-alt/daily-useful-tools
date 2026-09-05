"use strict";
/**
 * dashboard.js (傾向ダッシュボードの集計ロジック) のテスト。
 * 実行: node tests/dashboard.test.js
 */
const { test, summary, assert } = require("./_test-helpers.js");
const Dashboard = require("../src/js/dashboard.js");
const Letters = require("../src/js/letters.js");

console.log("dashboard.js のテスト");

function makeLetter(overrides) {
  return Object.assign(
    {
      id: "id-" + Math.random(),
      createdAt: "2026-08-11T10:00:00.000Z",
      relation: "boss",
      emotionTags: ["anger"],
      status: "sealed",
    },
    overrides
  );
}

test("aggregateByEmotionは手紙が無くても全感情タグを0件で返す", function () {
  const result = Dashboard.aggregateByEmotion([]);
  assert.strictEqual(result.length, Letters.EMOTIONS.length);
  result.forEach(function (r) {
    assert.strictEqual(r.count, 0);
  });
});

test("aggregateByEmotionはタグごとの件数を数え、多い順に並べる", function () {
  const letters = [
    makeLetter({ emotionTags: ["anger", "moya"] }),
    makeLetter({ emotionTags: ["anger"] }),
    makeLetter({ emotionTags: ["sad"] }),
  ];
  const result = Dashboard.aggregateByEmotion(letters);
  const anger = result.filter(function (r) { return r.id === "anger"; })[0];
  assert.strictEqual(anger.count, 2);
  assert.strictEqual(result[0].id, "anger", "最多のタグが先頭に来ること");
});

test("aggregateByRelationは手紙が無くても全関係性を0件で返す", function () {
  const result = Dashboard.aggregateByRelation([]);
  assert.strictEqual(result.length, Letters.RELATIONS.length);
});

test("aggregateByRelationは関係性ごとの件数を数える", function () {
  const letters = [
    makeLetter({ relation: "boss" }),
    makeLetter({ relation: "boss" }),
    makeLetter({ relation: "friend" }),
  ];
  const result = Dashboard.aggregateByRelation(letters);
  const boss = result.filter(function (r) { return r.id === "boss"; })[0];
  const friend = result.filter(function (r) { return r.id === "friend"; })[0];
  assert.strictEqual(boss.count, 2);
  assert.strictEqual(friend.count, 1);
});

test("aggregateByPeriod(week)は同じ週の手紙をまとめる", function () {
  const letters = [
    makeLetter({ createdAt: "2026-08-10T10:00:00.000Z" }), // 月曜
    makeLetter({ createdAt: "2026-08-12T10:00:00.000Z" }), // 同じ週の水曜
    makeLetter({ createdAt: "2026-08-20T10:00:00.000Z" }), // 翌週の木曜
  ];
  const result = Dashboard.aggregateByPeriod(letters, "week");
  assert.strictEqual(result.length, 2);
  const total = result.reduce(function (sum, r) { return sum + r.count; }, 0);
  assert.strictEqual(total, 3);
});

test("aggregateByPeriod(month)は同じ月の手紙をまとめ、キー昇順で返す", function () {
  const letters = [
    makeLetter({ createdAt: "2026-08-01T10:00:00.000Z" }),
    makeLetter({ createdAt: "2026-08-28T10:00:00.000Z" }),
    makeLetter({ createdAt: "2026-09-01T10:00:00.000Z" }),
  ];
  const result = Dashboard.aggregateByPeriod(letters, "month");
  assert.deepStrictEqual(result, [
    { key: "2026-08", count: 2 },
    { key: "2026-09", count: 1 },
  ]);
});

test("aggregateByPeriodは不正な日付を無視する", function () {
  const letters = [
    makeLetter({ createdAt: "invalid-date" }),
    makeLetter({ createdAt: "2026-08-01T10:00:00.000Z" }),
  ];
  const result = Dashboard.aggregateByPeriod(letters, "month");
  const total = result.reduce(function (sum, r) { return sum + r.count; }, 0);
  assert.strictEqual(total, 1);
});

summary("dashboard.js");
