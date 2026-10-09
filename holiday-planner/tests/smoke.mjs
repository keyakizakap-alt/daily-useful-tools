/* ============================================================
   とびいし — ブラウザ結合スモークテスト
   ------------------------------------------------------------
   file:// で開いた holiday-planner/index.html に対して、初期表示 →
   設定変更 → 自動編成 → 申請文 → テーマ → 保存の既定 OFF →
   XSS → 通信ゼロ までを実際のブラウザで確認する。
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
  await page.waitForSelector('#plan-list .plan');

  // スクリプトとスタイルが CSP に阻まれず読み込めているか
  ok('holidays.js が読み込まれている', await page.evaluate(() => typeof window.TobiishiHolidays === 'object'));
  ok('engine.js が読み込まれている', await page.evaluate(() => typeof window.Tobiishi === 'object'));
  ok('styles.css が適用されている',
    await page.evaluate(() => getComputedStyle(document.body).lineHeight !== 'normal'));

  /* ---- 初期表示（設定を触らずに結果が出る: FR-1） ---- */
  const initial = await page.evaluate(() => ({
    plans: document.querySelectorAll('#plan-list .plan').length,
    natural: document.querySelectorAll('#natural-list .plan').length,
    summary: document.getElementById('summary').textContent,
    best: document.getElementById('stat-best').textContent,
    year: document.getElementById('year').value,
    from: document.getElementById('range-from').value
  }));
  ok('設定を触らずにプランが表示される', initial.plans > 0, '件数: ' + initial.plans);
  ok('有給なしの連休も表示される', initial.natural > 0, '件数: ' + initial.natural);
  ok('要約が日本語で表示される', /連休/.test(initial.summary), initial.summary);
  ok('一番効率のよい連休が日本語で示される', /有給\d+日で\d+連休/.test(initial.best), initial.best);
  ok('対象期間が今日から始まる', /^\d{4}-\d{2}-\d{2}$/.test(initial.from), initial.from);

  // 連休の帯が CSSOM で描画されている（CSP で style 属性が使えないため）
  ok('連休の帯に伸び幅が設定される',
    await page.evaluate(() => {
      const span = document.querySelector('#plan-list .plan-bar span');
      return !!span && span.style.getPropertyValue('--grow') !== '';
    }), 'style.setProperty が反映されていない');

  /* ---- 年の切り替え ---- */
  await page.selectOption('#year', { index: 1 });
  await page.waitForTimeout(300);
  const nextYear = await page.evaluate(() => ({
    from: document.getElementById('range-from').value,
    to: document.getElementById('range-to').value,
    plans: document.querySelectorAll('#plan-list .plan').length
  }));
  ok('年を変えると対象期間が1月1日からになる', nextYear.from.endsWith('-01-01'), nextYear.from);
  ok('年を変えてもプランが出る', nextYear.plans > 0, '件数: ' + nextYear.plans);

  /* ---- 数値入力は打鍵だけで反映される（レビュー R3 / 原因β） ---- */
  const beforeType = await page.textContent('#summary');
  await page.locator('#max-take').fill('1');      // フォーカスは外さない
  await page.waitForTimeout(500);
  const afterType = await page.textContent('#summary');
  ok('数値を打ち替えるだけで結果が変わる', afterType !== beforeType && /有給1日以内/.test(afterType), afterType.slice(0, 50));
  ok('要約に対象期間が日付で入る（「年内」と言い切らない）',
    /\d+年\d+月\d+日〜\d+月\d+日/.test(afterType) && !afterType.includes('年内'), afterType.slice(0, 50));
  await page.locator('#max-take').fill('3');
  await page.locator('#max-take').blur();
  await page.waitForTimeout(400);

  /* ---- おすすめは重ならない代表だけ（レビュー R4 / 原因γ） ---- */
  const distinct = await page.evaluate(() => ({
    shown: document.querySelectorAll('#plan-list .plan').length,
    total: Number((/連休が (\d+)通り/.exec(document.getElementById('summary').textContent) || [0, 0])[1]),
    summary: document.getElementById('summary').textContent,
    showAll: document.getElementById('opt-show-all').checked
  }));
  ok('既定では代表だけを出す', distinct.showAll === false && /重ならない代表は \d+通り/.test(distinct.summary),
    distinct.summary.slice(0, 70));
  // 同じ連休の取り方違い＝表示されている区間同士が重なるかどうかで判定する
  const overlapCount = () => page.evaluate(() => {
    const parse = (text) => {
      const sides = text.split('〜').map((side) => {
        const m = /(?:(\d{4})\/)?(\d+)\/(\d+)/.exec(side);
        return new Date(Number(m[1] || new Date().getFullYear()), Number(m[2]) - 1, Number(m[3])).getTime();
      });
      return sides;
    };
    const ranges = Array.from(document.querySelectorAll('#plan-list .plan-range')).map((n) => parse(n.textContent));
    let pairs = 0;
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        if (ranges[i][0] <= ranges[j][1] && ranges[j][0] <= ranges[i][1]) pairs++;
      }
    }
    return pairs;
  });
  ok('代表だけのときは重なる候補が並ばない', (await overlapCount()) === 0);
  await page.check('#opt-show-all');
  await page.waitForTimeout(400);
  const all = await page.evaluate(() => ({
    overlapNote: document.getElementById('plan-note').textContent,
    shown: document.querySelectorAll('#plan-list .plan').length
  }));
  ok('全件表示にすると重なる候補も並ぶ', (await overlapCount()) > 0);
  ok('表示を打ち切ったときは件数を知らせる',
    all.shown < distinct.total ? /件のうち上位\d+件/.test(all.overlapNote) : true, all.overlapNote);
  await page.uncheck('#opt-show-all');
  await page.waitForTimeout(400);

  /* ---- 休みの曜日 ---- */
  await page.uncheck('.dow-check[data-dow="6"]');
  await page.waitForTimeout(300);
  const noSaturday = await page.evaluate(() => document.querySelectorAll('#plan-list .plan').length);
  ok('土曜を外しても計算できる', noSaturday > 0, '件数: ' + noSaturday);
  await page.check('.dow-check[data-dow="6"]');
  await page.waitForTimeout(300);

  /* ---- 休めない期間のエラーは操作の直下に出る（レビュー R2 / 原因α） ---- */
  await page.click('#btn-add-blackout');          // 日付が空のまま
  await page.waitForTimeout(200);
  ok('空の日付でエラーがその場に見える',
    (await page.isVisible('#blackout-status')) && /入れてください/.test(await page.textContent('#blackout-status')),
    await page.textContent('#blackout-status'));
  ok('エラーが折りたたみの中に隠れていない',
    await page.evaluate(() => document.querySelector('details.advanced').open === false));

  /* ---- 休めない期間（XSS を兼ねる） ---- */
  await page.fill('#blackout-from', nextYear.from.slice(0, 4) + '-05-01');
  await page.fill('#blackout-to', nextYear.from.slice(0, 4) + '-05-01');
  await page.fill('#blackout-name', '<img src=x onerror="window.__xss=1">繁忙期');
  await page.click('#btn-add-blackout');
  await page.waitForTimeout(300);
  const blackout = await page.evaluate(() => ({
    items: document.querySelectorAll('#blackout-list li').length,
    text: document.getElementById('blackout-list').textContent,
    images: document.querySelectorAll('#blackout-list img').length,
    xss: window.__xss
  }));
  ok('休めない期間が1件登録される', blackout.items === 1, '件数: ' + blackout.items);
  ok('入力した HTML が実行されない', blackout.xss === undefined);
  ok('入力した HTML が要素にならない', blackout.images === 0);
  ok('入力は文字として表示される', blackout.text.includes('<img src=x'), blackout.text);
  ok('5月1日が有給候補から消える',
    await page.evaluate(() => {
      const year = document.getElementById('range-from').value.slice(0, 4);
      return !document.getElementById('plan-list').textContent.includes('有給 5/1(');
    }));

  /* ---- 年間プランの自動編成 ---- */
  await page.click('#tab-year');
  await page.fill('#budget', '5');
  await page.waitForTimeout(300);
  await page.click('#btn-compose');
  await page.waitForTimeout(400);
  const composed = await page.evaluate(() => ({
    picked: document.querySelectorAll('#picked-list .plan').length,
    summary: document.getElementById('year-summary').textContent,
    request: document.getElementById('request-text').value,
    copyDisabled: document.getElementById('btn-copy').disabled
  }));
  ok('自動編成で複数の連休が選ばれる', composed.picked > 1, '件数: ' + composed.picked);
  const used = /使う有給は (\d+)日/.exec(composed.summary);
  ok('使う有給が予算以内に収まる', used && Number(used[1]) <= 5, composed.summary);
  ok('申請用テキストが組まれる', /有給休暇の取得予定/.test(composed.request) && /有給取得希望/.test(composed.request),
    composed.request.slice(0, 80));
  ok('コピーボタンが押せるようになる', composed.copyDisabled === false);

  /* ---- 選択の解除 ---- */
  await page.click('#btn-clear-picked');
  await page.waitForTimeout(300);
  ok('選択をすべて外せる',
    await page.evaluate(() => document.querySelectorAll('#picked-list .plan').length === 0
      && document.getElementById('request-text').value === ''));

  /* ---- おすすめからの手動追加 ---- */
  await page.click('#tab-plans');
  await page.click('#plan-list .plan .plan-toggle');
  await page.waitForTimeout(300);
  const manual = await page.evaluate(() => ({
    label: document.querySelector('#plan-list .plan .plan-toggle').textContent,
    picked: document.querySelectorAll('#picked-list .plan').length
  }));
  ok('おすすめから年間プランに追加できる', manual.picked === 1, '件数: ' + manual.picked);
  ok('追加後はボタンの文言が変わる', manual.label.includes('外す'), manual.label);

  /* ---- 重なるプランは押せず、理由がその場に出る（レビュー R1・R6 / 原因α） ---- */
  await page.check('#opt-show-all');
  await page.waitForTimeout(400);
  const conflict = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#plan-list .plan-toggle'));
    const blocked = buttons.find((b) => b.disabled);
    const addable = buttons.find((b) => !b.disabled && b.textContent.includes('追加'));
    return {
      blockedCount: buttons.filter((b) => b.disabled).length,
      blockedText: blocked ? blocked.textContent : '',
      blockedLabel: blocked ? blocked.getAttribute('aria-label') : '',
      addableLabel: addable ? addable.getAttribute('aria-label') : ''
    };
  });
  ok('選択済みと重なるプランのボタンが無効になる', conflict.blockedCount > 0, '件数: ' + conflict.blockedCount);
  ok('押せない理由がボタンの文言に出る', /重なります/.test(conflict.blockedText), conflict.blockedText);
  ok('押せない理由が読み上げ用にも入る', /重なるため追加できません/.test(conflict.blockedLabel), conflict.blockedLabel);
  ok('押せるボタンは読み上げでどの連休か分かる', /連休を年間プランに追加/.test(conflict.addableLabel), conflict.addableLabel);
  await page.uncheck('#opt-show-all');
  await page.waitForTimeout(400);

  /* ---- カレンダーと祝日 ---- */
  await page.click('#tab-calendar');
  const calendar = await page.evaluate(() => ({
    months: document.querySelectorAll('#calendar .cal-month').length,
    paid: document.querySelectorAll('#calendar .cal-day[data-kind="paid"]').length,
    marks: Array.from(document.querySelectorAll('#calendar .cal-day[data-kind] .cal-mark'))
      .every((m) => m.textContent.length > 0)
  }));
  ok('カレンダーが12か月分出る', calendar.months === 12, '月数: ' + calendar.months);
  ok('選んだ有給がカレンダーに出る', calendar.paid > 0, '件数: ' + calendar.paid);
  ok('休みの種別に記号が併記される（色だけに頼らない）', calendar.marks);

  await page.click('#tab-holidays');
  const holidays = await page.evaluate(() => ({
    rows: document.querySelectorAll('#holiday-tbody tr').length,
    note: document.getElementById('holiday-note').textContent,
    kinds: new Set(Array.from(document.querySelectorAll('#holiday-tbody .kind-tag')).map((t) => t.textContent)).size
  }));
  ok('祝日が17件以上並ぶ', holidays.rows >= 17, '件数: ' + holidays.rows);
  ok('近似式であることが明記される', /官報/.test(holidays.note), holidays.note);
  ok('種別が区別して表示される', holidays.kinds >= 1, '種別数: ' + holidays.kinds);

  /* ---- タブのキーボード操作 ---- */
  await page.focus('#tab-holidays');
  await page.keyboard.press('Home');
  ok('Home キーで最初のタブへ移動する',
    await page.evaluate(() => document.getElementById('tab-plans').getAttribute('aria-selected') === 'true'));
  await page.keyboard.press('ArrowRight');
  ok('右矢印キーで次のタブへ移動する',
    await page.evaluate(() => document.getElementById('tab-year').getAttribute('aria-selected') === 'true'
      && document.getElementById('panel-plans').hidden === true));

  /* ---- テーマ ---- */
  await page.click('[data-theme-value="dark"]');
  ok('ダークテーマに切り替わる',
    await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'));
  await page.click('[data-theme-value="system"]');
  ok('自動に戻せる',
    await page.evaluate(() => document.documentElement.getAttribute('data-theme') === null));

  /* ---- 保存は既定 OFF ---- */
  const storage = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return { checked: document.getElementById('opt-remember').checked, keys };
  });
  ok('保存は既定で無効', storage.checked === false);
  ok('保存が無効なら入力を端末に残さない', storage.keys.length === 0, storage.keys.join(', '));

  /* ---- 書き出し・読み込み（「詳しい設定」の中にある） ---- */
  await page.click('details.advanced > summary');
  ok('詳しい設定を開ける', await page.evaluate(() => document.querySelector('details.advanced').open === true));
  await page.click('#btn-export');
  const exported = await page.evaluate(() => document.getElementById('io-text').value);
  ok('設定を JSON で書き出せる',
    /"weeklyOff"/.test(exported) && /"blackout"/.test(exported) && /"showAll"/.test(exported), exported.slice(0, 60));
  ok('書き出しに有給の希望日そのものを含めない（区間だけを持つ）',
    !/"take"/.test(exported) && !/"cost"/.test(exported));

  await page.fill('#io-text', '{"budget": 9999, "sort": "drop", "weeklyOff": [9, 1], "blackout": "x"}');
  await page.click('#btn-import');
  await page.waitForTimeout(400);
  const imported = await page.evaluate(() => ({
    budget: document.getElementById('budget').value,
    sort: document.getElementById('sort').value,
    saturday: document.querySelector('.dow-check[data-dow="6"]').checked,
    monday: document.querySelector('.dow-check[data-dow="1"]').checked,
    blackouts: document.querySelectorAll('#blackout-list li').length,
    status: document.getElementById('io-status').textContent,
    plans: document.querySelectorAll('#plan-list .plan').length
  }));
  ok('不正な予算は上限に丸められる', Number(imported.budget) === 40, imported.budget);
  ok('不明な並び順は既定に戻る', imported.sort === 'efficiency', imported.sort);
  ok('範囲外の曜日は無視される', imported.saturday === false && imported.monday === true,
    '土:' + imported.saturday + ' 月:' + imported.monday);
  ok('配列でない休めない期間は空になる', imported.blackouts === 0);
  ok('読み込み後も計算できる', imported.plans > 0, '件数: ' + imported.plans);

  await page.click('#btn-reset');
  await page.waitForTimeout(400);
  ok('初期化で既定値に戻る',
    await page.evaluate(() => document.querySelector('.dow-check[data-dow="6"]').checked === true
      && document.querySelectorAll('#blackout-list li').length === 0));

  /* ---- 通信ゼロ ---- */
  const external = requests.filter((url) => !url.startsWith('file://'));
  ok('外部への通信が発生しない', external.length === 0, external.join(', '));
  ok('コンソールエラーがない', consoleErrors.length === 0, consoleErrors.join(' / '));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.condition);
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' 件成功');
if (failed.length > 0) process.exit(1);
