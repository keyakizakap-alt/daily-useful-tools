"use strict";
/**
 * 外部依存なしの軽量テストヘルパー。
 * Node標準の assert モジュールのみを使用する。
 */
const assert = require("assert");

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log("  ✓ " + name);
  } catch (err) {
    failCount += 1;
    console.log("  ✗ " + name);
    console.log("    " + (err && err.message ? err.message : err));
  }
}

function summary(suiteName) {
  console.log("");
  console.log(
    "[" + suiteName + "] " + passCount + " passed, " + failCount + " failed"
  );
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

module.exports = { test: test, summary: summary, assert: assert };
