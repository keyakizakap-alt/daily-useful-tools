// つつむ — ブラウザでの手動スモーク（Playwright）。`node tsutsumu/tests/smoke.mjs` で実行する。
// 主要フローを操作し、表示内容とコンソールエラー0件を確かめる。スクリーンショットは引数のフォルダに保存（省略時は保存しない）。
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

// グローバルに入っている playwright も見つけられるよう require で読み込む
const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const url = "file://" + join(here, "..", "index.html");
const shotDir = process.argv[2];

const browser = await chromium.launch();
const errors = [];
try {
  for (const scheme of ["light", "dark"]) {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 800 }]) {
      const page = await browser.newPage({ viewport, colorScheme: scheme });
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("dialog", (d) => d.accept());
      await page.goto(url);

      // UC-1 同僚の結婚式 20代
      await page.click("label[for=occasion-wedding]");
      await page.click("label[for=relation-coworker]");
      await page.click("label[for=age-20s]");
      assert.equal(await page.textContent("#r-amount"), "3万円", "UC-1 の金額が違う。直し方: app.js の update() と engine の plan() を確認する");
      assert.equal(await page.textContent("#pv-omote"), "寿", "表書きの見本が違う");
      assert.match(await page.textContent("#r-naka"), /金参萬圓也/, "中袋の大字がない");
      const tag = `${scheme}-${viewport.width}`;
      if (shotDir) await page.screenshot({ path: join(shotDir, `wedding-${tag}.png`), fullPage: true });

      // UC-2 香典（宗教不明）
      await page.click("label[for=occasion-funeral]");
      assert.equal(await page.isVisible("#religion-field"), true, "香典で宗教の選択が出ない");
      assert.equal(await page.getAttribute("body", "data-group"), "choji", "弔事のテーマにならない");
      assert.equal(await page.textContent("#pv-omote"), "御霊前");
      await page.click("label[for=religion-jodo_shinshu]");
      assert.equal(await page.textContent("#pv-omote"), "御仏前", "浄土真宗で御仏前にならない");
      if (shotDir) await page.screenshot({ path: join(shotDir, `funeral-${tag}.png`), fullPage: true });

      // UC-4 4万円
      await page.click("label[for=occasion-wedding]");
      await page.click("#more summary");
      await page.fill("#custom-amount", "40000");
      assert.match(await page.textContent("#r-checks"), /避ける/, "4万円で「避ける」が出ない");
      await page.click("#r-alts .alt >> nth=0");
      assert.equal(await page.textContent("#r-amount"), "3万円", "代わりの金額ボタンで反映されない");

      // 場面を変えると自分で入れた金額はリセット
      await page.click("label[for=occasion-otoshidama]");
      assert.equal(await page.inputValue("#custom-amount"), "", "場面を変えても金額が残る");
      assert.equal(await page.isVisible("#people-row"), false, "お年玉で人数の欄が出ている");

      // UC-5 連名
      await page.click("label[for=occasion-funeral]");
      await page.fill("#people", "6");
      assert.equal(await page.isVisible("#joint-card"), true, "連名カードが出ない");
      assert.equal(await page.textContent("#r-amount"), "18,000円", "連名の合計が違う");
      await page.fill("#people", "1");

      // UC-6 記録（XSS を試す名前）
      await page.click("label[for=occasion-birth]");
      await page.fill("#rec-person", "<img src=x onerror=alert(1)>");
      await page.check("input[name=direction][value=received]");
      await page.fill("#rec-amount", "10000");
      await page.click("#record-form button[type=submit]");
      assert.match(await page.textContent("#rec-body"), /<img src=x/, "名前がテキストとして表示されない");
      assert.equal(await page.$$eval("#rec-body img", (n) => n.length), 0, "記録の名前が HTML として解釈された");
      assert.match(await page.textContent("#rec-body"), /3,500円〜5,000円/, "お返しの目安が出ない");
      if (shotDir && viewport.width === 375) await page.screenshot({ path: join(shotDir, `records-${tag}.png`), fullPage: true });

      // レビュー #1/#3: 範囲外の入力でも画面が止まらず、誤りを知らせる
      await page.click("label[for=occasion-funeral]");
      await page.click("#more summary").catch(() => {});
      if (!(await page.isVisible("#people"))) await page.click("#more summary");
      await page.fill("#people", "11");
      await page.fill("#per-person", "1000000");
      assert.match(await page.textContent("#r-checks"), /1,000万円以下/, "合計が上限を超えたときの案内がない");
      await page.fill("#per-person", "");
      // レビュー #2: 連名で金額を指定すると合計と一致する
      await page.fill("#people", "5");
      await page.fill("#custom-amount", "30000");
      assert.match(await page.textContent("#r-joint"), /合計 3万円／1人 6,000円/, "連名カードが指定額と食い違う");
      await page.fill("#custom-amount", "20000000");
      assert.match(await page.textContent("#r-checks"), /1,000万円以下/, "1,000万円超の金額で案内がない");
      await page.fill("#custom-amount", "");
      await page.fill("#people", "1");
      // レビュー #8: 場面をキーボードで変えてもフォーカスが残る
      await page.focus("#occasion-funeral");
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.name), "occasion", "場面を変えるとフォーカスが失われる");
      // レビュー #4: キリスト教式の袋
      await page.click("label[for=occasion-funeral]");
      await page.click("label[for=religion-christian]");
      assert.doesNotMatch(await page.textContent("#r-envelope"), /仏式専用/, "キリスト教式で仏式の袋の説明");
      // レビュー #11: お年玉の見本の表は子どもの名前
      await page.click("label[for=occasion-otoshidama]");
      assert.match(await page.textContent("#pv-name"), /ちゃんへ/, "お年玉の見本に子ども宛ての表記がない");

      // 全件削除
      await page.click("#rec-clear");
      assert.equal(await page.isVisible("#rec-empty"), true, "全件削除後に空表示にならない");
      await page.close();
    }
  }
  // レビュー #5: 読めない行がある保存データは退避してから扱う
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem("tsutsumu.records.v1", JSON.stringify({ records: [
    { id: "ok1", direction: "gave", date: "2026-01-01", person: "正常", occasion: "birth", amount: 5000, note: "" },
    { id: "bad1", direction: "gave", date: "2026-13-01", person: "壊れた行", occasion: "birth", amount: 5000 },
  ] })));
  await page.reload();
  assert.match(await page.textContent("#rec-msg"), /退避/, "読めない行があったことを知らせない");
  assert.match(await page.evaluate(() => localStorage.getItem("tsutsumu.records.backup") || ""), /壊れた行/, "元のデータが退避されていない");
  await page.close();
} finally {
  await browser.close();
}
assert.deepEqual(errors, [], "コンソールエラーがある。直し方: 出力されたエラーを読んで修正する");
console.log("smoke: OK（ライト/ダーク × PC/スマホ幅、コンソールエラー0件）");
