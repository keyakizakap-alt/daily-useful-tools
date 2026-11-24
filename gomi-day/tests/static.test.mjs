// あしたのごみ: ソースの静的検査（危険なAPI・外部読み込み・秘密情報）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(appDir, p), "utf8");
const sources = ["src/app.js", "src/rules.js"].map((p) => [p, read(p)]);
const html = read("index.html");

test("HTML を文字列で差し込む API や eval を使っていない", () => {
  const banned = /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/;
  for (const [path, src] of sources) {
    assert.ok(!banned.test(src), `${path} に ${src.match(banned)?.[0]} がある。直し方: textContent と createElement で描画する`);
  }
});

test("CSP で外部の読み込み・通信を禁止している", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(directive), `CSP に ${directive} が無い。直し方: index.html の meta の CSP に追加する`);
  }
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), "CSP に unsafe-* がある。直し方: インラインのスクリプト・スタイルを src/ のファイルに移す");
  assert.ok(!/<script>(?!<\/script>)|\son[a-z]+="/i.test(html), "index.html にインラインのスクリプトかイベント属性がある。直し方: src/app.js でイベントを登録する");
  assert.ok(!/(src|href)="https?:/i.test(html), "index.html が外部のファイルを読み込んでいる。直し方: 外部 CDN・フォントを使わない");
});

test("通信の API や秘密情報らしき文字列を含まない", () => {
  for (const [path, src] of sources) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src), `${path} に通信の処理がある。直し方: 通信しない設計（docs/architecture.md）に戻す`);
    assert.ok(!/(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']+["']/i.test(src), `${path} に秘密情報らしき値がある。直し方: ハードコードせず削除する`);
  }
});
