/* ============================================================
   やすみつなぎ — ブラウザ結合スモークテスト
   ------------------------------------------------------------
   file:// で開いた index.html に対して、設定変更 → 再計算 →
   タブ切り替え → コピー → 入力エラー表示までを実際のブラウザで確認する。
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

let failures = 0;
const results = [];

function check(label, condition, detail) {
  if (condition) {
    results.push(`  ok   ${label}`);
  } else {
    failures += 1;
    results.push(`  NG   ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await playwright.chromium.launch();
const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await context.newPage();

/** ページ読み込み中に出たエラーを集める。 */
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

try {
  await page.goto(PAGE);
  await page.waitForSelector('#plan-list .bridge', { timeout: 5000 });

  /* ---- 1. 初期表示 ---- */
  check('コンソールエラーが出ていない', consoleErrors.length === 0, consoleErrors.join(' / '));
  check('初期表示でコピーの代替テキストは隠れている', await page.locator('#copy-fallback').isHidden());
  check('「今日から12か月」では年の入力欄が隠れている', await page.locator('#year-field').isHidden());
  check(
    '年をまたぐ期間では連休に年が付く',
    /\d{4}年\d{1,2}月/.test(await page.locator('#plan-list .bridge-range').first().innerText())
  );
  const initialCards = await page.locator('#plan-list .bridge').count();
  check('初期表示でプランが出る', initialCards > 0, `カード数 ${initialCards}`);
  check(
    'サマリーに4つの指標が出る',
    (await page.locator('#summary-grid .stat').count()) === 4
  );
  check(
    '注記に非公式である旨が書かれている',
    (await page.locator('.notes').innerText()).includes('非公式')
  );

  /* ---- 2. 年を指定して 2026 年にする ---- */
  await page.locator('[data-period="year"]').click();
  await page.locator('#year-input').fill('2026');
  await page.locator('#year-input').dispatchEvent('input');
  await page.waitForTimeout(150);
  check('「年を指定」にすると年の入力欄が現れる', await page.locator('#year-field').isVisible());
  check(
    '対象期間の表示が 2026 年になる',
    (await page.locator('#summary-period').innerText()).includes('2026年1月1日')
  );

  /* ---- 3. 有給日数を変えると結果が変わる ---- */
  const leaveStat = () => page.locator('#summary-grid .stat').first().innerText();
  await page.locator('#leave-input').fill('0');
  await page.locator('#leave-input').dispatchEvent('input');
  await page.waitForTimeout(150);
  check('有給 0 日では使う有給が 0 日になる', (await leaveStat()).includes('0日'));
  const zeroTotal = Number(
    (await page.locator('#summary-grid .stat').nth(1).innerText()).replace(/[^0-9]/g, '')
  );

  await page.locator('#leave-input').fill('10');
  await page.locator('#leave-input').dispatchEvent('input');
  await page.waitForTimeout(150);
  const tenTotal = Number(
    (await page.locator('#summary-grid .stat').nth(1).innerText()).replace(/[^0-9]/g, '')
  );
  check('有給を増やすと連休の合計日数が増える', tenTotal > zeroTotal, `${zeroTotal} → ${tenTotal}`);

  /* ---- 4. 優先モードを切り替えると最長連休が変わる ---- */
  const longest = async () =>
    Number((await page.locator('#summary-grid .stat').nth(3).innerText()).replace(/[^0-9]/g, ''));
  const longestLong = await longest();
  await page.locator('[data-objective="count"]').click();
  await page.waitForTimeout(150);
  const longestCount = await longest();
  check(
    '「長い連休を優先」の方が最長連休が長い',
    longestLong > longestCount,
    `長さ優先 ${longestLong}日 / 回数優先 ${longestCount}日`
  );
  await page.locator('[data-objective="long"]').click();
  await page.waitForTimeout(150);

  /* ---- 5. 勤務曜日のトグル ---- */
  const monday = page.locator('[data-dow="1"]');
  check('月曜は初期状態で出勤', (await monday.getAttribute('aria-pressed')) === 'true');
  await monday.click();
  await page.waitForTimeout(150);
  check('クリックで月曜が休みになる', (await monday.getAttribute('aria-pressed')) === 'false');
  await monday.click();
  await page.waitForTimeout(150);
  check('もう一度クリックで出勤に戻る', (await monday.getAttribute('aria-pressed')) === 'true');

  /* ---- 6. 会社休業日の入力 ---- */
  await page.locator('#company-off-input').fill('8/13-8/15');
  await page.locator('#company-off-input').dispatchEvent('change');
  await page.waitForTimeout(200);
  check('正しい休業日ではエラーが出ない', await page.locator('#company-off-error').isHidden());
  const planText = await page.locator('#plan-list').innerText();
  check('休業日を含む連休が現れる', planText.includes('8月1'), '8月の連休が出ていない');

  await page.locator('#company-off-input').fill('2/30');
  await page.locator('#company-off-input').dispatchEvent('change');
  await page.waitForTimeout(200);
  check('不正な休業日でエラーが出る', await page.locator('#company-off-error').isVisible());
  check(
    'エラーが日本語で表示される',
    /実在しない|読み取れません/.test(await page.locator('#company-off-error').innerText())
  );
  await page.locator('#company-off-input').fill('');
  await page.locator('#company-off-input').dispatchEvent('change');
  await page.waitForTimeout(150);
  check('入力を消すとエラーも消える', await page.locator('#company-off-error').isHidden());

  /* ---- 7. タブの切り替え（クリックとキーボード） ---- */
  await page.locator('#tab-rank').click();
  await page.waitForTimeout(100);
  check('効率ランキングが表示される', await page.locator('#panel-rank').isVisible());
  check('年間プランが隠れる', await page.locator('#panel-plan').isHidden());
  check('ランキングに候補が並ぶ', (await page.locator('#rank-list .bridge').count()) > 0);
  check('有給 0 日の連休も並ぶ', (await page.locator('#free-list .bridge').count()) > 0);

  await page.locator('#tab-rank').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  check('右キーでカレンダーに移動する', await page.locator('#panel-calendar').isVisible());
  check('カレンダーに12か月ぶん出る', (await page.locator('#calendar .month').count()) === 12);
  check('カレンダーのセルがある', (await page.locator('#calendar .cell:not(.pad)').count()) === 365);
  check(
    '有給の日に印が付く',
    (await page.locator('#calendar .cell.is-leave').count()) > 0
  );
  const cellLabel = await page.locator('#calendar .cell.off-holiday').first().getAttribute('aria-label');
  check('祝日セルに読み上げ用の説明が付く', /日/.test(cellLabel || ''), String(cellLabel));

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  check('左キーで効率ランキングに戻る', await page.locator('#panel-rank').isVisible());

  /* ---- 8. コピー（file:// では権限がないためフォールバックを確認） ---- */
  await page.locator('#tab-plan').click();
  await page.waitForTimeout(100);
  await page.locator('#copy-button').click();
  await page.waitForTimeout(300);
  const status = await page.locator('#copy-status').innerText();
  const fallbackVisible = await page.locator('#copy-fallback').isVisible();
  check(
    'コピーの結果が利用者に伝わる',
    status.length > 0,
    `status="${status}" fallback=${fallbackVisible}`
  );
  if (fallbackVisible) {
    const text = await page.locator('#copy-fallback-text').inputValue();
    check('フォールバックのテキストが中身を持つ', text.includes('やすみつなぎ') && text.includes('官報'));
  }

  /* ---- 9. 設定の保存と復元 ---- */
  await page.locator('#leave-input').fill('7');
  await page.locator('#leave-input').dispatchEvent('input');
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForSelector('#plan-list .bridge', { timeout: 5000 });
  check(
    '再読み込み後も有給日数が復元される',
    (await page.locator('#leave-input').inputValue()) === '7'
  );

  // タブをカレンダーに移しても、削除の結果が見える位置に出ること（レビュー R-03）
  await page.locator('#tab-calendar').click();
  await page.waitForTimeout(100);
  await page.locator('#forget-button').click();
  await page.waitForTimeout(150);
  const stored = await page.evaluate(() => window.localStorage.getItem('holiday-bridge:v1'));
  check('「保存した設定を消す」で保存が消える', stored === null, String(stored));
  check('削除の通知が設定パネル内に見える', await page.locator('#settings-status').isVisible());
  check(
    '削除の通知が日本語で内容を伝える',
    (await page.locator('#settings-status').innerText()).includes('削除')
  );
  await page.locator('#tab-plan').click();
  await page.waitForTimeout(100);

  /* ---- 10. 条件の初期化 ---- */
  await page.locator('#leave-input').fill('33');
  await page.locator('#leave-input').dispatchEvent('input');
  await page.waitForTimeout(100);
  await page.locator('#reset-button').click();
  await page.waitForTimeout(150);
  check(
    '初期値に戻すと有給日数が既定値になる',
    (await page.locator('#leave-input').inputValue()) === '10'
  );

  /* ---- 10b. 期間外の休業日は警告する（レビュー R-02） ---- */
  await page.locator('[data-period="rolling"]').click();
  await page.waitForTimeout(150);
  await page.locator('#company-off-input').fill('2020/8/13');
  await page.locator('#company-off-input').dispatchEvent('change');
  await page.waitForTimeout(200);
  check('対象期間の外にある休業日を警告する', await page.locator('#company-off-notice').isVisible());
  check(
    '警告に「含めていません」と書かれている',
    (await page.locator('#company-off-notice').innerText()).includes('含めていません')
  );

  // 年の指定がない日付は、期間内に収まるよう翌年として解釈される
  await page.locator('#company-off-input').fill('1/3');
  await page.locator('#company-off-input').dispatchEvent('change');
  await page.waitForTimeout(200);
  check(
    '年の指定がない過去日付は警告なしで期間内に入る',
    await page.locator('#company-off-notice').isHidden()
  );
  await page.locator('#company-off-input').fill('');
  await page.locator('#company-off-input').dispatchEvent('change');
  await page.waitForTimeout(150);

  /* ---- 10c. セグメント切り替えのキーボード操作（レビュー R-04） ---- */
  const objectiveLong = page.locator('[data-objective="long"]');
  const objectiveCount = page.locator('[data-objective="count"]');
  check('選択中のセグメントだけが Tab の対象', (await objectiveLong.getAttribute('tabindex')) === '0');
  check('未選択のセグメントは Tab の対象外', (await objectiveCount.getAttribute('tabindex')) === '-1');
  await objectiveLong.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  check(
    '右キーで「休みの回数を優先」に移る',
    (await objectiveCount.getAttribute('aria-checked')) === 'true'
  );
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  check(
    'Home キーで先頭に戻る',
    (await objectiveLong.getAttribute('aria-checked')) === 'true'
  );

  /* ---- 11. 範囲外の年はエラーメッセージ ---- */
  await page.locator('[data-period="year"]').click();
  await page.locator('#year-input').fill('1800');
  await page.locator('#year-input').dispatchEvent('input');
  await page.waitForTimeout(200);
  check(
    '範囲外の年は下限に丸められて計算が続く',
    (await page.locator('#year-input').inputValue()) === '2016'
  );

  /* ---- 12. テーマ切り替え ---- */
  await page.locator('#theme-toggle').click();
  await page.waitForTimeout(100);
  check(
    'テーマ切り替えで data-theme が付く',
    (await page.locator('html').getAttribute('data-theme')) === 'light'
  );

  /* ---- 13. 全曜日を休みにしても壊れない ---- */
  await page.locator('[data-period="rolling"]').click();
  for (let dow = 0; dow < 7; dow += 1) {
    const btn = page.locator(`[data-dow="${dow}"]`);
    if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  }
  await page.waitForTimeout(250);
  check('全曜日休みでも例外が出ない', consoleErrors.length === 0, consoleErrors.join(' / '));
  check('全曜日休みのときに案内が出る', await page.locator('#workdays-notice').isVisible());
  check(
    '全曜日休みでもプラン欄に何か表示される',
    (await page.locator('#plan-list').innerText()).length > 0
  );

  /* ---- 14. 通信が発生していないこと ---- */
  const requests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('file://')) requests.push(request.url());
  });
  await page.reload();
  await page.waitForSelector('#plan-list, #plan-list .empty', { timeout: 5000 });
  await page.waitForTimeout(400);
  check('外部への通信が発生しない', requests.length === 0, requests.join(' / '));
} finally {
  await browser.close();
}

console.log('やすみつなぎ — ブラウザ結合スモーク');
console.log(results.join('\n'));
if (failures > 0) {
  console.error(`\n${failures} 件の確認が失敗しました。`);
  process.exit(1);
}
console.log(`\nすべて通過しました（${results.length} 件）。`);
