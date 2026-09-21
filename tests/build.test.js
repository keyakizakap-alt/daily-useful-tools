// 配信物（yasumi/index.html）が src/ と一致していること、CSP が実体と合っていることを検証する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ROOT, OUTPUT, build, transformModule, sha256Base64, cspFor } from '../tools/build.mjs';

const builtPath = path.join(ROOT, OUTPUT);

test('コミット済みの配信物が src/ の再ビルド結果と一致する', async () => {
  const [expected, actual] = await Promise.all([build(), readFile(builtPath, 'utf8')]);
  assert.equal(
    actual,
    expected,
    'yasumi/index.html が古くなっています。`npm run build` を実行してコミットしてください。',
  );
});

test('CSP のハッシュが埋め込んだスクリプトと一致する', async () => {
  const html = await readFile(builtPath, 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(script, '<script> が見つからない');
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(csp, 'CSP の meta が見つからない');
  assert.equal(csp[1], cspFor(sha256Base64(script[1])));
  assert.equal(csp[1].includes("default-src 'none'"), true);
  assert.equal(csp[1].includes("'unsafe-eval'"), false);
});

test('配信物にモジュール構文が残っていない', async () => {
  const html = await readFile(builtPath, 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  for (const line of script.split('\n')) {
    assert.equal(/^\s*import\s/.test(line), false, `import が残っている: ${line}`);
    assert.equal(/^\s*export\s/.test(line), false, `export が残っている: ${line}`);
  }
});

test('配信物が外部リソースを参照していない', async () => {
  const html = await readFile(builtPath, 'utf8');
  const urls = html.match(/https?:\/\/[^\s"')]+/g) ?? [];
  const external = urls.filter((url) => !url.startsWith('http://www.w3.org/2000/svg'));
  assert.deepEqual(external, [], `外部参照が含まれている: ${external.join(', ')}`);
  assert.equal(/<link[^>]+href="(?!data:)/.test(html), false, '外部スタイル・フォントの読み込みがある');
});

test('transformModule は import を取り除き export を剥がす', () => {
  const source = ["import { a } from './a.js';", 'export const b = 1;', 'const c = 2;'].join('\n');
  assert.equal(transformModule(source, 'x.js'), ['const b = 1;', 'const c = 2;'].join('\n'));
});

test('transformModule は想定外のモジュール構文を拒否する', () => {
  assert.throws(() => transformModule('export default 1;', 'x.js'), /export default/);
  assert.throws(() => transformModule("export { a } from './a.js';", 'x.js'), /export default/);
  assert.throws(() => transformModule("import a, {\n b } from './a.js';", 'x.js'), /1行/);
});
