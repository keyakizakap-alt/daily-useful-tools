// 単一HTMLファイル版をビルドするスクリプト。
// CSS・JSを全てインライン化するため、生成物はサーバーなしで
// ブラウザから直接開ける（file:// でも動作する）。
//
//   node build.js   ->   dist/warikan-standalone.html

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const outDir = join(root, "dist");
const outFile = join(outDir, "warikan-standalone.html");

const read = (name) => readFileSync(join(src, name), "utf8");

const html = read("index.html");
const css = read("style.css");
const warikan = read("warikan.js");
const app = read("app.js");

// ダークモードのトークンを3つの状態すべてに対応させる。
// 1. bare :root                    -> ライト（既定）
// 2. prefers-color-scheme: dark    -> OSがダーク、かつ明示的なライト指定がない場合
// 3. :root[data-theme="dark"]      -> ホスト側が明示的にダークを指定した場合
// これによりOS設定・ホスト側の切り替えのどちらでも配色が崩れない。
const DARK_TOKENS = `  --bg: #1c1a19;
  --card-bg: #262322;
  --text: #f1ece7;
  --muted: #b3a99f;
  --border: #3a3532;`;

const originalDarkBlock = `@media (prefers-color-scheme: dark) {
  :root {
${DARK_TOKENS.split("\n").map((line) => `  ${line}`).join("\n")}
  }
}`;

const themeAwareDarkBlock = `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${DARK_TOKENS.split("\n").map((line) => `  ${line}`).join("\n")}
  }
}

:root[data-theme="dark"] {
${DARK_TOKENS}
}`;

if (!css.includes(originalDarkBlock)) {
  throw new Error(
    "style.css のダークモードブロックが見つかりませんでした。build.js の置換パターンを更新してください。",
  );
}
const themedCss = css.replace(originalDarkBlock, themeAwareDarkBlock);

// warikan.js の export と、app.js の import を取り除いて1つのモジュールに結合する。
const inlinedScript = [
  warikan.replace(/^export /gm, ""),
  app.replace(/^import .*?;\s*$/ms, "").replace(/^import[^;]*;\n/gm, ""),
].join("\n");

if (inlinedScript.includes("import {")) {
  throw new Error("app.js の import 文を除去できませんでした。");
}

const standalone = html
  .replace(
    /\n?\s*<link rel="stylesheet" href="style\.css" \/>/,
    `\n    <style>\n${themedCss}\n    </style>`,
  )
  .replace(
    /\s*<script type="module" src="app\.js"><\/script>/,
    `\n    <script type="module">\n${inlinedScript}\n    </script>`,
  );

if (standalone.includes('href="style.css"') || standalone.includes('src="app.js"')) {
  throw new Error("外部ファイル参照の置換に失敗しました。");
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, standalone, "utf8");

console.log(`生成しました: ${outFile}`);
console.log(`サイズ: ${(standalone.length / 1024).toFixed(1)} KB`);
