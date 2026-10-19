/* ============================================================
   つつみかた — ブラウザ結合スモークテスト
   ------------------------------------------------------------
   file:// で開いた gift-money/index.html に対して、場面選択 →
   推奨額 → 金額判定 → 中袋見本 → 連名 までを実際のブラウザで
   確認する。通信が 1 件も発生しないこと、入力した文字列が
   HTML として解釈されないことも確かめる。
   playwright が入っていない環境では「未実行」として正常終了する。
   実行: npm run smoke（SCREENSHOT_DIR を指定すると画面を保存する）
   ============================================================ */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PAGE = pathToFileURL(path.resolve(import.meta.dirname, '../index.html')).href;
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '';

async function loadPlaywright() {
  const candidates = ['playwright'];
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf-8' }).trim();
    if (globalRoot) candidates.push(pathToFileURL(path.join(globalRoot, 'playwright', 'index.js')).href);
  } catch {
    /* npm が無い環境は候補を増やさない */
  }
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      const resolved = mod && mod.chromium ? mod : mod && mod.default;
      if (resolved && resolved.chromium) return resolved;
    } catch {
      /* 次の候補を試す */
    }
  }
  return null;
}

const playwright = await loadPlaywright();
if (!playwright) {
  console.log('skip: playwright が見つからないため、ブラウザスモークは実行しません');
  process.exit(0);
}

const checks = [];
function ok(label, condition, detail) {
  checks.push({ label, condition: !!condition, detail });
  console.log((condition ? 'ok   ' : 'FAIL ') + label + (detail && !condition ? ' :: ' + detail : ''));
}

const text = (page, sel) => page.textContent(sel).then((s) => (s || '').trim());

const browser = await playwright.chromium.launch();

async function run(viewport, name) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  const requests = [];
  page.on('request', (req) => { if (!req.url().startsWith('file:')) requests.push(req.url()); });
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss(); });

  await page.goto(PAGE);
  await page.waitForSelector('#event-list .chip');

  ok(name + ': engine.js が読み込まれている', await page.evaluate(() => typeof window.Tsutsumi === 'object'));
  ok(name + ': 場面が8つ表示される', (await page.locator('#event-list .chip').count()) === 8);

  // 初期表示（結婚式・兄弟姉妹・30代）
  ok(name + ': 初期の推奨額が出る', (await text(page, '#rec-amount')) === '5万円', await text(page, '#rec-amount'));
  ok(name + ': 包み方が表示される', (await page.locator('#manners .manner').count()) === 6);

  // 友人・20代
  await page.selectOption('#relation', 'friend');
  await page.selectOption('#modifier', 'low');
  ok(name + ': 友人の結婚式は3万円', (await text(page, '#rec-amount')) === '3万円');

  // 推奨額を ② ③ へ
  await page.click('#btn-use');
  ok(name + ': 推奨額が金額欄に入る', (await page.inputValue('#amount')) === '30000');
  ok(name + ': 判定が「問題なし」', (await page.getAttribute('#checks .check', 'data-level')) === 'ok');
  ok(name + ': 中袋に大字', (await text(page, '#env-amount')) === '金参萬圓');
  ok(name + ': お札の組み合わせ', (await text(page, '#bills')).includes('1万円札'));

  // 忌み数
  await page.fill('#amount', '40000');
  const levels = await page.$$eval('#checks .check', (els) => els.map((e) => e.getAttribute('data-level')));
  ok(name + ': 4万円で注意が出る', levels.includes('warn'), levels.join(','));

  // 不正入力
  await page.fill('#amount', 'abc');
  ok(name + ': 不正入力は入力エラー', (await page.getAttribute('#checks .check', 'data-level')) === 'error');
  ok(name + ': 不正入力では中袋見本を出さない', (await text(page, '#env-amount')) === '金額を入力してください');

  // 香典 → 宗派
  await page.click('label[for="ev-funeral"]');
  ok(name + ': 香典で宗派の欄が出る', await page.isVisible('#religion'));
  await page.selectOption('#religion', 'jodoshinshu');
  const omote = await text(page, '#manners .manner:first-child dd');
  ok(name + ': 浄土真宗は御仏前', omote.includes('御仏前') && !omote.includes('御霊前'), omote);
  await page.click('label[for="ev-wedding"]');
  ok(name + ': 結婚式では宗派の欄が隠れる', !(await page.isVisible('#religion')));

  // XSS: 入力を HTML として解釈しない
  // 氏名欄は maxlength=30 のため短い文字列、住所欄は長い文字列で試す
  const payload = '<img src=x onerror=alert(1)>';
  const longPayload = '<img src=x onerror="window.__xss=1">"><script>window.__xss=1</script>';
  await page.fill('#name', payload);
  await page.fill('#address', longPayload);
  await page.fill('#amount', '30000');
  ok(name + ': 氏名は文字として表示される', (await text(page, '#env-name')) === payload);
  ok(name + ': 住所も文字として表示される', (await text(page, '#env-address')) === longPayload.replace(/1/g, '一'));
  ok(name + ': 入力から要素が作られない', (await page.locator('#env-back img, #env-back script').count()) === 0);
  ok(name + ': スクリプトが実行されない', !(await page.evaluate(() => window.__xss)));

  // 住所の漢数字化
  await page.fill('#address', '千代田区1-2-3');
  await page.fill('#zip', '100-0001');
  ok(name + ': 住所の数字が漢数字になる', (await text(page, '#env-address')) === '千代田区一ー二ー三');
  ok(name + ': 郵便番号に〒', (await text(page, '#env-zip')) === '〒一〇〇ー〇〇〇一');

  // 連名
  await page.click('label[for="ev-birth"]');
  await page.fill('#per-person', '3000');
  await page.fill('#people', '3');
  ok(name + ': 連名の合計', (await text(page, '.group-total-amount')) === '9,000円');
  ok(name + ': 連名の提案が2件', (await page.locator('.suggestions button').count()) === 2);
  await page.click('.suggestions li:last-child button');
  ok(name + ': 提案を押すと金額欄に入る', (await page.inputValue('#amount')) === '10000');

  await page.fill('#people', '99');
  ok(name + ': 人数の上限', (await page.getAttribute('#group-result .check', 'data-level')) === 'error');

  // レイアウト: 横スクロールが出ない
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(name + ': 横スクロールが出ない', overflow <= 0, 'はみ出し ' + overflow + 'px');

  // 保存しない
  const stored = await page.evaluate(() => {
    try { return window.localStorage.length + window.sessionStorage.length; } catch { return 0; }
  });
  ok(name + ': 何も保存しない', stored === 0);

  if (SCREENSHOT_DIR) {
    await page.fill('#name', '山田 花子');
    await page.fill('#address', '東京都千代田区千代田1-2-3');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gift-money-' + name + '.png'), fullPage: true });
  }

  ok(name + ': 外部への通信が 0 件', requests.length === 0, requests.join(', '));
  ok(name + ': コンソールエラーが 0 件', consoleErrors.length === 0, consoleErrors.join(' / '));
  ok(name + ': ダイアログが出ない', dialogs === 0);
  await page.close();
}

try {
  await run({ width: 1280, height: 900 }, 'desktop');
  await run({ width: 360, height: 740 }, 'mobile');
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.condition);
console.log('\n' + (checks.length - failed.length) + ' / ' + checks.length + ' 件成功');
process.exit(failed.length ? 1 : 0);
