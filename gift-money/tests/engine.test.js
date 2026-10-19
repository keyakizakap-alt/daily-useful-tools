/* ============================================================
   つつみかた — 判定エンジンの単体テスト
   実行: npm test（node --test tests/*.test.js）
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

function codes(results) {
  return results.map((r) => r.code);
}

/* ============================================================
   データの整合性
   ============================================================ */

test('全場面に必須の項目があり、ID が重複しない', () => {
  const ids = new Set();
  for (const ev of E.EVENTS) {
    assert.ok(!ids.has(ev.id), '場面 ID の重複: ' + ev.id);
    ids.add(ev.id);
    assert.ok(['celebration', 'condolence', 'sympathy'].includes(ev.kind), ev.id);
    assert.ok(['strict', 'soft', 'none'].includes(ev.evenRule), ev.id);
    assert.ok(E.MODIFIERS[ev.modifier], ev.id + ' の modifier');
    assert.ok(ev.relations.length > 0, ev.id + ' の関係');
    for (const key of ['mizuhiki', 'fukusa', 'bills', 'ink', 'timing']) {
      assert.equal(typeof ev.manners[key], 'string', ev.id + '.' + key);
    }
    assert.ok(ev.manners.omote.length > 0);
    const relIds = new Set();
    for (const rel of ev.relations) {
      assert.ok(!relIds.has(rel.id), ev.id + ' の関係 ID の重複: ' + rel.id);
      relIds.add(rel.id);
      assert.ok(rel.range[0] <= rel.range[1], ev.id + '/' + rel.id + ' の幅');
    }
  }
});

test('全場面×全関係×全年代で、推奨額が幅の中にあり、避けたい額にならない', () => {
  for (const ev of E.EVENTS) {
    for (const rel of ev.relations) {
      for (const mod of E.MODIFIERS[ev.modifier].options) {
        const rec = E.recommend(ev.id, rel.id, mod.id);
        const label = ev.id + '/' + rel.id + '/' + mod.id;
        assert.ok(rec.amount, label + ' に推奨額がない');
        assert.ok(rec.amount >= rel.range[0] && rec.amount <= rel.range[1], label);
        const checks = E.checkAmount(rec.amount, ev.id, rel.id);
        assert.equal(E.worstLevel(checks), 'ok', label + ': ' + codes(checks).join(','));
      }
    }
  }
});

test('年代が上がると推奨額は下がらない', () => {
  for (const ev of E.EVENTS) {
    for (const rel of ev.relations) {
      const [lo, mid, hi] = ['low', 'mid', 'high'].map((m) => E.recommend(ev.id, rel.id, m).amount);
      assert.ok(lo <= mid && mid <= hi, ev.id + '/' + rel.id);
    }
  }
});

test('代表的な推奨額', () => {
  assert.equal(E.recommend('wedding', 'friend', 'low').amount, 30000);
  assert.equal(E.recommend('wedding', 'sibling', 'low').amount, 30000);
  assert.equal(E.recommend('wedding', 'sibling', 'mid').amount, 50000);
  assert.equal(E.recommend('wedding', 'sibling', 'high').amount, 100000);
  assert.equal(E.recommend('funeral', 'friend', 'low').amount, 5000);
  assert.equal(E.recommend('funeral', 'friend', 'high').amount, 10000);
  assert.equal(E.recommend('school', 'grandchild', 'high').amount, 50000);
  assert.equal(E.recommend('wedding', 'sibling', 'mid').rangeText, '3万円〜10万円');
});

test('存在しない場面・関係は null', () => {
  assert.equal(E.recommend('nope', 'friend', 'mid'), null);
  assert.equal(E.recommend('wedding', 'nope', 'mid'), null);
  assert.equal(E.recommend('__proto__', 'friend', 'mid'), null);
  assert.equal(E.getEvent('constructor'), null);
});

/* ============================================================
   包み方
   ============================================================ */

test('香典の表書きは宗派で変わる', () => {
  assert.deepEqual(E.getManners('funeral', 'unknown').omote, ['御霊前']);
  assert.ok(E.getManners('funeral', 'jodoshinshu').omote.includes('御仏前'));
  assert.ok(!E.getManners('funeral', 'jodoshinshu').omote.includes('御霊前'));
  assert.ok(E.getManners('funeral', 'shinto').omote.includes('御玉串料'));
  assert.deepEqual(E.getManners('funeral', 'christian').omote, ['御花料']);
  assert.ok(E.getManners('memorial', 'buddhist').omote.includes('御仏前'));
});

test('不明な宗派は「わからない」として扱う', () => {
  assert.deepEqual(E.getManners('funeral', 'xxx'), E.getManners('funeral', 'unknown'));
  assert.deepEqual(E.getManners('funeral', '__proto__'), E.getManners('funeral', 'unknown'));
});

test('宗派の区別がない場面は、宗派を指定しても変わらない', () => {
  assert.deepEqual(E.getManners('wedding', 'christian'), E.getManners('wedding', 'unknown'));
});

test('getManners は元データを書き換えない', () => {
  const m = E.getManners('funeral', 'jodoshinshu');
  m.omote.push('改ざん');
  m.notes.push('改ざん');
  assert.ok(!E.getManners('funeral', 'jodoshinshu').omote.includes('改ざん'));
  assert.ok(!E.getEvent('funeral').manners.notes.includes('改ざん'));
});

test('弔事は薄墨・新札を避ける、慶事は新札', () => {
  assert.match(E.getManners('funeral').ink, /薄墨/);
  assert.match(E.getManners('funeral').bills, /新札は避ける/);
  assert.match(E.getManners('wedding').bills, /新札/);
  assert.match(E.getManners('wedding').mizuhiki, /結び切り/);
  assert.match(E.getManners('birth').mizuhiki, /蝶結び/);
});

/* ============================================================
   金額の判定
   ============================================================ */

test('入力の解釈（全角・カンマ・円を許容）', () => {
  assert.equal(E.parseAmount('30000'), 30000);
  assert.equal(E.parseAmount('３０,０００円'), 30000);
  assert.equal(E.parseAmount(' 5,000 '), 5000);
  assert.ok(Number.isNaN(E.parseAmount('3万')));
  assert.ok(Number.isNaN(E.parseAmount('-1000')));
  assert.ok(Number.isNaN(E.parseAmount('1e5')));
  assert.ok(Number.isNaN(E.parseAmount(null)));
  assert.ok(Number.isNaN(E.parseAmount('')));
});

test('不正な金額は error', () => {
  assert.deepEqual(codes(E.checkAmount('abc', 'wedding')), ['invalid']);
  assert.deepEqual(codes(E.checkAmount(0, 'wedding')), ['invalid']);
  assert.deepEqual(codes(E.checkAmount(1.5, 'wedding')), ['invalid']);
  assert.deepEqual(codes(E.checkAmount(NaN, 'wedding')), ['invalid']);
  assert.deepEqual(codes(E.checkAmount(Infinity, 'wedding')), ['invalid']);
  assert.deepEqual(codes(E.checkAmount(100000000, 'wedding')), ['too-large']);
  assert.equal(E.worstLevel(E.checkAmount('abc')), 'error');
});

test('忌み数（4・9）', () => {
  for (const a of [4000, 9000, 40000, 90000, 14000, 49000]) {
    assert.ok(codes(E.checkAmount(a, 'funeral')).includes('imikazu'), String(a));
  }
  for (const a of [3000, 5000, 10000, 30000, 100000]) {
    assert.ok(!codes(E.checkAmount(a, 'funeral')).includes('imikazu'), String(a));
  }
});

test('慶事の偶数', () => {
  assert.ok(codes(E.checkAmount(60000, 'wedding')).includes('even'));
  assert.ok(codes(E.checkAmount(2000, 'birth')).includes('even'));
  assert.ok(codes(E.checkAmount(20000, 'wedding')).includes('even-pair'));
  assert.ok(codes(E.checkAmount(80000, 'wedding')).includes('even-pair'));
  // 1万・10万は区切りのよい数として偶数扱いしない
  assert.deepEqual(codes(E.checkAmount(10000, 'birth')), ['ok']);
  assert.deepEqual(codes(E.checkAmount(100000, 'wedding')), ['ok']);
  // 4万は忌み数として1回だけ指摘し、偶数の指摘は重ねない
  assert.deepEqual(codes(E.checkAmount(40000, 'wedding')), ['imikazu']);
});

test('弔事の偶数は info に留める', () => {
  const r = E.checkAmount(20000, 'funeral');
  assert.deepEqual(codes(r), ['even-soft']);
  assert.equal(E.worstLevel(r), 'info');
});

test('千円未満の端数', () => {
  assert.ok(codes(E.checkAmount(12345, 'birth')).includes('fraction'));
  assert.ok(codes(E.checkAmount(500, 'birth')).includes('fraction'));
});

test('相場との比較', () => {
  // 結婚式出席で下限割れは warn
  const below = E.checkAmount(10000, 'wedding', 'friend').find((r) => r.code === 'below');
  assert.equal(below.level, 'warn');
  // それ以外の下限割れは info
  assert.equal(E.checkAmount(3000, 'funeral', 'friend').find((r) => r.code === 'below').level, 'info');
  // 上限の1.5倍超えで above。弔事は香典返しに言及
  const above = E.checkAmount(30000, 'funeral', 'friend').find((r) => r.code === 'above');
  assert.ok(above);
  assert.match(above.message, /香典返し/);
  // 上限の1.5倍以内なら何も言わない
  assert.deepEqual(codes(E.checkAmount(10000, 'funeral', 'friend')), ['ok']);
  // 関係が無ければ相場比較をしない
  assert.deepEqual(codes(E.checkAmount(10000, 'wedding')), ['ok']);
});

test('worstLevel', () => {
  assert.equal(E.worstLevel([{ level: 'ok' }]), 'ok');
  assert.equal(E.worstLevel([{ level: 'info' }, { level: 'warn' }]), 'warn');
});

/* ============================================================
   お札
   ============================================================ */

test('お札の組み合わせ', () => {
  assert.deepEqual(E.bills(30000, 'wedding'), [{ value: 10000, count: 3 }]);
  assert.deepEqual(E.bills(20000, 'wedding'), [{ value: 10000, count: 1 }, { value: 5000, count: 2 }]);
  assert.deepEqual(E.bills(20000, 'funeral'), [{ value: 10000, count: 2 }]);
  assert.deepEqual(E.bills(15000, 'birth'), [{ value: 10000, count: 1 }, { value: 5000, count: 1 }]);
  assert.deepEqual(E.bills(8000, 'birth'), [{ value: 5000, count: 1 }, { value: 1000, count: 3 }]);
  assert.equal(E.bills(12345, 'birth'), null);
  assert.equal(E.bills(500, 'birth'), null);
  assert.equal(E.bills('abc', 'birth'), null);
});

/* ============================================================
   大字・漢数字
   ============================================================ */

test('大字', () => {
  const cases = [
    [1, '壱'], [1000, '壱阡'], [3000, '参阡'], [5000, '伍阡'],
    [10000, '壱萬'], [15000, '壱萬伍阡'], [20000, '弐萬'], [30000, '参萬'], [50000, '伍萬'],
    [100000, '壱拾萬'], [110000, '壱拾壱萬'], [1000000, '壱百萬'], [10000000, '壱阡萬'],
    [99999999, '九阡九百九拾九萬九阡九百九拾九'], [12345, '壱萬弐阡参百四拾伍'], [10001, '壱萬壱']
  ];
  for (const [n, s] of cases) assert.equal(E.toDaiji(n), s, String(n));
  assert.equal(E.toDaiji(0), null);
  assert.equal(E.toDaiji(100000000), null);
  assert.equal(E.toDaiji('abc'), null);
});

test('漢数字', () => {
  const cases = [
    [1000, '千'], [3000, '三千'], [10000, '一万'], [15000, '一万五千'], [100000, '十万'],
    [110000, '十一万'], [1000000, '百万'], [12345, '一万二千三百四十五'], [10, '十'], [7, '七']
  ];
  for (const [n, s] of cases) assert.equal(E.toKansuji(n), s, String(n));
});

test('中袋の文言', () => {
  assert.deepEqual(E.envelopeText(30000), {
    formal: '金参萬圓',
    formalNari: '金参萬圓也',
    modern: '金参萬円',
    kansuji: '金三万円'
  });
  assert.equal(E.envelopeText('abc'), null);
});

/* ============================================================
   住所
   ============================================================ */

test('住所の数字を漢数字に、ハイフンを長音符に', () => {
  assert.equal(E.addressToVertical('千代田区1-2-3'), '千代田区一ー二ー三');
  assert.equal(E.addressToVertical('千代田区１－２－３０'), '千代田区一ー二ー三〇');
  assert.equal(E.addressToVertical('100-0001'), '一〇〇ー〇〇〇一');
  assert.equal(E.addressToVertical(''), '');
  assert.equal(E.addressToVertical(null), '');
  // HTML として意味のある文字はそのまま返す（DOM 側で textContent に入れる）
  assert.equal(E.addressToVertical('<img src=x>'), '<img src=x>');
});

/* ============================================================
   連名
   ============================================================ */

test('連名: 合計が無難ならそのまま', () => {
  const r = E.groupGift(5000, 2, 'birth');
  assert.equal(r.total, 10000);
  assert.deepEqual(codes(r.checks), ['ok']);
  assert.deepEqual(r.suggestions, []);
});

test('連名: 合計が忌み数なら、上下の無難な合計を提案する', () => {
  const r = E.groupGift(3000, 3, 'birth');
  assert.equal(r.total, 9000);
  assert.ok(codes(r.checks).includes('imikazu'));
  const totals = r.suggestions.map((s) => s.total);
  assert.equal(totals.length, 2);
  assert.ok(totals[0] < 9000 && totals[1] > 9000);
  for (const s of r.suggestions) {
    assert.notEqual(E.worstLevel(E.checkAmount(s.total, 'birth')), 'warn', String(s.total));
    assert.ok(s.perPerson * 3 >= s.total);
  }
  assert.deepEqual(totals, [8000, 10000]);
});

test('連名: 4名以上は「一同」の書き方を案内', () => {
  assert.match(E.groupGift(1000, 3, 'birth').nameNote, /3名まで/);
  assert.match(E.groupGift(1000, 5, 'birth').nameNote, /一同/);
});

test('連名: 不正な入力は error', () => {
  assert.ok(E.groupGift(3000, 0, 'birth').error);
  assert.ok(E.groupGift(3000, 51, 'birth').error);
  assert.ok(E.groupGift(3000, 'abc', 'birth').error);
  assert.ok(E.groupGift(0, 3, 'birth').error);
  assert.ok(E.groupGift(99999999, 2, 'birth').error);
});

test('formatYenShort / formatYen', () => {
  assert.equal(E.formatYenShort(30000), '3万円');
  assert.equal(E.formatYenShort(5000), '5千円');
  assert.equal(E.formatYenShort(15000), '1万5千円');
  assert.equal(E.formatYenShort(100000), '10万円');
  assert.equal(E.formatYen(1234567), '1,234,567円');
});
