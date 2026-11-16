// あしたのごみ: 規則の判定・検査・共有・.ics のテスト。assert の失敗メッセージには「直し方」を書く。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../src/rules.js");

const d = (s) => R.parseDate(s);
const cfg = (rules, breaks = []) => R.sanitizeConfig({ version: 1, rules, breaks });

test("parseDate は存在しない日付を null にする", () => {
  assert.equal(R.parseDate("2026-02-30"), null, "2/30 を受け付けた。直し方: parseDate の年月日の一致チェックを確認する");
  assert.equal(R.parseDate("2026-1-5"), null, "ゼロ埋めなしを受け付けた。直し方: DATE_RE を確認する");
  assert.equal(R.formatDate(d("2028-02-29")), "2028-02-29", "うるう日が往復しない。直し方: parseDate/formatDate を確認する");
});

test("第n週は「その月の何回目のその曜日か」で決まる", () => {
  // 2026-11 の水曜: 4, 11, 18, 25
  assert.equal(R.nthOfMonth(d("2026-11-04")), 1);
  assert.equal(R.nthOfMonth(d("2026-11-11")), 2);
  assert.equal(R.nthOfMonth(d("2026-11-25")), 4);
  const c = cfg([{ name: "資源ごみ", type: "nth", weekdays: [3], nths: [2, 4] }]);
  const hits = R.upcoming(c, d("2026-11-01"), 30).filter((x) => x.items.length).map((x) => x.date);
  assert.deepEqual(hits, ["2026-11-11", "2026-11-25"], "第2・第4水曜の判定がずれている。直し方: matchesRule の nth 分岐と nthOfMonth を確認する");
});

test("毎週の規則は指定した曜日すべてに当たる", () => {
  const c = cfg([{ name: "燃やすごみ", type: "weekly", weekdays: [1, 4] }]);
  const hits = R.upcoming(c, d("2026-11-16"), 7).filter((x) => x.items.length).map((x) => x.date);
  assert.deepEqual(hits, ["2026-11-16", "2026-11-19"], "月・木の判定がずれている。直し方: matchesRule の weekdays 判定を確認する");
});

test("隔週は基準日の週から1週おきに当たり、基準日より前にもさかのぼる", () => {
  const c = cfg([{ name: "びん・缶", type: "biweekly", weekdays: [5], anchor: "2026-11-20" }]);
  const hits = R.upcoming(c, d("2026-11-01"), 42).filter((x) => x.items.length).map((x) => x.date);
  assert.deepEqual(hits, ["2026-11-06", "2026-11-20", "2026-12-04"], "隔週の判定がずれている。直し方: matchesRule の biweekly 分岐（週の差の偶奇）を確認する");
});

test("隔週は年またぎ・夏時間のある地域でもずれない", () => {
  const c = cfg([{ name: "古紙", type: "biweekly", weekdays: [2], anchor: "2026-12-29" }]);
  assert.deepEqual(R.itemsOn(c, d("2027-01-12")), ["古紙"], "年をまたぐと隔週がずれた。直し方: dayNumber が UTC 基準で計算しているか確認する");
  assert.deepEqual(R.itemsOn(c, d("2027-01-05")), [], "隔週の休みの週に当たってしまった。直し方: biweekly の偶奇判定を確認する");
});

test("お休み期間は両端の日を含めて収集を消す", () => {
  const c = cfg([{ name: "燃やすごみ", type: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] }], [{ from: "2026-12-30", to: "2027-01-03" }]);
  assert.deepEqual(R.itemsOn(c, d("2026-12-29")), ["燃やすごみ"]);
  assert.deepEqual(R.itemsOn(c, d("2026-12-30")), [], "開始日に収集が残った。直し方: isOnBreak の比較（<=）を確認する");
  assert.deepEqual(R.itemsOn(c, d("2027-01-03")), [], "終了日に収集が残った。直し方: isOnBreak の比較（<=）を確認する");
  assert.deepEqual(R.itemsOn(c, d("2027-01-04")), ["燃やすごみ"]);
});

test("同じ名前の規則が同じ日に重なっても1回だけ表示する", () => {
  const c = cfg([
    { name: "資源ごみ", type: "weekly", weekdays: [3] },
    { name: "資源ごみ", type: "nth", weekdays: [3], nths: [1] },
  ]);
  assert.deepEqual(R.itemsOn(c, d("2026-11-04")), ["資源ごみ"], "重複して表示された。直し方: itemsOn の重複除外を確認する");
});

test("describeRule は日本語の説明を返す", () => {
  assert.equal(R.describeRule({ type: "weekly", weekdays: [4, 1] }), "毎週 月・木曜");
  assert.equal(R.describeRule({ type: "nth", weekdays: [3], nths: [4, 2] }), "第2・第4水曜");
  assert.equal(R.describeRule({ type: "biweekly", weekdays: [5], anchor: "2026-11-20" }), "隔週 金曜（11月20日の週を基準に1週おき）");
});

test("sanitizeConfig は不正な入力を日本語のメッセージで拒否する", () => {
  const bad = [
    null,
    [],
    { version: 2, rules: [] },
    { version: 1, rules: "x" },
    { version: 1, rules: [{ name: "", type: "weekly", weekdays: [1] }] },
    { version: 1, rules: [{ name: "あ".repeat(21), type: "weekly", weekdays: [1] }] },
    { version: 1, rules: [{ name: "ごみ", type: "daily", weekdays: [1] }] },
    { version: 1, rules: [{ name: "ごみ", type: "weekly", weekdays: [7] }] },
    { version: 1, rules: [{ name: "ごみ", type: "weekly", weekdays: ["1"] }] },
    { version: 1, rules: [{ name: "ごみ", type: "weekly", weekdays: [] }] },
    { version: 1, rules: [{ name: "ごみ", type: "nth", weekdays: [1], nths: [6] }] },
    { version: 1, rules: [{ name: "ごみ", type: "biweekly", weekdays: [1], anchor: "2026-13-01" }] },
    { version: 1, rules: [], breaks: [{ from: "2027-01-03", to: "2026-12-30" }] },
    { version: 1, rules: Array.from({ length: 31 }, () => ({ name: "ごみ", type: "weekly", weekdays: [1] })) },
  ];
  for (const input of bad) {
    assert.throws(
      () => R.sanitizeConfig(input),
      (err) => err.name === "GomiConfigError" && /[ぁ-んァ-ン一-龠]/.test(err.message),
      `不正な設定を受け付けた: ${JSON.stringify(input)?.slice(0, 80)}。直し方: sanitizeConfig / cleanRule の検査を追加する`,
    );
  }
});

test("sanitizeConfig は余計な項目・制御文字を取り除いた新しいオブジェクトを返す", () => {
  const input = JSON.parse('{"version":1,"rules":[{"name":" 燃やす\\u0000ごみ\\n ","type":"weekly","weekdays":[4,1,1],"onclick":"x","__proto__":{"polluted":true}}],"breaks":[],"extra":1}');
  const out = R.sanitizeConfig(input);
  assert.deepEqual(out, { version: 1, rules: [{ id: "r1", name: "燃やすごみ", type: "weekly", weekdays: [1, 4] }], breaks: [] },
    "許可していない項目が残った。直し方: cleanRule で許可した項目だけを新しいオブジェクトに入れる");
  assert.equal({}.polluted, undefined, "プロトタイプが汚染された。直し方: 入力オブジェクトを Object.assign 等でコピーしない");
});

test("共有文字列は日本語を含めて往復でき、URLに使える文字だけでできている", () => {
  const c = cfg(
    [
      { name: "燃やすごみ", type: "weekly", weekdays: [1, 4] },
      { name: "びん・缶", type: "biweekly", weekdays: [5], anchor: "2026-11-20" },
      { name: "資源ごみ", type: "nth", weekdays: [3], nths: [2, 4] },
    ],
    [{ from: "2026-12-30", to: "2027-01-03" }],
  );
  const s = R.encodeShare(c);
  assert.match(s, /^[A-Za-z0-9_-]+$/, "URL に使えない文字が入った。直し方: utf8ToBase64Url の置換を確認する");
  assert.deepEqual(R.decodeShare(s), c, "共有の往復で内容が変わった。直し方: encodeShare / decodeShare を確認する");
});

test("細工された共有文字列は読み込まずに例外を投げる", () => {
  const enc = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  const cases = [
    "",
    "not base64!",
    "A".repeat(R.LIMITS.shareLength + 1),
    Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url"),
    enc({ version: 1, rules: [{ name: "<img src=x onerror=alert(1)>".repeat(2), type: "weekly", weekdays: [1] }] }),
    enc({ version: 1, rules: [{ name: "ごみ", type: "weekly", weekdays: [1, 2, 3, 4, 5, 6, 0, 1] }] }),
    enc("文字列"),
  ];
  for (const s of cases) {
    assert.throws(() => R.decodeShare(s), { name: "GomiConfigError" },
      `細工された共有文字列を受け付けた: ${s.slice(0, 40)}。直し方: decodeShare の長さ・文字種・UTF-8・sanitizeConfig の検査を確認する`);
  }
});

test("HTML のような種類名も文字列のまま保持される（描画は textContent で行う）", () => {
  const c = cfg([{ name: "<b>缶</b>", type: "weekly", weekdays: [1] }]);
  assert.equal(c.rules[0].name, "<b>缶</b>");
});

test("toICS は RFC 5545 の形式（CRLF・エスケープ・75オクテットの折り返し）で出力する", () => {
  const c = cfg([{ name: "缶,びん;古紙\\", type: "weekly", weekdays: [1] }]);
  const ics = R.toICS(c, d("2026-11-16"), 7, { alarm: true, now: new Date(Date.UTC(2026, 10, 16, 0, 0, 0)) });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"), "VCALENDAR の囲みか CRLF が無い。直し方: toICS の lines と join を確認する");
  assert.ok(!/[^\r]\n/.test(ics), "LF だけの改行がある。直し方: 改行を \\r\\n で統一する");
  assert.match(ics, /SUMMARY:缶\\,びん\\;古紙\\\\の日\r\n/, "特殊文字がエスケープされていない。直し方: escapeICS を確認する");
  assert.match(ics, /DTSTART;VALUE=DATE:20261116\r\nDTEND;VALUE=DATE:20261117/, "終日予定の日付が違う。直し方: icsDate と addDays を確認する");
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\n/, "通知が入っていない。直し方: options.alarm の分岐を確認する");
  assert.match(ics, /TRIGGER:-PT4H/, "前夜20時の通知になっていない。直し方: TRIGGER を確認する");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1, "7日間で月曜は1回のはず。直し方: toICS のループを確認する");
  const noAlarm = R.toICS(c, d("2026-11-16"), 7, { alarm: false });
  assert.ok(!noAlarm.includes("VALARM"), "通知なしを選んでも VALARM が入った。直し方: options.alarm の分岐を確認する");
});

test("foldLine は UTF-8 で75オクテットを超えないように折り返す", () => {
  const line = "SUMMARY:" + "燃やさないごみ".repeat(10);
  const folded = R.foldLine(line);
  for (const part of folded.split("\r\n")) {
    assert.ok(Buffer.byteLength(part, "utf8") <= 75, `75オクテットを超える行がある（${Buffer.byteLength(part, "utf8")}）。直し方: foldLine の limit を確認する`);
  }
  assert.equal(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join(""), line, "折り返しを戻すと元の行にならない。直し方: 続きの行の先頭に空白1文字だけを入れる");
});

test("toICS は お休み期間を除外し、日数の上限を守る", () => {
  const c = cfg([{ name: "燃やすごみ", type: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] }], [{ from: "2026-11-17", to: "2026-11-18" }]);
  const ics = R.toICS(c, d("2026-11-16"), 5, {});
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3, "お休み期間が除外されていない。直し方: toICS が itemsOn を使っているか確認する");
  const big = R.toICS(c, d("2026-11-16"), 100000, {});
  assert.ok((big.match(/BEGIN:VEVENT/g) || []).length <= R.LIMITS.icsDays, "日数の上限を超えた。直し方: toICS の count の上限を確認する");
});

test("UID は規則の並び順に依存せず、種類名と日付で決まる", () => {
  const a = cfg([{ name: "燃やすごみ", type: "weekly", weekdays: [1] }, { name: "資源ごみ", type: "weekly", weekdays: [1] }]);
  const b = cfg([{ name: "資源ごみ", type: "weekly", weekdays: [1] }]);
  const uid = (ics, name) => ics.split("BEGIN:VEVENT").find((e) => e.includes(`SUMMARY:${name}の日`)).match(/UID:(\S+)/)[1];
  const opts = { now: new Date(0) };
  assert.equal(uid(R.toICS(a, d("2026-11-16"), 1, opts), "資源ごみ"), uid(R.toICS(b, d("2026-11-16"), 1, opts), "資源ごみ"),
    "規則を削除すると UID が変わり、取り込み直したカレンダーで予定が重複する。直し方: UID を日付と種類名のハッシュで作る");
});

test("見えない文字・双方向制御文字は種類名から取り除く", () => {
  const c = cfg([{ name: "\u202e缶\u200b\ufeff", type: "weekly", weekdays: [1] }]);
  assert.equal(c.rules[0].name, "缶", "見えない文字が残った。直し方: cleanName の除去範囲に U+200B〜U+200F, U+202A〜U+202E, U+2060〜U+2069, U+FEFF を含める");
  assert.throws(() => cfg([{ name: "\u200b\u200b", type: "weekly", weekdays: [1] }]), { name: "GomiConfigError" },
    "見えない文字だけの名前を受け付けた。直し方: 除去後に空なら拒否する");
});

test("最大件数・最大文字数の設定でも共有リンクを作れる", () => {
  const rules = Array.from({ length: R.LIMITS.rules }, (_, i) => ({ name: "燃やさないごみ大型".padEnd(18, "あ") + i, type: "nth", weekdays: [0, 1, 2, 3, 4, 5, 6], nths: [1, 2, 3, 4, 5] }));
  const c = cfg(rules.map((r) => ({ ...r, name: r.name.slice(0, 20) })));
  assert.doesNotThrow(() => R.encodeShare(c), "上限内の設定が共有できない。直し方: LIMITS.shareLength を上限の設定が収まる長さにする");
});
