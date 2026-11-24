// としめくり の静的検査（通信・XSS・秘密情報）。assert の失敗メッセージには「直し方」を書く。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(appDir, 'index.html'), 'utf8');
const srcFiles = readdirSync(join(appDir, 'src')).map((name) => ({
  name,
  text: readFileSync(join(appDir, 'src', name), 'utf8'),
}));

test('index.html の CSP が外部通信とインラインスクリプトを禁止している', () => {
  const m = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(m, 'CSP の meta が無い。直し方: index.html の head に Content-Security-Policy を置く');
  const csp = m[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(directive), `CSP に ${directive} が無い。直し方: index.html の CSP に追加する`);
  }
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), 'CSP に unsafe-* がある。直し方: インラインのスクリプト・スタイルを外部ファイルに移す');
});

test('index.html にインラインスクリプト・外部 URL の読み込みが無い', () => {
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'インラインの <script> がある。直し方: src/*.js に移す');
  assert.ok(!/\son[a-z]+=/i.test(html), 'onclick などのインラインイベント属性がある。直し方: app.js で addEventListener する');
  assert.ok(!/(src|href)="(https?:)?\/\//.test(html), '外部 URL を読み込んでいる。直し方: 依存をローカルに置くか削除する');
});

test('src/ に通信 API・危険な DOM 操作・動的評価が無い', () => {
  const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/];
  for (const f of srcFiles) {
    for (const re of banned) {
      assert.ok(!re.test(f.text), `src/${f.name} に ${re} がある。直し方: 通信をやめる／textContent と createElement で描画する`);
    }
  }
});

test('入力内容を localStorage に保存しない（保存はテーマのみ）', () => {
  const app = srcFiles.find((f) => f.name === 'app.js').text;
  const calls = app.match(/localStorage\.setItem\(([^,]+),/g) || [];
  assert.equal(calls.length, 1, 'localStorage.setItem の呼び出しが1か所でない。直し方: 入力値を保存しない');
  assert.ok(calls[0].includes('THEME_KEY'), 'テーマ以外を保存している。直し方: setItem はテーマキーだけにする');
  assert.ok(!/sessionStorage|indexedDB|document\.cookie/.test(app), 'テーマ以外のストレージを使っている');
});

test('秘密情報らしき文字列が無い', () => {
  const secret = /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/i;
  for (const f of [...srcFiles, { name: 'index.html', text: html }]) {
    assert.ok(!secret.test(f.text), `${f.name} に秘密情報らしき文字列がある。直し方: 削除して環境変数で渡す（このアプリは秘密情報を持たない設計）`);
  }
});
