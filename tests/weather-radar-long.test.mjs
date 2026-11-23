// そらならべ: 雨雲レーダーの「24時間」（気象庁 降水短時間予報の時刻一覧の読み取り）のテスト。
// weather/app.js はブラウザ用のスクリプトなので、対象の関数だけを取り出して実行する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../weather/app.js", import.meta.url), "utf8");
function extract(name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " が weather/app.js に見つからない。直し方: 関数名を変えたらこのテストも合わせる");
  const end = src.indexOf("\n}\n", start);
  return src.slice(start, end + 2);
}
const ctx = {};
vm.runInNewContext(extract("parseLongTimes") + "\nthis.parseLongTimes = parseLongTimes;", ctx);
// vm の中で作られた配列は別の realm のものなので、JSON を通して比較できる形にする
const parse = (...a) => JSON.parse(JSON.stringify(ctx.parseLongTimes(...a)));
const row = (b, v, member = "none", elements = ["rasrf"]) => ({ basetime: b, validtime: v, member, elements });

test("時刻ごとに、いちばん新しい発表のコマを1つだけ選ぶ", () => {
  const out = parse([
    row("20261123220000", "20261124000000"),
    row("20261123230000", "20261124000000"),            // 同じ時刻の新しい発表
    row("20261123230000", "20261124000000"),            // 重複
    row("20261123231000", "20261124010000", "immed"),   // 6時間先までの、より新しい発表
    row("20261123230000", "20261124010000"),
    row("20261123230000", "20261123230000"),            // 解析値（basetime == validtime）
  ]);
  assert.deepEqual(out.map(t => t.validtime + "/" + t.basetime + "/" + t.member),
    ["20261124000000/20261123230000/none", "20261124010000/20261123231000/immed"],
    "重複・古い発表・解析値の扱いが違う: " + JSON.stringify(out) + "。直し方: parseLongTimes の byValid の比較（basetime が新しい方を残す）を確認する");
  assert.ok(out.every(t => t.kind === "long"), "kind が long になっていない。直し方: nowcUrl が rasrf の URL を選べなくなるので kind を付ける");
});

test("ナウキャストの最後より後の時刻だけを使い、不正な行は捨てる", () => {
  const out = parse([
    row("20261123230000", "20261124000000"),
    row("20261123230000", "20261124010000"),
    row("20261123230000", "20261124020000", "../x"),          // member に記号
    row("2026112323", "20261124030000"),                        // 桁が違う
    row("20261123230000", "20261124040000", "none", ["hrpns"]), // 別の要素
    null,
  ], "20261124000500");
  assert.deepEqual(out.map(t => t.validtime), ["20261124010000"],
    "ナウキャストと重なる時刻や不正な行が残っている: " + JSON.stringify(out) + "。直し方: parseLongTimes の after と検証の正規表現を確認する");
  assert.deepEqual(parse("not an array"), [], "配列でない入力で空にならない。直し方: Array.isArray で確かめる");
});
