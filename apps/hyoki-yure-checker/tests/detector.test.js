import test from "node:test";
import assert from "node:assert/strict";
import {
  fullwidthCharToHalfwidth,
  normalizeAlnum,
  normalizeChoon,
  findAlnumWidthInconsistencies,
  findKatakanaChoonInconsistencies,
  analyzeText,
  applyUnification,
  defaultReplacementsForFinding,
} from "../src/lib/detector.js";

test("fullwidthCharToHalfwidth: 全角英数字を半角に変換する", () => {
  assert.equal(fullwidthCharToHalfwidth("Ａ"), "A");
  assert.equal(fullwidthCharToHalfwidth("１"), "1");
  assert.equal(fullwidthCharToHalfwidth("a"), "a");
  assert.equal(fullwidthCharToHalfwidth("あ"), "あ");
});

test("normalizeAlnum: 全角混じりの文字列全体を半角化する", () => {
  assert.equal(normalizeAlnum("Ａ１２ｂ"), "A12b");
  assert.equal(normalizeAlnum("abc123"), "abc123");
});

test("normalizeChoon: 長音符号を取り除く", () => {
  assert.equal(normalizeChoon("サーバー"), "サバ");
  assert.equal(normalizeChoon("サーバ"), "サバ");
  assert.equal(normalizeChoon("テスト"), "テスト");
});

test("findAlnumWidthInconsistencies: 全角/半角混在を検出する", () => {
  const text = "Ａ社と提携し、A社の株価は１２３円になった。B社は123円のままだった。";
  const findings = findAlnumWidthInconsistencies(text);

  const aFinding = findings.find((f) => f.key === "A");
  assert.ok(aFinding, "「A」のグループが検出されること");
  assert.equal(aFinding.type, "width");
  const surfaces = aFinding.variants.map((v) => v.surface).sort();
  assert.deepEqual(surfaces, ["A", "Ａ"]);

  const numFinding = findings.find((f) => f.key === "123");
  assert.ok(numFinding, "「123」のグループが検出されること");

  // B社/123 は片方の表記しか出現しないため検出されない
  assert.ok(!findings.some((f) => f.key === "B"));
});

test("findAlnumWidthInconsistencies: 表記ゆれがなければ検出しない", () => {
  const findings = findAlnumWidthInconsistencies("2026年のA社は123円だった。");
  assert.deepEqual(findings, []);
});

test("findKatakanaChoonInconsistencies: 長音符号の有無による表記ゆれを検出する", () => {
  const text =
    "サーバの負荷が高いのでサーバーを増設した。ユーザーからの問い合わせが増えた。";
  const findings = findKatakanaChoonInconsistencies(text);

  const serverFinding = findings.find((f) => f.key === "サバ");
  assert.ok(serverFinding, "「サーバ/サーバー」のグループが検出されること");
  assert.equal(serverFinding.type, "choon");
  const countBySurface = Object.fromEntries(
    serverFinding.variants.map((v) => [v.surface, v.count]),
  );
  assert.equal(countBySurface["サーバ"], 1);
  assert.equal(countBySurface["サーバー"], 1);

  // 「ユーザー」は1表記しか出現しないため検出されない
  assert.ok(!findings.some((f) => f.key === "ユザ"));
});

test("analyzeText: 全角半角と長音の両方の表記ゆれをまとめて返す", () => {
  const text = "Ａ社のサーバはA社のサーバーより高性能だ。";
  const findings = analyzeText(text);
  assert.ok(findings.some((f) => f.type === "width"));
  assert.ok(findings.some((f) => f.type === "choon"));
});

test("analyzeText: 表記ゆれのない文章では空配列を返す", () => {
  assert.deepEqual(analyzeText("今日は天気が良い。"), []);
});

test("applyUnification: 指定した表記にすべて置換する", () => {
  const text = "サーバの負荷が高いのでサーバーを増設した。";
  const result = applyUnification(text, [{ from: "サーバ", to: "サーバー" }]);
  assert.equal(result, "サーバーの負荷が高いのでサーバーを増設した。");
});

test("applyUnification: 短い表記が長い表記の一部として誤爆しない", () => {
  // 「サーバ」を「サーバー」に統一する際、既存の「サーバー」の中の
  // 「サーバ」まで二重に置換されて「サーバーー」にならないことを確認する
  const text = "サーバとサーバーが両方ある。";
  const result = applyUnification(text, [{ from: "サーバ", to: "サーバー" }]);
  assert.equal(result, "サーバーとサーバーが両方ある。");
});

test("applyUnification: from と to が同じ置換は無視する", () => {
  const text = "サーバーのみ。";
  const result = applyUnification(text, [{ from: "サーバー", to: "サーバー" }]);
  assert.equal(result, text);
});

test("defaultReplacementsForFinding: 出現回数最多の表記を統一先にする", () => {
  const finding = {
    type: "choon",
    key: "サバ",
    variants: [
      { surface: "サーバー", count: 3 },
      { surface: "サーバ", count: 1 },
    ],
  };
  const replacements = defaultReplacementsForFinding(finding);
  assert.deepEqual(replacements, [{ from: "サーバ", to: "サーバー" }]);
});

test("統合シナリオ: 検出してから統一すると表記ゆれが解消される", () => {
  let text = "サーバの負荷が高いのでサーバーを増設した。Ａ社と提携しA社の株価が上がった。";
  let findings = analyzeText(text);
  assert.equal(findings.length, 2);

  for (const finding of findings) {
    text = applyUnification(text, defaultReplacementsForFinding(finding));
  }

  findings = analyzeText(text);
  assert.deepEqual(findings, []);
});
