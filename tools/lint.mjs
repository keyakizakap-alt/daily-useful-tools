#!/usr/bin/env node
// 依存パッケージを増やさずに行う静的解析。
//   1. すべての JS を node --check で構文検査する
//   2. 危険な API（innerHTML / eval / 動的コード生成）の使用を禁止する
//   3. 外部への通信・外部リソース参照を禁止する（このアプリの前提そのもの）
//   4. 機密情報らしき文字列の直書きを検出する

import { readdir, readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const SCRIPT_DIRS = ['src', 'tools', 'tests'];
const CONTENT_TARGETS = ['src', 'tools', 'tests', 'yasumi'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'assets']);

const FORBIDDEN = [
  { re: /\.innerHTML\b/, message: 'innerHTML は使わない（textContent / createElement を使う）' },
  { re: /\.outerHTML\b/, message: 'outerHTML は使わない' },
  { re: /insertAdjacentHTML/, message: 'insertAdjacentHTML は使わない' },
  { re: /document\.write\s*\(/, message: 'document.write は使わない' },
  { re: /\beval\s*\(/, message: 'eval は使わない' },
  { re: /new\s+Function\s*\(/, message: '動的なコード生成は使わない' },
  { re: /\bfetch\s*\(/, message: '外部通信は行わない' },
  { re: /XMLHttpRequest/, message: '外部通信は行わない' },
  { re: /navigator\.sendBeacon/, message: '外部送信は行わない' },
  { re: /importScripts\s*\(/, message: '外部スクリプトの読み込みは行わない' },
  { re: /\bWebSocket\s*\(/, message: '外部通信は行わない' },
];

const SECRETS = [
  { re: /(api[-_]?key|secret|passwd|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, message: '機密情報らしき値の直書き' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: '秘密鍵の直書き' },
];

// SVG の名前空間 URI はリソースの取得先ではないため例外とする。
const ALLOWED_URLS = [/http:\/\/www\.w3\.org\/2000\/svg/];
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*|<!--|#)/;

async function walk(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, exts)));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

async function checkSyntax(files) {
  const problems = [];
  for (const file of files) {
    try {
      await execFileAsync(process.execPath, ['--check', file]);
    } catch (error) {
      problems.push({ file, line: 0, message: `構文エラー: ${String(error.stderr ?? error).split('\n')[0]}` });
    }
  }
  return problems;
}

async function checkContent(files) {
  const problems = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const isLinter = path.resolve(file) === path.resolve(fileURLToPath(import.meta.url));
    text.split('\n').forEach((line, index) => {
      const position = { file, line: index + 1 };
      if (!isLinter) {
        for (const rule of FORBIDDEN) {
          if (rule.re.test(line)) problems.push({ ...position, message: rule.message });
        }
      }
      for (const rule of SECRETS) {
        if (rule.re.test(line)) problems.push({ ...position, message: rule.message });
      }
      if (/https?:\/\//.test(line) && !COMMENT_LINE.test(line) && !ALLOWED_URLS.some((re) => re.test(line))) {
        problems.push({ ...position, message: '外部 URL の参照は行わない' });
      }
    });
  }
  return problems;
}

async function main() {
  const scripts = [];
  for (const dir of SCRIPT_DIRS) scripts.push(...(await walk(path.join(ROOT, dir), ['.js', '.mjs'])));

  const contentFiles = [];
  for (const dir of CONTENT_TARGETS) {
    contentFiles.push(...(await walk(path.join(ROOT, dir), ['.js', '.mjs', '.css', '.html'])));
  }

  const problems = [...(await checkSyntax(scripts)), ...(await checkContent(contentFiles))];

  for (const problem of problems) {
    const rel = path.relative(ROOT, problem.file);
    process.stderr.write(`${rel}:${problem.line}: ${problem.message}\n`);
  }

  if (problems.length > 0) {
    process.stderr.write(`\n静的解析: ${problems.length}件の指摘\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `静的解析: 問題なし（構文検査 ${scripts.length}件 / 内容検査 ${contentFiles.length}件）\n`,
  );
}

await stat(ROOT);
await main();
