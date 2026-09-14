#!/usr/bin/env node
/**
 * verify-browser — 実ブラウザ（Chromium）での動作確認。
 *
 * 確認すること
 *   1. file:// で開いてコンソールエラーが出ないこと（CSP がスクリプトを止めていないこと）
 *   2. http:// で開いても同じこと
 *   3. 外部へのリクエストが 1 件も出ないこと
 *   4. 主要な操作（有給日数・タブ・週休・詳細設定・不正入力・テーマ）が動くこと
 *   5. .ics のダウンロードが実際に行われ、内容が RFC 5545 の形になっていること
 *
 * playwright-core は依存パッケージに入れていない（実行時・開発時依存 0 個を維持するため）。
 * 未インストールの場合はその旨を表示して終了する。
 *
 *   npm i --no-save playwright-core && npm run verify:browser
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'verify-output');

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (error) {
  console.error('playwright-core が見つかりません。次のコマンドで導入してください:');
  console.error('  npm i --no-save playwright-core');
  process.exit(2);
}

/** 環境に用意されている Chromium を探す */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined;
  const candidates = fs
    .readdirSync(base)
    .filter((name) => name.startsWith('chromium'))
    .flatMap((name) => [
      path.join(base, name, 'chrome-linux', 'chrome'),
      path.join(base, name, 'chrome-linux64', 'chrome'),
    ]);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/** src/ を配信する最小の静的サーバー（依存なし） */
function startServer() {
  const server = http.createServer((request, response) => {
    const requested = decodeURIComponent((request.url || '/').split('?')[0]);
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    const target = path.join(APP_DIR, relative);
    if (!target.startsWith(APP_DIR) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const failures = [];
const checks = [];

function check(name, condition, detail) {
  if (condition) {
    checks.push(`OK   ${name}`);
  } else {
    checks.push(`NG   ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

/** ページを開き、コンソールエラーと外部リクエストを記録する */
async function openPage(context, url) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('request', (request) => {
    const target = request.url();
    if (!/^(file:|http:\/\/127\.0\.0\.1|http:\/\/localhost|blob:|data:|about:)/.test(target)) {
      externalRequests.push(target);
    }
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#plans-list .plan-card, #plans-list .empty', {
    state: 'attached',
    timeout: 15000,
  });
  return { page, consoleErrors, pageErrors, externalRequests };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const executablePath = findChromium();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const { server, port } = await startServer();
  const httpUrl = `http://127.0.0.1:${port}/index.html`;
  const fileUrl = 'file://' + path.join(APP_DIR, 'index.html');

  try {
    // ---------------------------------------------------------- file:// で開く
    const fileContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fileRun = await openPage(fileContext, fileUrl);
    check('file:// でコンソールエラーが出ない', fileRun.consoleErrors.length === 0, fileRun.consoleErrors.join(' / '));
    check('file:// で未捕捉の例外が出ない', fileRun.pageErrors.length === 0, fileRun.pageErrors.join(' / '));
    check('file:// で外部リクエストが出ない', fileRun.externalRequests.length === 0, fileRun.externalRequests.join(' / '));
    const fileCards = await fileRun.page.locator('#plans-list .plan-card').count();
    check('file:// でプランが描画される', fileCards > 0, `カード ${fileCards} 件`);
    await fileContext.close();

    // ---------------------------------------------------------- http:// で開く
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    const run = await openPage(context, httpUrl);
    const page = run.page;
    check('http:// でコンソールエラーが出ない', run.consoleErrors.length === 0, run.consoleErrors.join(' / '));
    check('http:// で未捕捉の例外が出ない', run.pageErrors.length === 0, run.pageErrors.join(' / '));
    check('外部リクエストが出ない', run.externalRequests.length === 0, run.externalRequests.join(' / '));

    // ---------------------------------------------------------- 初期表示
    const title = await page.title();
    check('タイトルが設定されている', title.includes('やすみつなぎ'), title);
    const initialCards = await page.locator('#plans-list .plan-card').count();
    check('初期状態（入力0回）でプランが出る', initialCards > 0, `カード ${initialCards} 件`);
    check('有給の初期値が3日', (await page.locator('#budget-output').textContent()) === '3日');

    // 既知の日付を入れて結果を固定して検証する
    await page.locator('#start-date').fill('2026-09-14');
    await page.locator('#period').selectOption('12');
    await page.locator('#budget').fill('1');
    await page.waitForTimeout(200);
    const topCard = page.locator('#plans-list .plan-card').first();
    const topLength = await topCard.locator('.plan-card__length').textContent();
    check('1日の有給で6連休以上の提案が先頭に来る', /^([6-9]|\d{2,})連休$/.test(topLength || ''), topLength);
    const topPto = await topCard.locator('.plan-card__pto').textContent();
    check('先頭カードに休む日が表示される', /休む日（1日）/.test(topPto || ''), topPto);

    // ---------------------------------------------------------- 有給日数の変更
    await page.locator('#budget').fill('5');
    await page.waitForTimeout(200);
    check('スライダーの表示が追従する', (await page.locator('#budget-output').textContent()) === '5日');

    // ---------------------------------------------------------- タブ
    for (const [id, selector] of [
      ['year', '#panel-year'],
      ['calendar', '#panel-calendar'],
      ['holidays', '#panel-holidays'],
      ['plans', '#panel-plans'],
    ]) {
      await page.locator(`#tab-${id}`).click();
      const visible = await page.locator(selector).isVisible();
      check(`タブ「${id}」が表示される`, visible);
    }

    // キーボード操作
    await page.locator('#tab-plans').focus();
    await page.keyboard.press('ArrowRight');
    check('矢印キーでタブが移動する', await page.locator('#panel-year').isVisible());

    // ---------------------------------------------------------- 年間プラン
    await page.locator('#tab-year').click();
    const yearCards = await page.locator('#year-list .plan-card').count();
    check('年間プランが組まれる', yearCards > 0, `${yearCards} 件`);
    const yearSummary = await page.locator('#year-summary').textContent();
    check(
      '年間プランの使用日数が予算内',
      /使う有給（予算5日）[0-5]日/.test(yearSummary || ''),
      yearSummary
    );

    // ---------------------------------------------------------- カレンダー
    await page.locator('#tab-calendar').click();
    const monthCount = await page.locator('.month').count();
    check('カレンダーが月ごとに並ぶ', monthCount >= 12, `${monthCount} か月`);
    const ptoCells = await page.locator('.cell--pto').count();
    check('年間プランの有給日がカレンダーで強調される', ptoCells > 0, `${ptoCells} 日`);

    // ---------------------------------------------------------- 祝日一覧
    await page.locator('#tab-holidays').click();
    const holidayRows = await page.locator('#holiday-table tbody tr').count();
    check('祝日一覧が出る', holidayRows >= 15, `${holidayRows} 行`);
    const silverWeek = await page
      .locator('#holiday-table tbody tr', { hasText: '2026年9月22日' })
      .textContent();
    check('国民の休日に根拠が併記される', /国民の休日/.test(silverWeek || '') && /敬老の日/.test(silverWeek || ''), silverWeek);

    // ---------------------------------------------------------- 会社休業日
    // 期間（2026-09-14 から1年）の内側にある平日を指定する
    await page.locator('.advanced summary').click();
    await page.locator('#company-holidays').fill('2026-12-30\n2026-12-31');
    await page.waitForTimeout(200);
    await page.locator('#tab-calendar').click();
    const companyCells = await page.locator('.month .cell--company').count();
    check('会社休業日がカレンダーに反映される', companyCells === 2, `${companyCells} 日`);

    // ---------------------------------------------------------- 不正入力
    await page.locator('#company-holidays').fill('2026-08-99');
    await page.waitForTimeout(200);
    const errorVisible = await page.locator('#error-message').isVisible();
    const errorText = await page.locator('#error-message').textContent();
    check('不正な日付でエラーメッセージが出る', errorVisible && /読めない日付/.test(errorText || ''), errorText);
    check('不正入力でも例外が増えない', run.pageErrors.length === 0, run.pageErrors.join(' / '));
    await page.locator('#company-holidays').fill('');
    await page.waitForTimeout(200);
    check('入力を直すとエラーが消える', !(await page.locator('#error-message').isVisible()));

    // ---------------------------------------------------------- .ics ダウンロード
    await page.locator('#tab-plans').click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('#plans-list .plan-card').first().locator('button').click(),
    ]);
    const icsPath = path.join(OUT_DIR, download.suggestedFilename());
    await download.saveAs(icsPath);
    const icsText = fs.readFileSync(icsPath, 'utf8');
    check('.ics がダウンロードされる', fs.existsSync(icsPath), icsPath);
    check('.ics が VCALENDAR で始まる', icsText.startsWith('BEGIN:VCALENDAR'));
    check('.ics が CRLF 区切り', /\r\n/.test(icsText) && !/[^\r]\n/.test(icsText));
    check('.ics に VEVENT が1件', (icsText.match(/BEGIN:VEVENT/g) || []).length === 1);
    check('.ics に終日イベントの日付がある', /DTSTART;VALUE=DATE:\d{8}/.test(icsText));
    check('.ics のファイル名が想定どおり', /^yasumitsunagi-\d{4}-\d{2}-\d{2}\.ics$/.test(download.suggestedFilename()), download.suggestedFilename());

    // ---------------------------------------------------------- おすすめプランの多様性
    const shownMonths = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#plans-list .plan-card .plan-card__range')).map(
        (node) => node.textContent
      )
    );
    check('おすすめプランの時期が分散している', new Set(shownMonths).size >= 6, `${shownMonths.length} 件 / ${new Set(shownMonths).size} 通り`);

    // ---------------------------------------------------------- テーマ
    await page.locator('#theme-toggle').click();
    const theme1 = await page.locator('html').getAttribute('data-theme');
    await page.locator('#theme-toggle').click();
    const theme2 = await page.locator('html').getAttribute('data-theme');
    check('テーマが切り替わる', theme1 === 'light' && theme2 === 'dark', `${theme1} → ${theme2}`);
    await page.screenshot({ path: path.join(OUT_DIR, 'dark-desktop.png'), fullPage: false });

    await page.locator('#theme-toggle').click(); // auto へ戻す
    await page.screenshot({ path: path.join(OUT_DIR, 'light-desktop.png'), fullPage: false });

    await page.locator('#tab-plans').click();
    await page.locator('#panel-plans').screenshot({ path: path.join(OUT_DIR, 'plans.png') });
    await page.locator('#tab-year').click();
    await page.locator('#year-summary').screenshot({ path: path.join(OUT_DIR, 'year-summary.png') });
    await page.locator('#tab-calendar').click();
    await page.locator('#panel-calendar').screenshot({ path: path.join(OUT_DIR, 'calendar.png') });

    // ---------------------------------------------------------- 設定の保存と消去
    await page.locator('#budget').fill('7');
    await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#plans-list .plan-card, #plans-list .empty', {
      state: 'attached',
      timeout: 15000,
    });
    check('条件がリロード後も保持される', (await page.locator('#budget-output').textContent()) === '7日');

    // 消去前にテーマも変えておき、テーマのキーまで消えることを確かめる
    await page.locator('#theme-toggle').click();
    await page.locator('#clear-storage').click();
    await page.waitForTimeout(200);
    check('消去後に初期値へ戻る', (await page.locator('#budget-output').textContent()) === '3日');
    const leftoverKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('yasumitsunagi.'))
    );
    check('消去後に当アプリの保存キーが残らない', leftoverKeys.length === 0, leftoverKeys.join(', '));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#plans-list .plan-card, #plans-list .empty', {
      state: 'attached',
      timeout: 15000,
    });
    check('消去後はリロードしても復元されない', (await page.locator('#budget-output').textContent()) === '3日');

    // ---------------------------------------------------------- 週休なし
    await page.locator('#weekday-0').uncheck();
    await page.locator('#weekday-6').uncheck();
    await page.waitForTimeout(200);
    check('週休を外しても例外が出ない', run.pageErrors.length === 0, run.pageErrors.join(' / '));
    await page.locator('#weekday-0').check();
    await page.locator('#weekday-6').check();

    // ---------------------------------------------------------- 横スクロールしない
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      check(`幅 ${width}px で横スクロールが出ない`, overflow <= 1, `はみ出し ${overflow}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, 'light-mobile.png'), fullPage: false });

    check('最後まで未捕捉の例外が出ていない', run.pageErrors.length === 0, run.pageErrors.join(' / '));
    check('最後まで外部リクエストが出ていない', run.externalRequests.length === 0, run.externalRequests.join(' / '));

    await context.close();

    // ---------------------------------------------------------- localStorage が使えない環境
    // プライベートモードや「サイトデータをブロック」の設定を模す
    const blockedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const blocked = await blockedContext.newPage();
    const blockedErrors = [];
    blocked.on('pageerror', (error) => blockedErrors.push(String(error)));
    await blocked.addInitScript(() => {
      const deny = () => {
        throw new Error('localStorage is not available');
      };
      Object.defineProperty(window, 'localStorage', {
        get() {
          return { getItem: deny, setItem: deny, removeItem: deny, key: deny, clear: deny };
        },
      });
    });
    await blocked.goto(httpUrl, { waitUntil: 'load' });
    await blocked.waitForSelector('#plans-list .plan-card, #plans-list .empty', {
      state: 'attached',
      timeout: 15000,
    });
    const blockedCards = await blocked.locator('#plans-list .plan-card').count();
    check('保存できない環境でも計算結果が出る', blockedCards > 0, `カード ${blockedCards} 件`);

    const themeCycle = [];
    for (let i = 0; i < 4; i += 1) {
      await blocked.locator('#theme-toggle').click();
      themeCycle.push((await blocked.locator('html').getAttribute('data-theme')) || 'auto');
    }
    check(
      '保存できない環境でもテーマが3状態を巡回する',
      themeCycle.join('→') === 'light→dark→auto→light',
      themeCycle.join('→')
    );
    check('保存できない環境で例外が出ない', blockedErrors.length === 0, blockedErrors.join(' / '));
    await blockedContext.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log(checks.join(os.EOL));
  console.log('');
  console.log(`スクリーンショットと .ics: ${path.relative(ROOT, OUT_DIR)}/`);

  if (failures.length > 0) {
    console.error(`\nブラウザ確認: ${failures.length} 件の失敗`);
    process.exit(1);
  }
  console.log(`\nブラウザ確認: ${checks.length} 項目すべて OK`);
}

main().catch((error) => {
  console.error('ブラウザ確認の実行に失敗しました:', error);
  process.exit(1);
});
