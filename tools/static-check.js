#!/usr/bin/env node
/**
 * static-check — 依存パッケージなしの静的解析。
 *
 * 検査項目
 *   1. すべての JS が構文として正しいこと
 *   2. XSS 経路（innerHTML 系 / eval / document.write）を使っていないこと
 *   3. 外部通信の痕跡（fetch / XHR / WebSocket / 外部 URL）がないこと
 *   4. index.html の CSP が宣言されていること
 *   5. index.html が参照するローカル資源が実在すること
 *   6. 秘匿情報らしい文字列が埋め込まれていないこと
 *
 * 使い方: node tools/static-check.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'src');
const SCAN_DIRS = [APP_DIR, path.join(ROOT, 'tests'), path.join(ROOT, 'tools')];

const problems = [];
const notes = [];

function fail(file, message) {
  problems.push(`${path.relative(ROOT, file)}: ${message}`);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

// ---------------------------------------------------------------- 1. 構文

const jsFiles = SCAN_DIRS.flatMap(walk).filter((file) => file.endsWith('.js'));
jsFiles.forEach((file) => {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    fail(file, `構文エラー\n${String(error.stderr || error.message).trim()}`);
  }
});
notes.push(`構文チェック: ${jsFiles.length} ファイル`);

// ---------------------------------------------------------------- 2〜3. 危険なパターン

/** src/ 配下で使用を禁じるパターン */
const FORBIDDEN = [
  { re: /\.innerHTML\s*=/, label: 'innerHTML への代入（XSS 経路）' },
  { re: /\.outerHTML\s*=/, label: 'outerHTML への代入（XSS 経路）' },
  { re: /insertAdjacentHTML/, label: 'insertAdjacentHTML（XSS 経路）' },
  { re: /document\.write/, label: 'document.write' },
  { re: /\beval\s*\(/, label: 'eval' },
  { re: /new\s+Function\s*\(/, label: 'new Function' },
  { re: /\bfetch\s*\(/, label: 'fetch（このアプリは通信しない）' },
  { re: /XMLHttpRequest/, label: 'XMLHttpRequest（このアプリは通信しない）' },
  { re: /\bWebSocket\b/, label: 'WebSocket（このアプリは通信しない）' },
  { re: /sendBeacon/, label: 'navigator.sendBeacon（このアプリは通信しない）' },
  { re: /importScripts/, label: 'importScripts' },
  { re: /setTimeout\s*\(\s*['"`]/, label: '文字列を渡す setTimeout（暗黙の eval）' },
  { re: /setInterval\s*\(\s*['"`]/, label: '文字列を渡す setInterval（暗黙の eval）' },
];

/** 秘匿情報らしい文字列 */
const SECRET_PATTERNS = [
  { re: /\b(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: '秘匿情報らしいリテラル' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS アクセスキーらしい文字列' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/, label: 'GitHub トークンらしい文字列' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: '秘密鍵' },
];

const appFiles = walk(APP_DIR);
appFiles.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    // 行コメント・CSS コメント内の記述は検査対象外（説明文で言及するため）
    const trimmed = line.trim();
    const isComment =
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('<!--');
    if (isComment) return;

    FORBIDDEN.forEach((rule) => {
      if (rule.re.test(line)) fail(file, `${index + 1}行目: ${rule.label}`);
    });
    SECRET_PATTERNS.forEach((rule) => {
      if (rule.re.test(line)) fail(file, `${index + 1}行目: ${rule.label}`);
    });

    // 外部リソースの参照（CSP の宣言そのものは除く）
    const urls = line.match(/https?:\/\/[^\s'"<>)]+/g) || [];
    urls.forEach((url) => {
      if (url.startsWith('http://www.w3.org/')) return; // SVG 名前空間
      fail(file, `${index + 1}行目: 外部 URL を参照している: ${url}`);
    });
  });
});
notes.push(`危険パターン走査: ${appFiles.length} ファイル`);

// ---------------------------------------------------------------- 4. CSP

const indexPath = path.join(APP_DIR, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const cspMatch = indexHtml.match(
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/
);
if (!cspMatch) {
  fail(indexPath, 'CSP の meta が見つからない');
} else {
  const csp = cspMatch[1];
  [
    ["default-src 'none'", 'default-src を none で始めていない'],
    ["connect-src 'none'", 'connect-src を none にしていない'],
    ["base-uri 'none'", 'base-uri を none にしていない'],
    ["form-action 'none'", 'form-action を none にしていない'],
  ].forEach(([needle, message]) => {
    if (!csp.includes(needle)) fail(indexPath, `CSP: ${message}`);
  });
  if (/script-src[^;]*'unsafe-inline'/.test(csp)) {
    fail(indexPath, "CSP: script-src に 'unsafe-inline' がある");
  }
  if (/script-src[^;]*'unsafe-eval'/.test(csp)) {
    fail(indexPath, "CSP: script-src に 'unsafe-eval' がある");
  }
  // meta では無視されるため、書いてあると通っていると誤解する（配信側のヘッダで指定する）
  if (csp.includes('frame-ancestors')) {
    fail(indexPath, 'CSP: frame-ancestors は meta では無視されるので書かない（HTTP ヘッダで指定する）');
  }
  // element.style 経由（CSSOM）は CSP の管轄外なので 'unsafe-inline' は不要
  if (/style-src[^;]*'unsafe-inline'/.test(csp)) {
    fail(indexPath, "CSP: style-src の 'unsafe-inline' は不要（CSSOM は CSP の管轄外）");
  }
  notes.push('CSP: 宣言を確認');
}

// インラインスクリプト（CSP でブロックされるので存在してはいけない）
const inlineScripts = indexHtml.match(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g) || [];
inlineScripts
  .filter((block) => block.replace(/<\/?script[^>]*>/g, '').trim().length > 0)
  .forEach(() => fail(indexPath, 'インラインスクリプトがある（CSP でブロックされる）'));

// ---------------------------------------------------------------- 5. 参照先の実在

const references = [
  ...(indexHtml.match(/<link[^>]+href="([^"]+)"/g) || []),
  ...(indexHtml.match(/<script[^>]+src="([^"]+)"/g) || []),
]
  .map((tag) => {
    const match = tag.match(/(?:href|src)="([^"]+)"/);
    return match ? match[1] : null;
  })
  .filter((href) => href && !href.startsWith('#') && !/^[a-z]+:/i.test(href));

references.forEach((href) => {
  const target = path.join(APP_DIR, href);
  if (!fs.existsSync(target)) fail(indexPath, `参照先が存在しない: ${href}`);
});
notes.push(`参照先の実在: ${references.length} 件`);

// ---------------------------------------------------------------- 6. 依存パッケージ

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
  fail(path.join(ROOT, 'package.json'), '実行時依存が追加されている（0 個であること）');
}
if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
  fail(path.join(ROOT, 'package.json'), '開発時依存が追加されている（0 個であること）');
}

// lockfile にパッケージが載っていないこと（npm audit を成立させるために置いてある）
const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const installed = Object.keys(lock.packages || {}).filter((name) => name !== '');
  if (installed.length > 0) {
    fail(lockPath, `lockfile に依存が載っている: ${installed.join(', ')}`);
  }
} else {
  fail(lockPath, 'package-lock.json がない（npm audit が実行できない）');
}
notes.push('依存パッケージ: 0 個（package.json / package-lock.json とも）');

// ---------------------------------------------------------------- 結果

notes.forEach((note) => console.log(`  ${note}`));

if (problems.length > 0) {
  console.error(`\n静的解析: ${problems.length} 件の問題\n`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log('\n静的解析: 問題なし');
