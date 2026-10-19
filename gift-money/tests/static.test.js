/* ============================================================
   つつみかた — 静的解析
   ------------------------------------------------------------
   設計書の「セキュリティ方針」を機械的に検査する。
   - 入力を HTML として解釈する API を使わない
   - 通信 API・ストレージ API を使わない
   - 秘密情報らしき文字列を含まない
   - CSP が宣言どおりである
   実行: npm test（node --test tests/*.test.js）
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = ['src/engine.js', 'src/app.js'];
const ALL = SRC.concat(['index.html', 'src/styles.css']);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

// コメントを除いたコード（説明文中の API 名で誤検知しないため）
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

test('構文チェック（node --check）', () => {
  for (const rel of SRC) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)]);
  }
});

const FORBIDDEN = [
  [/\.innerHTML\b/, 'innerHTML'],
  [/\.outerHTML\b/, 'outerHTML'],
  [/insertAdjacentHTML/, 'insertAdjacentHTML'],
  [/document\.write/, 'document.write'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\b/, 'new Function'],
  [/set(Timeout|Interval)\s*\(\s*['"]/, '文字列を渡す setTimeout / setInterval'],
  [/\bfetch\s*\(/, 'fetch'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/WebSocket/, 'WebSocket'],
  [/EventSource/, 'EventSource'],
  [/sendBeacon/, 'sendBeacon'],
  [/localStorage|sessionStorage|indexedDB/, 'Web Storage / IndexedDB'],
  [/document\.cookie/, 'document.cookie'],
  [/postMessage/, 'postMessage']
];

test('危険な API・通信 API・ストレージ API を使っていない', () => {
  for (const rel of SRC) {
    const code = stripComments(read(rel));
    for (const [re, name] of FORBIDDEN) {
      assert.ok(!re.test(code), rel + ' で ' + name + ' が使われている');
    }
  }
});

test('秘密情報らしき文字列を含まない', () => {
  const patterns = [
    /AKIA[0-9A-Z]{16}/, // AWS アクセスキー
    /sk-[A-Za-z0-9_-]{20,}/, // API キー
    /gh[pousr]_[A-Za-z0-9]{30,}/, // GitHub トークン
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i
  ];
  for (const rel of ALL) {
    const text = read(rel);
    for (const re of patterns) assert.ok(!re.test(text), rel + ' が ' + re + ' に一致');
  }
});

test('index.html: CSP が通信・外部読み込みを禁止している', () => {
  const html = read('index.html');
  const m = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'CSP の meta が無い');
  const csp = m[1];
  for (const d of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(d), 'CSP に ' + d + ' が無い');
  }
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), 'CSP に unsafe-* がある');
});

test('index.html: インラインスクリプト・インラインスタイル・外部 URL を持たない', () => {
  const html = read('index.html');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'インラインスクリプトがある');
  assert.ok(!/<style\b/.test(html), '<style> がある');
  assert.ok(!/\sstyle="/.test(html), 'style 属性がある');
  assert.ok(!/\son[a-z]+="/.test(html), 'インラインのイベントハンドラがある');
  assert.ok(!/(src|href)="https?:/.test(html), '外部 URL を読み込んでいる');
  assert.ok(!/<form\b/.test(html), '<form> がある');
});

test('個人情報の入力欄は autocomplete="off"', () => {
  const html = read('index.html');
  for (const id of ['name', 'zip', 'address', 'amount', 'per-person', 'people']) {
    const re = new RegExp('<input id="' + id + '"[^>]*autocomplete="off"');
    assert.ok(re.test(html), '#' + id);
  }
});

test('package.json に依存パッケージが無い', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});
