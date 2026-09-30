/* ============================================================
   おくるまえに — ブラウザ結合スモークテスト
   ------------------------------------------------------------
   file:// で開いた mail-check/index.html に対して、入力 → 指摘表示 →
   置換 → 一括適用 → 無視 までを実際のブラウザで確認する。
   playwright が入っていない環境では「未実行」として正常終了する。
   実行: npm run smoke
   ============================================================ */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PAGE = pathToFileURL(path.resolve(import.meta.dirname, '../index.html')).href;

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

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(String(err)));
const requests = [];
page.on('request', (req) => requests.push(req.url()));

try {
  await page.goto(PAGE);
  await page.waitForSelector('#findings');

  // engine.js / app.js が CSP に阻まれず読み込めているか
  ok('engine.js が読み込まれている', await page.evaluate(() => typeof window.OkuruMae === 'object'));

  // 例文 → 指摘が出る
  await page.click('#btn-sample');
  await page.waitForFunction(() => document.querySelectorAll('#findings .finding').length > 0);
  const initial = await page.evaluate(() => ({
    count: document.querySelectorAll('#findings .finding').length,
    score: Number(document.getElementById('score').textContent),
    summary: document.getElementById('summary').textContent,
    high: document.querySelectorAll('#findings .finding[data-severity="高"]').length
  }));
  ok('例文で指摘が表示される', initial.count > 5, '件数: ' + initial.count);
  ok('点数が下がる', initial.score < 100, '点数: ' + initial.score);
  ok('重要度「高」が検出される', initial.high > 0);
  ok('要約に警告が出る', initial.summary.includes('重要度「高」'), initial.summary);

  // 1件置換
  const beforeFix = await page.inputValue('#body');
  await page.click('#findings .finding button.apply');
  await page.waitForFunction((prev) => document.getElementById('body').value !== prev, beforeFix);
  ok('置換で本文が書き換わる', (await page.inputValue('#body')) !== beforeFix);

  // 一括適用
  await page.click('#btn-fix-all');
  await page.waitForTimeout(400);
  const afterAll = await page.evaluate(() => ({
    fixable: Array.prototype.filter.call(
      document.querySelectorAll('#findings .finding'),
      (li) => li.querySelector('button.apply')
    ).length,
    score: Number(document.getElementById('score').textContent),
    body: document.getElementById('body').value
  }));
  ok('一括適用で修正候補が残らない', afterAll.fixable === 0, '残り: ' + afterAll.fixable);
  ok('一括適用で「各位様」が直る', !afterAll.body.includes('各位様'));
  ok('一括適用で点数が上がる', afterAll.score > initial.score, initial.score + ' → ' + afterAll.score);

  // スコアバーの描画（CSP 下で style を設定できているか）
  ok('スコアバーが描画される',
    await page.evaluate(() => {
      const w = document.getElementById('score-bar-fill').style.width;
      return w !== '' && w !== '100%';
    }), 'style.width が反映されていない（CSP で阻まれている可能性）');

  // 無視
  const beforeIgnore = await page.evaluate(() => document.querySelectorAll('#findings .finding').length);
  await page.click('#findings .finding button.ignore');
  await page.waitForFunction(
    (prev) => document.querySelectorAll('#findings .finding').length < prev,
    beforeIgnore
  );
  ok('無視で指摘が1件減る', true);

  // ハイライト表示に指摘の印がつく
  await page.click('.preview-wrap summary');
  ok('ハイライトに印がつく', (await page.locator('#preview mark').count()) > 0);

  ok('ハイライトに重要度の補足がつく',
    /重要度[高中低]の指摘/.test(await page.getAttribute('#preview mark', 'title') || ''));

  // XSS: 本文の HTML が実行されない
  await page.fill('#body', '<img src=x onerror="window.__xss=1"> 了解しました。');
  await page.waitForTimeout(400);
  ok('本文の HTML が実行されない', await page.evaluate(() => window.__xss === undefined));
  ok('ハイライトは文字として表示される',
    (await page.evaluate(() => document.getElementById('preview').textContent)).includes('<img src=x'));

  // 相手の切り替え
  await page.fill('#body', '了解しました。');
  await page.selectOption('#audience', 'colleague');
  await page.waitForTimeout(400);
  ok('同僚宛では「了解しました」を指摘しない',
    !(await page.evaluate(() => document.getElementById('findings').textContent)).includes('了解しました'));

  // 消去
  await page.click('#btn-clear');
  await page.waitForTimeout(400);
  ok('消去で本文が空になる', (await page.inputValue('#body')) === '');

  // 保存は既定で無効。無効のまま開いたときに下書きを残さない
  const storage = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return { checked: document.getElementById('opt-save').checked, keys: keys };
  });
  ok('下書き保存は既定で無効', storage.checked === false);
  ok('保存が無効なら下書きを端末に残さない',
    !storage.keys.includes('okurumae.body') && !storage.keys.includes('okurumae.subject'),
    storage.keys.join(', '));

  // 通信をしていないこと（自分のファイル以外を取得していない）
  const external = requests.filter((url) => !url.startsWith('file://'));
  ok('外部への通信が発生しない', external.length === 0, external.join(', '));
  ok('コンソールエラーがない', consoleErrors.length === 0, consoleErrors.join(' / '));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.condition);
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' 件成功');
if (failed.length > 0) process.exit(1);
