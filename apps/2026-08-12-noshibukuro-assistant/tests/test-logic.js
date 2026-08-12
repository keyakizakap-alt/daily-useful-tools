/**
 * ロジック層（大字変換・データ検索）のユニットテスト。
 * 実行方法: node tests/test-logic.js
 * ブラウザ用のUMDモジュール（src/logic.js, src/data/occasions.data.js）を
 * そのままNodeからrequireして検証する（ビルド不要）。
 */
const assert = require('assert');
const path = require('path');

const logic = require(path.join(__dirname, '..', 'src', 'logic.js'));
const data = require(path.join(__dirname, '..', 'src', 'data', 'occasions.data.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('大字変換ロジック');
test('30,000円 -> 金参萬円 (AC-3)', () => {
  assert.strictEqual(logic.formatMoney(30000), '金参萬円');
});

test('12,345円 -> 金壱萬弐仟参百四拾伍円 (AC-4)', () => {
  assert.strictEqual(logic.formatMoney(12345), '金壱萬弐仟参百四拾伍円');
});

test('1円 -> 金壱円', () => {
  assert.strictEqual(logic.formatMoney(1), '金壱円');
});

test('100円 -> 金壱百円', () => {
  assert.strictEqual(logic.formatMoney(100), '金壱百円');
});

test('10,000,000円 -> 金壱千萬円は範囲外にならず変換できる', () => {
  // 桁の位はグループ内で完結するため 1000万は「壱阡萬」ではなく「壱仟萬」表記になる
  assert.strictEqual(logic.formatMoney(10000000), '金壱仟萬円');
});

test('0円 -> 零 の変換（例外を投げない）', () => {
  assert.strictEqual(logic.toDaiji(0), '零');
});

test('範囲外の金額(-1)はRangeErrorを投げる', () => {
  assert.throws(() => logic.toDaiji(-1), RangeError);
});

test('範囲外の金額(100,000,000)はRangeErrorを投げる', () => {
  assert.throws(() => logic.toDaiji(100000000), RangeError);
});

console.log('相場レンジ判定ロジック');
test('parseRangeは "10,000円〜30,000円" から low/high を抽出できる', () => {
  const range = logic.parseRange('10,000円〜30,000円');
  assert.deepStrictEqual(range, { low: 10000, high: 30000 });
});

test('isWithinRangeはレンジ内でtrueを返す', () => {
  assert.strictEqual(logic.isWithinRange(20000, '10,000円〜30,000円'), true);
});

test('isWithinRangeはレンジ外でfalseを返す', () => {
  assert.strictEqual(logic.isWithinRange(5000, '10,000円〜30,000円'), false);
});

test('isWithinRangeはテキストが無い場合nullを返す', () => {
  assert.strictEqual(logic.isWithinRange(5000, null), null);
});

console.log('データ検索ロジック');
test('全11行事がデータに含まれる', () => {
  assert.strictEqual(data.occasions.length, 11);
});

test('findOccasionで結婚祝いを取得できる', () => {
  const wedding = logic.findOccasion(data, 'wedding');
  assert.strictEqual(wedding.name, '結婚祝い');
});

test('結婚祝い×友人・知人の相場が取得できる (AC-1)', () => {
  const wedding = logic.findOccasion(data, 'wedding');
  const souba = logic.getSoubaText(wedding, 'friend');
  assert.strictEqual(souba, '20,000円〜30,000円');
});

test('香典（通夜葬儀）の表書きは御霊前 (AC-2)', () => {
  const occasion = logic.findOccasion(data, 'funeral_buddhist_wake');
  assert.strictEqual(occasion.omotegaki[0].text, '御霊前');
});

test('香典（四十九日以降）の表書きは御仏前 (AC-2)', () => {
  const occasion = logic.findOccasion(data, 'funeral_buddhist_after49');
  assert.strictEqual(occasion.omotegaki[0].text, '御仏前');
});

test('お年玉は年齢モードで、相場が年齢層ごとに取得できる', () => {
  const otoshidama = logic.findOccasion(data, 'otoshidama');
  assert.strictEqual(otoshidama.relationMode, 'age');
  assert.strictEqual(logic.getSoubaText(otoshidama, 'elementary'), '3,000円〜5,000円');
});

test('存在しない行事IDはnullを返す', () => {
  assert.strictEqual(logic.findOccasion(data, 'no-such-id'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
