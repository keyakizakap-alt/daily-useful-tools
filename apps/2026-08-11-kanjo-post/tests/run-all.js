"use strict";
/**
 * tests/ 配下の全テストファイルを個別のNodeプロセスとして順に実行し、結果を集計する。
 * 実行: node tests/run-all.js
 */
const { spawnSync } = require("child_process");
const path = require("path");

const files = [
  "letters.test.js",
  "dashboard.test.js",
  "backup.test.js",
  "storage.test.js",
];

let overallFailed = false;

files.forEach(function (file) {
  console.log("\n=== " + file + " ===");
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    overallFailed = true;
  }
});

console.log("\n==============================");
if (overallFailed) {
  console.log("一部のテストが失敗しました。");
  process.exitCode = 1;
} else {
  console.log("すべてのテストが成功しました。");
  process.exitCode = 0;
}
