const assert = require('assert');
const path = require('path');
const { countMora, judgeMora } = require(path.join(__dirname, '..', 'src', 'mora.js'));

const cases = [
  // [input, expectedMora, description]
  ['がっこう', 4, '促音を含む語'],
  ['しゃぼんだま', 5, '拗音を含む語'],
  ['きって', 3, '促音を含む語(2)'],
  ['きゃ', 1, '拗音単体'],
  ['ふぉーく', 3, '拗音(ふぉ)+長音を含む語'],
  ['こんにちは', 5, '撥音を含む語'],
  ['たんぽぽ', 4, '撥音を含む語(2)'],
  ['ラーメン', 4, 'カタカナ+長音+撥音'],
  ['', 0, '空文字'],
  ['古池や', 1, '漢字+かな混在（「や」の1音のみカウント）'],
  ['蛙飛びこむ', 3, '漢字混じり（「びこむ」の3音のみカウント）'],
  ['水の音', 1, '漢字混じり（「の」の1音のみカウント）'],
  ['ちゃんぴおん', 5, '拗音+撥音を含む語'],
];

let passed = 0;
let failed = 0;

for (const [input, expected, description] of cases) {
  const actual = countMora(input);
  if (actual === expected) {
    passed++;
    console.log(`OK   ${description}: "${input}" => ${actual}`);
  } else {
    failed++;
    console.error(`FAIL ${description}: "${input}" => ${actual} (expected ${expected})`);
  }
}

// judgeMora の確認
assert.strictEqual(judgeMora(5, 5), 'ok');
assert.strictEqual(judgeMora(4, 5), 'ng');
assert.strictEqual(judgeMora(0, 5), 'ng');
passed += 3;
console.log('OK   judgeMora の境界値確認');

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
