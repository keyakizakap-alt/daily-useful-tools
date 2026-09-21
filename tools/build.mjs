#!/usr/bin/env node
// src/ から配信用の単一 HTML（yasumi/index.html）を生成する。
//
// 行うのは次の4つだけ。想定外の書き方を見つけたらエラーで止める。
//   1. ES Modules を依存順に連結し、import 行の削除と export 接頭辞の除去を行う
//   2. CSS を <style> に、JS を <script> に埋め込む
//   3. 埋め込んだ <script> の SHA-256 を計算し、CSP の script-src に書き込む
//   4. 生成物を書き出す

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 連結順（依存の浅いものから）。 */
export const SOURCES = [
  'src/lib/date.js',
  'src/lib/holidays.js',
  'src/lib/calendar.js',
  'src/lib/planner.js',
  'src/lib/ics.js',
  'src/lib/settings.js',
  'src/app.js',
];

export const TEMPLATE = 'src/index.template.html';
export const STYLE = 'src/app.css';
export const OUTPUT = 'yasumi/index.html';

const IMPORT_LINE = /^import\s+.+\s+from\s+'[^']+';$/;
const EXPORT_PREFIX = /^export\s+(?=(?:const|let|function|class|async)\b)/;
const TOP_LEVEL_DECL = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;

/** 1ファイルをブラウザ向けに変換する。 */
export function transformModule(source, file) {
  const out = [];
  for (const [i, line] of source.split('\n').entries()) {
    if (line.startsWith('import')) {
      if (!IMPORT_LINE.test(line.trim())) {
        throw new Error(`${file}:${i + 1} import は1行の 'import … from "…";' 形式で書いてください: ${line}`);
      }
      continue; // 連結するので import は不要
    }
    if (line.startsWith('export')) {
      if (!EXPORT_PREFIX.test(line)) {
        throw new Error(`${file}:${i + 1} export default / export { … } は使えません: ${line}`);
      }
      out.push(line.replace(EXPORT_PREFIX, ''));
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function collectTopLevelNames(source, file, seen) {
  for (const [i, line] of source.split('\n').entries()) {
    const match = TOP_LEVEL_DECL.exec(line);
    if (!match) continue;
    const name = match[1];
    if (seen.has(name)) {
      throw new Error(`${file}:${i + 1} トップレベルの名前が重複しています: ${name}（${seen.get(name)} で定義済み）`);
    }
    seen.set(name, file);
  }
}

export function cspFor(scriptHash) {
  return [
    "default-src 'none'",
    `script-src 'sha256-${scriptHash}'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function sha256Base64(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

/** 生成した HTML 文字列を返す（ファイルには書き込まない）。 */
export async function build({ root = ROOT } = {}) {
  const seen = new Map();
  const chunks = [];
  for (const file of SOURCES) {
    const source = await readFile(path.join(root, file), 'utf8');
    const transformed = transformModule(source, file);
    collectTopLevelNames(transformed, file, seen);
    chunks.push(`/* ==== ${file} ==== */\n${transformed.trim()}`);
  }

  const script = ["'use strict';", '(() => {', ...chunks, '})();'].join('\n\n');
  const style = (await readFile(path.join(root, STYLE), 'utf8')).trim();
  const template = await readFile(path.join(root, TEMPLATE), 'utf8');

  if (!template.includes('__STYLE__') || !template.includes('__SCRIPT__') || !template.includes('__CSP__')) {
    throw new Error('テンプレートに __STYLE__ / __SCRIPT__ / __CSP__ のいずれかがありません');
  }

  const withAssets = template.replace('__STYLE__', () => style).replace('__SCRIPT__', () => script);

  // CSP のハッシュは <script> 要素の中身そのもの（前後の空白を含む）に対して計算する。
  const inline = /<script>([\s\S]*?)<\/script>/.exec(withAssets);
  if (!inline) throw new Error('生成した HTML に <script> が見つかりません');

  return withAssets.replace('__CSP__', () => cspFor(sha256Base64(inline[1])));
}

export async function writeBuild({ root = ROOT } = {}) {
  const html = await build({ root });
  const target = path.join(root, OUTPUT);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
  return { target, bytes: Buffer.byteLength(html, 'utf8') };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const { target, bytes } = await writeBuild();
  process.stdout.write(`生成しました: ${path.relative(ROOT, target)} (${(bytes / 1024).toFixed(1)} KB)\n`);
}
