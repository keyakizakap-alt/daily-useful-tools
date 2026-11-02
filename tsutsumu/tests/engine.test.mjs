// つつむ engine.js の単体テスト（node:test、依存パッケージなし）
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const T = require("../src/engine.js");
const ENGINE = "tsutsumu/src/engine.js";

test("全ての場面・関係・年代の組み合わせで plan() が例外なく結果を返す", () => {
  for (const occasion of Object.keys(T.OCCASIONS)) {
    for (const { key } of T.relationsFor(occasion)) {
      for (const age of Object.keys(T.AGES)) {
        for (const religion of Object.keys(T.RELIGIONS)) {
          const p = T.plan({ occasion, relation: key, age, religion });
          const [min, max] = p.suggestion.range;
          assert.ok(
            p.amount >= min && p.amount <= max,
            `${occasion}/${key}/${age} のおすすめ ${p.amount} が目安 ${min}〜${max} の外にある。直し方: ${ENGINE} の SOBA と STEPS の範囲が重なるよう修正する`,
          );
          assert.ok(
            !p.checks.some((c) => c.level === "ng"),
            `${occasion}/${key}/${age} のおすすめ ${p.amount} が「避ける」金額になっている。直し方: STEPS から 4・9 を含む金額を外す`,
          );
          assert.equal(typeof p.omotegaki.main, "string", `表書きが空。直し方: omotegaki() の ${occasion} の分岐を確認する`);
        }
      }
    }
  }
});

test("UC-1: 同僚の結婚式（20代）は 3万円・1万円札×3・新札・寿・金参萬圓也", () => {
  const p = T.plan({ occasion: "wedding", relation: "coworker", age: "20s" });
  assert.equal(p.amount, 30000, `おすすめが ${p.amount}。直し方: SOBA.wedding.coworker を [30000, 30000] にする`);
  assert.deepEqual(p.bills.bills, [{ value: 10000, count: 3 }], "お札の内訳が違う。直し方: billPlan() の金種の順序を確認する");
  assert.equal(p.bills.newBill, "new", "結婚式は新札。直し方: billPlan() の newBill の判定を確認する");
  assert.equal(p.omotegaki.main, "寿", "表書きが違う。直し方: omotegaki() の wedding を確認する");
  assert.equal(p.daiji, "金参萬圓也", "大字が違う。直し方: toDaiji() を確認する");
  assert.equal(p.envelope.noshi, true, "結婚祝いはのし付き。直し方: envelope() の celebration を確認する");
  assert.equal(p.returnGift.needed, false, "出席した結婚式のお返しは不要。直し方: returnGift() の wedding を確認する");
});

test("UC-2: 香典（宗教不明）は薄墨・御霊前・新札を避ける・のしなし、浄土真宗は御仏前", () => {
  const p = T.plan({ occasion: "funeral", relation: "friend", age: "30s", religion: "unknown" });
  assert.equal(p.omotegaki.main, "御霊前", "宗教不明の香典は御霊前。直し方: omotegaki() の funeral.unknown を確認する");
  assert.equal(p.omotegaki.inkLevel, "light", "通夜・葬儀は薄墨。直し方: omotegaki() の funeral の ink を light にする");
  assert.match(p.omotegaki.note, /浄土真宗/, "浄土真宗の注意がない。直し方: funeral.unknown の note に浄土真宗の例外を書く");
  assert.equal(p.bills.newBill, "used", "香典は新札を避ける。直し方: billPlan() の funeral を used にする");
  assert.equal(p.envelope.noshi, false, "弔事はのしなし。直し方: envelope() の condolence を確認する");
  assert.match(p.bills.direction, /裏/, "弔事のお札の向きの説明がない。直し方: billPlan() の direction を確認する");
  const shin = T.omotegaki("funeral", "jodo_shinshu");
  assert.equal(shin.main, "御仏前", "浄土真宗は御仏前。直し方: omotegaki() の funeral.jodo_shinshu を確認する");
  assert.equal(T.omotegaki("funeral", "christian").main, "御花料", "キリスト教式は御花料");
  assert.equal(T.omotegaki("funeral", "shinto").main, "御玉串料", "神式は御玉串料");
  assert.equal(T.omotegaki("memorial", "buddhist").inkLevel, "dark", "法要（四十九日以降）は濃い墨。直し方: omotegaki() の memorial を確認する");
  assert.equal(T.omotegaki("funeral", "<script>").main, "御霊前", "不明な宗教キーは unknown 扱い。直し方: RELIGIONS にないキーを unknown に寄せる");
});

test("UC-3: お年玉（小学1〜3年）はポチ袋・三つ折り・表に子どもの名前", () => {
  const p = T.plan({ occasion: "otoshidama", relation: "elem_low" });
  assert.ok([2000, 3000].includes(p.amount), `お年玉の額が ${p.amount}。直し方: OTOSHIDAMA.elem_low を確認する`);
  assert.equal(p.envelope.type, "ポチ袋", "お年玉はポチ袋");
  assert.match(p.bills.direction, /三つ折り/, "お札の折り方の説明がない。直し方: billPlan() の otoshidama を確認する");
  assert.match(p.names[0], /子ども/, "名前の書き方が違う。直し方: nameGuide() の otoshidama を確認する");
  assert.equal(p.joint, null, "お年玉は連名にしない。直し方: plan() の people の判定を確認する");
});

test("UC-4: 4・9 は「避ける」、代わりの金額を上下で返す", () => {
  for (const [yen, occ, code] of [[40000, "wedding", "four"], [4000, "funeral", "four"], [90000, "wedding", "nine"], [9000, "birth", "nine"], [140000, "wedding", "four"]]) {
    const checks = T.checkAmount(yen, occ);
    assert.ok(checks.some((c) => c.level === "ng" && c.code === code), `${yen}円（${occ}）が ${code} として検出されない: ${JSON.stringify(checks)}。直し方: checkAmount() の 4・9 判定を確認する`);
  }
  assert.deepEqual(T.safeNeighbors(40000, "wedding"), [30000, 50000], "4万円の代わりは3万円・5万円。直し方: safeNeighbors() を確認する");
  assert.deepEqual(T.safeNeighbors(4000, "funeral"), [3000, 5000], "4千円の代わりは3千円・5千円");
  const p = T.plan({ occasion: "wedding", relation: "friend", amount: 40000 });
  assert.deepEqual(p.safeAlternatives, [30000, 50000], "plan() に代わりの金額が入らない。直し方: plan() の safeAlternatives を確認する");
});

test("慶事の偶数: 2万は参考（3枚にする案）、8万は参考、10万は指摘しない、弔事の2万は注意", () => {
  const c2 = T.checkAmount(20000, "wedding");
  assert.ok(c2.some((c) => c.code === "even2" && c.level === "info"), "2万円の参考がない（レビュー #10 で注意→参考に変更）。直し方: checkAmount() の even2 を確認する");
  assert.deepEqual(T.billPlan(20000, "wedding").bills, [{ value: 10000, count: 1 }, { value: 5000, count: 2 }], "2万円は1万円札1枚＋5千円札2枚。直し方: billPlan() の特例を確認する");
  assert.ok(T.checkAmount(80000, "wedding").some((c) => c.code === "even8" && c.level === "info"), "8万円は参考扱い");
  assert.equal(T.checkAmount(100000, "wedding").length, 0, "10万円は指摘しない。直し方: man === 10 を偶数判定から外す");
  assert.ok(T.checkAmount(60000, "wedding").some((c) => c.code === "even"), "6万円は偶数の注意");
  assert.ok(T.checkAmount(20000, "funeral").some((c) => c.code === "even2c"), "弔事の2万円は注意");
  assert.equal(T.checkAmount(20000, "birth").length, 0, "出産祝いの2万円は指摘しない");
});

test("金額の点検: 端数・不正値・目安との差", () => {
  assert.ok(T.checkAmount(12500, "birth").some((c) => c.code === "fraction"), "千円未満の端数は注意。直し方: checkAmount() の fraction を確認する");
  assert.ok(!T.checkAmount(2500, "otoshidama").some((c) => c.code === "fraction"), "お年玉は500円単位を許す");
  assert.ok(T.checkAmount(35000, "wedding").some((c) => c.code === "notround"), "結婚の3万5千円はきりのよい金額でない注意");
  for (const bad of [0, -1000, 1.5, NaN, "30000", null, 10000001]) {
    const r = T.checkAmount(bad, "wedding");
    assert.equal(r[0].code, "invalid", `不正な金額 ${String(bad)} を受け付けた。直し方: isValidYen() を確認する`);
  }
  assert.ok(T.checkAmount(3000, "wedding", [30000, 30000]).some((c) => c.code === "below"), "目安より少ないときの参考がない");
  assert.ok(T.checkAmount(100000, "birth", [5000, 10000]).some((c) => c.code === "above"), "目安より大幅に多いときの参考がない");
});

test("toDaiji: 大字表記と範囲外の拒否", () => {
  const cases = { 1000: "金壱阡圓也", 3000: "金参阡圓也", 5000: "金伍阡圓也", 10000: "金壱萬圓也", 15000: "金壱萬伍阡圓也", 30000: "金参萬圓也", 100000: "金壱拾萬圓也", 123456: "金壱拾弐萬参阡肆佰伍拾陸圓也", 1000000: "金壱佰萬圓也" };
  for (const [yen, want] of Object.entries(cases)) {
    assert.equal(T.toDaiji(Number(yen)), want, `${yen} の大字が違う。直し方: toDaiji() / group4() を確認する`);
  }
  for (const bad of [0, -1, 1.2, 100000000, "1000"]) {
    assert.throws(() => T.toDaiji(bad), RangeError, `範囲外 ${String(bad)} を拒否しない。直し方: toDaiji() の入力検査を確認する`);
  }
});

test("UC-5: 連名の合計は避ける金額を飛ばし、1人あたりを100円単位で切り上げる", () => {
  assert.deepEqual(T.jointPlan("funeral", 6, 3000), { total: 18000, share: 3000, surplus: 0, raw: 18000 }, "6人×3千円の香典。直し方: jointPlan() を確認する");
  const w = T.jointPlan("wedding", 8, 5000);
  assert.equal(w.total, 50000, `8人×5千円=4万円は避け5万円にする（実際 ${w.total}）。直し方: jointPlan() の ng 回避を確認する`);
  assert.equal(w.share, 6300, "5万円÷8人=6,250円→6,300円");
  const f = T.jointPlan("funeral", 3, 3000);
  assert.equal(f.total, 10000, `3人×3千円=9千円は避ける（実際 ${f.total}）`);
  assert.throws(() => T.jointPlan("funeral", 1, 3000), RangeError, "1人は連名でない");
  assert.throws(() => T.jointPlan("funeral", 101, 3000), RangeError, "101人以上は拒否");
  const p = T.plan({ occasion: "funeral", relation: "coworker", people: 6 });
  assert.equal(p.amount, 18000, "連名のとき plan() の金額は合計額。直し方: plan() の base を確認する");
  assert.ok(p.names.some((n) => /一同/.test(n)), "4名以上は「一同」。直し方: nameGuide() を確認する");
  assert.ok(!p.checks.some((c) => c.code === "above" || c.code === "below"), "連名の合計を1人分の目安と比べない");
});

test("UC-6: お返しの目安（半返し〜3分の1、500円単位）", () => {
  const b = T.returnGift("birth", 10000);
  assert.equal(b.needed, true);
  assert.deepEqual(b.range, [3500, 5000], `出産祝い1万円の内祝い目安が ${b.range}。直し方: returnGift() の丸めを確認する`);
  assert.deepEqual(T.returnGift("funeral", 5000).range, [1500, 2500], "香典5千円の香典返し目安");
  assert.equal(T.returnGift("school", 10000).needed, false, "入学祝いのお返しは不要");
  assert.equal(T.returnGift("otoshidama", 3000).needed, false, "お年玉のお返しは不要");
});

test("袋の格と水引: 金額と場面で変わる", () => {
  assert.match(T.envelope("wedding", 10000).grade, /印刷/, "1万円の祝儀袋は印刷の水引");
  assert.match(T.envelope("wedding", 100000).grade, /大判/, "10万円は大判の祝儀袋");
  assert.match(T.envelope("birth", 5000).mizuhiki, /蝶結び/, "出産祝いは蝶結び。直し方: envelope() の gift を確認する");
  assert.match(T.envelope("illness", 5000).mizuhiki, /結び切り/, "お見舞いは結び切り");
  assert.equal(T.envelope("illness", 5000).noshi, false, "お見舞いはのしなし");
  assert.match(T.envelope("funeral", 30000).color, /双銀/, "3万円以上の香典は双銀");
});

test("お札: 枚数・新札・端数", () => {
  assert.equal(T.billPlan(5000, "illness").newBill, "mimai", "お見舞いは新札を避ける（専用の説明）");
  assert.doesNotMatch(T.billPlan(5000, "illness").newBillText, /不幸/, "お見舞いの説明に弔事の文が混ざっている（レビュー #12）。直し方: BILL_NEW.mimai を使う");
  assert.equal(T.billPlan(10000, "memorial").newBill, "soft", "法要は折り目をつけた新札でも可");
  assert.deepEqual(T.billPlan(2500, "otoshidama").bills, [{ value: 1000, count: 2 }, { value: 500, count: 1 }], "お年玉は500円玉も使う");
  const odd = T.billPlan(12300, "birth");
  assert.equal(odd.remainder, 300, "千円未満は端数として返す");
  assert.ok(odd.notes.some((n) => /端数/.test(n)), "端数の注意がない");
  assert.throws(() => T.billPlan(0, "birth"), RangeError, "0円は拒否");
});

test("不明な場面・関係は RangeError", () => {
  assert.throws(() => T.plan({ occasion: "unknown", relation: "friend" }), RangeError, "不明な場面を拒否しない。直し方: occ() を確認する");
  assert.throws(() => T.plan({ occasion: "school", relation: "boss" }), RangeError, "選べない関係を拒否しない。直し方: suggestAmount() を確認する");
  assert.throws(() => T.relationsFor("__proto__"), RangeError, "__proto__ を場面として受け付けた");
  assert.equal(T.sobaRange("wedding", "__proto__"), null, "__proto__ を関係として受け付けた");
});

test("validateRecord: 正常な記録を受け付け、制御文字を除去する", () => {
  const r = T.validateRecord({ id: "abc-123", direction: "received", date: "2026-11-02", person: " 佐藤‮さん\u0000 ", occasion: "birth", amount: 10000, note: "品物も" });
  assert.equal(r.ok, true, `正常な記録を拒否した: ${JSON.stringify(r.errors)}。直し方: validateRecord() を確認する`);
  assert.equal(r.value.person, "佐藤さん", "制御文字・双方向制御文字が残っている。直し方: UNSAFE_CHARS を確認する");
});

test("validateRecord: 不正な記録を拒否する", () => {
  const base = { id: "a1", direction: "gave", date: "2026-11-02", person: "田中", occasion: "wedding", amount: 30000, note: "" };
  const bad = [
    { direction: "stolen" }, { date: "2026-02-30" }, { date: "2026/11/02" }, { person: "" }, { person: "あ".repeat(41) },
    { occasion: "__proto__" }, { occasion: "toString" }, { amount: -1 }, { amount: 1.5 }, { amount: "30000" }, { amount: 10000001 }, { note: "い".repeat(201) },
  ];
  for (const patch of bad) {
    const r = T.validateRecord({ ...base, ...patch });
    assert.equal(r.ok, false, `不正な記録 ${JSON.stringify(patch).slice(0, 60)} を受け付けた。直し方: validateRecord() の検査を追加する`);
  }
  assert.equal(T.validateRecord(null).ok, false, "null を受け付けた");
  assert.equal(T.validateRecord([]).ok, false, "配列を受け付けた");
  assert.equal(T.validateRecord({ ...base, id: "../../x" }).value.id, null, "不正な id を通した。直し方: id の正規表現を確認する");
});

test("parseRecords: 不正な行を読み飛ばし、件数上限・プロトタイプ汚染に耐える", () => {
  const good = { id: "r1", direction: "gave", date: "2026-01-01", person: "鈴木", occasion: "otoshidama", amount: 3000, note: "" };
  const json = JSON.stringify({ version: 1, records: [good, { ...good, id: "r2", amount: "x" }, { ...good, id: undefined }, 42, null] });
  const res = T.parseRecords(json);
  assert.equal(res.records.length, 1, `正常な1件だけ取り込むはず（実際 ${res.records.length}）。直し方: parseRecords() を確認する`);
  assert.equal(res.skipped, 4, "読み飛ばした件数が違う");
  assert.equal(T.parseRecords("{not json").error !== null, true, "壊れた JSON でエラーを返さない");
  assert.equal(T.parseRecords('{"foo":1}').error !== null, true, "records がない JSON でエラーを返さない");
  const many = JSON.stringify(Array.from({ length: 520 }, (_, i) => ({ ...good, id: "id" + i })));
  const m = T.parseRecords(many);
  assert.equal(m.records.length, T.RECORD_LIMITS.maxRecords, "上限を超えて取り込んだ。直し方: maxRecords の判定を確認する");
  assert.equal(m.skipped, 20, "上限超過分を skipped に数えていない");
  const polluted = T.parseRecords('[{"__proto__":{"polluted":true},"id":"p1","direction":"gave","date":"2026-01-01","person":"x","occasion":"birth","amount":1000}]');
  assert.equal(polluted.records.length, 1, "__proto__ を含む行の扱いが違う");
  assert.equal({}.polluted, undefined, "プロトタイプ汚染が起きた。直し方: 既知のキーだけを新しいオブジェクトへ写す");
  assert.deepEqual(Object.keys(polluted.records[0]).sort(), ["amount", "date", "direction", "id", "note", "occasion", "person"], "未知のキーが残っている");
});

test("formatYen: 万円表記", () => {
  assert.equal(T.formatYen(30000), "3万円");
  assert.equal(T.formatYen(15000), "15,000円");
  assert.equal(T.formatYen(3000), "3,000円");
});

// ---- レビュー指摘の回帰テスト（feedback/review_report.md） ----

test("レビュー #1/#3: 範囲外の入力でも plan() は例外を投げず inputErrors を返す", () => {
  const cases = [
    { people: 11, perPerson: 1000000 }, { people: 100, perPerson: 100001 }, { amount: 20000000 },
    { amount: -5 }, { amount: 1.5 }, { people: 0 }, { people: 1000 },
  ];
  for (const c of cases) {
    let p;
    assert.doesNotThrow(() => { p = T.plan({ occasion: "funeral", relation: "friend", ...c }); }, `入力 ${JSON.stringify(c)} で例外。直し方: plan() の入力検査を確認する`);
    assert.ok(p.inputErrors.length > 0, `入力 ${JSON.stringify(c)} の誤りが inputErrors に入らない。直し方: plan() の検査を確認する`);
    assert.ok(p.amount > 0 && p.amount <= T.MAX_YEN, "表示する金額が範囲外");
  }
  assert.deepEqual(T.plan({ occasion: "wedding", relation: "friend" }).inputErrors, [], "正常な入力で inputErrors が出た");
});

test("レビュー #2: 連名で金額を指定したら、合計はその金額・1人あたりは割り算", () => {
  const p = T.plan({ occasion: "wedding", relation: "friend", people: 5, perPerson: 5000, amount: 30000 });
  assert.equal(p.amount, 30000, "指定した金額が使われない");
  assert.equal(p.joint.total, 30000, `連名の合計 ${p.joint.total} が指定額と食い違う。直し方: plan() の fixed 分岐を確認する`);
  assert.equal(p.joint.share, 6000, "1人あたりが違う");
  assert.equal(p.joint.fixed, true);
});

test("レビュー #4: キリスト教式・神式では袋の案内も宗教に合わせる", () => {
  const c = T.plan({ occasion: "funeral", relation: "friend", religion: "christian" }).envelope;
  assert.doesNotMatch(c.noshiWhy + c.mizuhikiWhy + c.type, /仏式専用/, "キリスト教式で仏式の袋の説明が出る。直し方: envelope() に religion を渡す");
  assert.match(c.mizuhiki, /なし/, "キリスト教式は水引なし");
  assert.match(T.envelope("memorial", 10000, "shinto").type, /蓮の絵柄のない/, "神式は蓮の絵柄のない袋");
  assert.match(T.envelope("funeral", 10000, "buddhist").noshiWhy, /蓮/, "仏式の説明は従来どおり");
});

test("レビュー #6: 読み込みファイル内の ID 重複は1件にする", () => {
  const r = { id: "dup", direction: "gave", date: "2026-01-01", person: "x", occasion: "birth", amount: 1000 };
  const res = T.parseRecords(JSON.stringify([r, { ...r, person: "y" }]));
  assert.equal(res.records.length, 1, "重複 ID を両方取り込んだ。直し方: parseRecords() の seen を確認する");
  assert.equal(res.skipped, 1);
});

test("レビュー #13: 10万円以上でも 4・9 を判定する", () => {
  for (const [yen, code] of [[400000, "four"], [1040000, "four"], [490000, "four"], [900000, "nine"], [190000, "nine"]]) {
    assert.ok(T.checkAmount(yen, "wedding").some((c) => c.code === code), `${yen}円が ${code} にならない。直し方: checkAmount() の bad() を確認する`);
  }
  for (const yen of [100000, 300000, 1000000, 150000]) {
    assert.ok(!T.checkAmount(yen, "wedding").some((c) => c.level === "ng"), `${yen}円を「避ける」にした（誤検知）`);
  }
});

test("レビュー #14: 「避ける」が出ているときは枚数の注意を重ねない", () => {
  const p = T.plan({ occasion: "otoshidama", relation: "junior", amount: 4500 });
  assert.ok(p.checks.some((c) => c.code === "four"), "4,500円で「4」の指摘がない");
  assert.ok(!p.bills.notes.some((n) => /枚数/.test(n)), "枚数の注意が重複している");
});
