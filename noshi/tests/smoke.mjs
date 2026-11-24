/* ============================================================
   のしるべ — ブラウザ結合スモークテスト
   ------------------------------------------------------------
   file:// で開いた noshi/index.html に対して、場面の切り替え →
   金額の入力 → 点検・大字・お札の表示 → 名前のプレビューまでを
   実際のブラウザで確認する。スマホ幅での横はみ出しも確認し、
   スクリーンショットを tests/screenshots/ に保存する（git 管理外）。
   playwright が入っていない環境では「未実行」として正常終了する。
   実行: npm run smoke
   ============================================================ */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PAGE = pathToFileURL(path.resolve(import.meta.dirname, '../index.html')).href;
const SHOT_DIR = path.resolve(import.meta.dirname, 'screenshots');

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

const text = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);
const hidden = (page, sel) => page.evaluate((s) => document.querySelector(s).hidden, sel);

mkdirSync(SHOT_DIR, { recursive: true });
const browser = await playwright.chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));

  await page.goto(PAGE);
  await page.waitForSelector('#scene option', { state: 'attached' });

  ok('engine.js が読み込まれている', await page.evaluate(() => typeof window.Noshi === 'object'));
  ok('場面が11件並ぶ', (await page.locator('#scene option').count()) === 11);
  ok('初期表示で目安が出る（結婚祝い・友人は3万円）', (await text(page, '#amount-main')) === '3万円', await text(page, '#amount-main'));
  ok('初期表示で袋のプレビューに「寿」', (await text(page, '#env-omote')) === '寿');

  // UC-1: 結婚祝いに2万円
  await page.fill('#amount', '2万');
  await page.waitForSelector('#check-card:not([hidden])');
  ok('2万円で参考の点検が出る', (await text(page, '#checks')).includes('近年は'), await text(page, '#checks'));
  ok('大字が「金 弐萬円」', (await text(page, '#daiji')) === '金 弐萬円', await text(page, '#daiji'));
  ok('お札が3枚の組み合わせ', (await text(page, '#bills')).includes('5千円札 × 2枚'), await text(page, '#bills'));

  // 不正な金額
  await page.fill('#amount', 'たくさん');
  ok('解釈できない金額で理由が出る', !(await hidden(page, '#amount-error')));
  ok('解釈できない金額で点検を隠す', await hidden(page, '#check-card'));
  ok('入力欄に aria-invalid が付く', (await page.getAttribute('#amount', 'aria-invalid')) === 'true');

  // UC-2: 香典・上司・30代・宗教不明 → 浄土真宗
  await page.selectOption('#scene', 'funeral');
  ok('香典では宗教欄が出る', !(await hidden(page, '#religion-field')));
  await page.selectOption('#relation', 'boss');
  await page.check('input[name="age"][value="30"]', { force: true });
  await page.fill('#amount', '4000');
  ok('上司・30代の香典は5千〜1万円', (await text(page, '#amount-main')) === '5千〜1万円', await text(page, '#amount-main'));
  ok('4千円で忌み数の注意が出る', (await text(page, '#checks')).includes('「4」は「死」'));
  ok('香典は薄墨', (await text(page, '#specs')).includes('薄墨'));
  ok('香典の袋はのしなし', (await page.getAttribute('#envelope', 'data-noshi')) === 'no');
  await page.selectOption('#religion', 'jodoshin');
  ok('浄土真宗で表書きが「御仏前」', (await text(page, '#env-omote')) === '御仏前');

  // 袋のイメージの文字が枠からはみ出さない（R1・R2）
  const fits = async () => page.evaluate(() => ['env-omote', 'env-name'].every((id) => {
    const n = document.getElementById(id);
    return n.scrollHeight <= n.clientHeight + 1 && n.scrollWidth <= n.clientWidth + 1;
  }));
  ok('3文字の表書きが袋の枠に収まる', await fits());
  ok('名前が空のときの表示に括弧を使わない', !/[（）()]/.test(await text(page, '#env-name')));
  // 水引は濃い色が右（R3）
  const cords = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#envelope .env-mizuhiki'));
    return [cs.getPropertyValue('--cord-l').trim(), cs.getPropertyValue('--cord-r').trim()];
  });
  ok('弔事の水引は黒が右', cords[1] === 'var(--cho-1)' || cords[1] === '#2b2b2b', cords.join(' / '));
  // 読み上げは金額と点検だけ（R4）
  ok('結果領域全体を aria-live にしない', (await page.getAttribute('section.results', 'aria-live')) === null);
  await page.screenshot({ path: path.join(SHOT_DIR, 'desktop-funeral.png'), fullPage: true });

  // UC-4: 快気祝い
  await page.selectOption('#scene', 'kaiki');
  ok('快気祝いでは関係欄を隠す', await hidden(page, '#relation-field'));
  ok('快気祝いでは「いただいた金額」欄が出る', !(await hidden(page, '#received-field')));
  await page.fill('#received', '１万円');
  ok('いただいた1万円の目安が約3,300〜5千円', (await text(page, '#amount-main')) === '約 3,300〜5千円', await text(page, '#amount-main'));

  // UC-3: お年玉
  await page.selectOption('#scene', 'otoshidama');
  await page.selectOption('#childAge', 'upperElem');
  ok('お年玉・小学校高学年は3千〜5千円', (await text(page, '#amount-main')) === '3千〜5千円', await text(page, '#amount-main'));

  // 5文字の表書きも枠に収まる
  await page.selectOption('#scene', 'newhome');
  ok('5文字の表書き（御新築御祝）が袋の枠に収まる', await fits());

  // XSS: 名前欄の HTML は文字として表示する
  await page.fill('#name', '<img src=x onerror=window.__xss=1>');
  await page.waitForTimeout(100);
  ok('名前の HTML が実行されない', await page.evaluate(() => window.__xss === undefined && !document.querySelector('#env-name img')));
  ok('名前は文字として表示される', (await text(page, '#env-name')).startsWith('<img'));

  // コピー（権限がない環境ではメッセージが出ることだけ確認）
  await page.selectOption('#scene', 'wedding');
  await page.fill('#amount', '30000');
  await page.click('#copy-daiji');
  await page.waitForFunction(() => document.getElementById('copy-status').textContent !== '');
  ok('コピーの結果が表示される', /コピー/.test(await text(page, '#copy-status')));

  const storage = await page.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length);
  ok('端末に何も保存しない', storage === 0, String(storage));
  const external = requests.filter((url) => !url.startsWith('file://'));
  ok('外部への通信が発生しない', external.length === 0, external.join(', '));
  ok('コンソールエラーがない', consoleErrors.length === 0, consoleErrors.join(' / '));
  await page.screenshot({ path: path.join(SHOT_DIR, 'desktop-wedding.png'), fullPage: true });

  // スマホ幅（360px）で横にはみ出さない
  const mobile = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
  await mobile.goto(PAGE);
  await mobile.waitForSelector('#scene option', { state: 'attached' });
  await mobile.fill('#amount', '1万5千');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('360px 幅で横スクロールが出ない', overflow <= 0, 'はみ出し: ' + overflow + 'px');
  await mobile.screenshot({ path: path.join(SHOT_DIR, 'mobile.png'), fullPage: true });

  // ダークモード
  const dark = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: 'dark' });
  await dark.goto(PAGE);
  await dark.waitForSelector('#scene option', { state: 'attached' });
  const bg = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok('ダークモードで背景が暗い', bg === 'rgb(22, 19, 17)', bg);
  await dark.screenshot({ path: path.join(SHOT_DIR, 'desktop-dark.png'), fullPage: true });
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.condition);
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' 件成功');
if (failed.length > 0) process.exit(1);
