/* ============================================================
   のしるべ — エンジンの単体テスト
   実行: npm test（node --test tests/）
   assert のメッセージには、何が起きたかと「直し方」を書く。
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/engine.js');

function guide(sceneId, opts) {
  return N.getGuide(sceneId, Object.assign({ age: '30', religion: 'unknown' }, opts || {}));
}

function codes(sceneId, yen, opts) {
  return N.checkAmount(sceneId, yen, guide(sceneId, opts)).map((c) => c.code);
}

/* ============================================================
   相場表の網羅
   ============================================================ */

test('関係で決まる場面は、全関係×全年代で min <= max の目安を返す', () => {
  for (const scene of N.SCENES.filter((s) => s.amountMode === 'relation')) {
    const relations = N.relationsFor(scene.id);
    assert.ok(relations.length > 0, `${scene.id} に選べる関係がない。直し方: engine.js の SCENES.${scene.id}.amounts に関係を1つ以上書く`);
    for (const r of relations) {
      for (const a of N.AGES) {
        const g = guide(scene.id, { relation: r.id, age: a.id });
        assert.ok(g.amount, `${scene.id}/${r.id}/${a.id} の目安が null。直し方: 年代別に書く場合は 20・30・40 の3つすべてを書く`);
        assert.ok(g.amount.min > 0 && g.amount.min <= g.amount.max,
          `${scene.id}/${r.id}/${a.id} の目安が [${g.amount.min}, ${g.amount.max}]。直し方: [最小, 最大] の順で正の金額を書く`);
      }
    }
  }
});

test('相場表に忌み数（先頭が4・9）の金額を入れていない', () => {
  for (const scene of N.SCENES.filter((s) => s.amountMode === 'relation')) {
    for (const r of N.relationsFor(scene.id)) {
      for (const a of N.AGES) {
        const { min, max } = guide(scene.id, { relation: r.id, age: a.id }).amount;
        for (const yen of [min, max]) {
          assert.ok(!['4', '9'].includes(String(yen)[0]),
            `${scene.id}/${r.id} の目安に ${yen} 円がある。直し方: 目安自体が点検で警告される金額にならないよう相場表を直す`);
        }
      }
    }
  }
  for (const c of N.CHILD_AGES) {
    for (const yen of c.range) {
      assert.ok(!['4', '9'].includes(String(yen)[0]), `お年玉 ${c.id} の目安に ${yen} 円がある。直し方: CHILD_AGES を直す`);
    }
  }
});

test('結婚祝いの相場表に割り切れる金額（2万を除く偶数万円）を入れていない', () => {
  for (const id of ['wedding', 'weddingAbsent']) {
    for (const r of N.relationsFor(id)) {
      for (const a of N.AGES) {
        const { min, max } = guide(id, { relation: r.id, age: a.id }).amount;
        for (const yen of [min, max]) {
          assert.ok(!codes(id, yen, { relation: r.id, age: a.id }).includes('even-wedding'),
            `${id}/${r.id} の目安 ${yen} 円が偶数の警告に当たる。直し方: 相場表を奇数万円・8万・10万にする`);
        }
      }
    }
  }
});

test('定義に無い関係では推測値を出さず null を返す', () => {
  assert.equal(guide('school', { relation: 'boss' }).amount, null,
    '入学祝いに上司の目安が出た。直し方: amountGuide は amounts に無い関係で null を返す');
  assert.deepEqual(N.relationsFor('kaiki'), [], 'お返し系の場面に関係が出た。直し方: relationsFor は amountMode が relation 以外で [] を返す');
  assert.equal(N.getGuide('unknown-scene', {}), null, '存在しない場面で null 以外を返した。直し方: getGuide の先頭で SCENE_MAP を確認する');
});

test('年代で目安が変わる（香典・兄弟の結婚式）', () => {
  assert.deepEqual([guide('funeral', { relation: 'parent', age: '20' }).amount.min, guide('funeral', { relation: 'parent', age: '40' }).amount.min],
    [30000, 100000], '親の香典の年代差が想定と違う。直し方: SCENES.funeral.amounts.parent を確認する');
  assert.match(guide('wedding', { relation: 'sibling', age: '30' }).amount.basis, /30代/,
    '年代別の目安で根拠に年代が出ていない。直し方: amountGuide の basis に年代ラベルを足す');
});

test('お返し系はいただいた金額の1/3〜1/2を百円単位で返す', () => {
  const g = guide('kaiki', { receivedYen: 10000 });
  assert.deepEqual([g.amount.min, g.amount.max], [3300, 5000], `快気祝いの目安が ${g.amount.min}〜${g.amount.max}。直し方: returnRatio と roundTo(…, 100) を確認する`);
  assert.equal(guide('uchiiwai', {}).amount, null, 'いただいた金額なしで目安が出た。直し方: receivedYen が正の数でなければ null を返す');
  assert.equal(guide('uchiiwai', { receivedYen: -1 }).amount, null, '負の金額で目安が出た。直し方: receivedYen > 0 を確認する');
});

test('お年玉は子の年齢で目安が決まる', () => {
  const g = guide('otoshidama', { childAge: 'upperElem' });
  assert.deepEqual([g.amount.min, g.amount.max], [3000, 5000], '小学校高学年のお年玉の目安が違う。直し方: CHILD_AGES.upperElem を確認する');
});

/* ============================================================
   マナー（表書き・水引・墨・お札）
   ============================================================ */

test('香典は宗教で表書きが変わり、浄土真宗は「御仏前」', () => {
  assert.equal(guide('funeral', { religion: 'unknown' }).omote[0], '御霊前', '宗教不明の香典が御霊前でない。直し方: religionOverride の default を確認する');
  assert.equal(guide('funeral', { religion: 'jodoshin' }).omote[0], '御仏前', '浄土真宗の香典が御仏前でない。直し方: religionOverride の jodoshin を確認する');
  assert.equal(guide('funeral', { religion: 'shinto' }).omote[0], '御玉串料', '神式の香典が御玉串料でない。直し方: religionOverride の shinto を確認する');
  const christian = guide('funeral', { religion: 'christian' });
  assert.equal(christian.omote[0], '御花料', 'キリスト教の香典が御花料でない。直し方: religionOverride の christian を確認する');
  assert.equal(christian.mizuhiki.key, 'none', 'キリスト教の香典に水引が付いた。直し方: christian の mizuhiki を none にする');
  assert.ok(!guide('memorial', { religion: 'buddhist' }).omote.includes('御霊前'), '四十九日以降の法要に御霊前が出た。直し方: memorial の表書きを御仏前にする');
});

test('慶事と弔事で墨・お札・折り返しが逆になる', () => {
  const kei = guide('wedding', { relation: 'friend' });
  const cho = guide('funeral', { relation: 'friend' });
  assert.match(kei.ink, /濃い墨/, '結婚祝いが濃い墨でない。直し方: KEI.ink を確認する');
  assert.match(cho.ink, /薄墨/, '香典が薄墨でない。直し方: CHO.ink を確認する');
  assert.match(kei.newBill, /^新札/, '結婚祝いが新札でない。直し方: KEI.newBill を確認する');
  assert.match(cho.newBill, /避ける/, '香典で新札を避ける案内がない。直し方: CHO.newBill を確認する');
  assert.match(kei.fold, /下側を上/, '慶事の折り返しが違う。直し方: KEI.fold を確認する');
  assert.match(cho.fold, /上側を下/, '弔事の折り返しが違う。直し方: CHO.fold を確認する');
  assert.match(guide('memorial', { relation: 'friend' }).ink, /濃い墨でよい/, '法要の墨が上書きされていない。直し方: SCENES.memorial.ink を確認する');
});

test('水引は場面の意味に合わせる（結婚は結び切り、出産は蝶結び）', () => {
  assert.equal(guide('wedding', { relation: 'friend' }).mizuhiki.key, 'musubikiri', '結婚祝いが結び切りでない。直し方: SCENES.wedding.mizuhiki を確認する');
  assert.equal(guide('birth', { relation: 'friend' }).mizuhiki.key, 'chou', '出産祝いが蝶結びでない。直し方: SCENES.birth.mizuhiki を確認する');
  assert.equal(guide('kaiki', {}).mizuhiki.key, 'musubikiri', '快気祝いが結び切りでない（病気を繰り返さない意味）。直し方: SCENES.kaiki.mizuhiki を確認する');
  assert.equal(guide('funeral', { relation: 'friend' }).noshi, false, '香典にのしが付いた。直し方: SCENES.funeral.noshi を false にする');
});

test('どの場面も包み方の項目がすべて埋まっている', () => {
  const keys = ['ink', 'newBill', 'billFace', 'fukusa', 'fold', 'nameNote'];
  for (const s of N.SCENES) {
    const g = guide(s.id, { relation: N.relationsFor(s.id)[0] && N.relationsFor(s.id)[0].id });
    assert.ok(g.omote.length > 0, `${s.id} に表書きがない。直し方: SCENES.${s.id}.omote を書く`);
    assert.ok(g.notes.length > 0, `${s.id} に注意がない。直し方: SCENES.${s.id}.notes を書く`);
    for (const k of keys) assert.ok(typeof g[k] === 'string' && g[k].length > 0, `${s.id} の ${k} が空。直し方: 場面か KEI/CHO に ${k} を書く`);
    assert.ok(g.mizuhiki.label && g.mizuhiki.color, `${s.id} の水引の表示が空。直し方: mizuhiki と mizuhikiColor を書く`);
  }
});

/* ============================================================
   金額の解釈
   ============================================================ */

test('parseYen は全角・単位・カンマの表記ゆれを解釈する', () => {
  const cases = [
    ['30000', 30000], ['3万', 30000], ['３万円', 30000], ['30,000円', 30000], ['３０，０００', 30000],
    ['1万5千', 15000], ['3.5万', 35000], ['1万2000', 12000], ['5千', 5000], ['金5000円也', 5000], [' 10000 ', 10000]
  ];
  for (const [text, yen] of cases) {
    const r = N.parseYen(text);
    assert.deepEqual(r, { ok: true, yen }, `「${text}」の解釈結果が ${JSON.stringify(r)}。直し方: parseYen の正規化（toHalfWidth / 単位の正規表現）を確認する`);
  }
});

test('parseYen は解釈できない入力を理由つきで拒否する', () => {
  const bad = ['', 'abc', '0', '-1000', '1.5', '3万円ぐらい', '1億', '100000000', '1'.repeat(31), '<script>'];
  for (const text of bad) {
    const r = N.parseYen(text);
    assert.equal(r.ok, false, `「${text}」を金額として受け入れた。直し方: parseYen の正規表現・上限・長さの検査を確認する`);
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0, `「${text}」の拒否理由が空。直し方: reason を返す`);
  }
  assert.equal(N.parseYen(null).ok, false, '文字列以外を受け入れた。直し方: typeof text を確認する');
  assert.match(N.parseYen('1億').reason, /1億円未満/, '「1億」の拒否理由が上限を伝えていない。直し方: parseYen で「億」を先に検査する');
});

/* ============================================================
   大字変換
   ============================================================ */

test('toDaiji は中袋の大字表記を返す', () => {
  const cases = [
    [1, '金 壱円'], [500, '金 伍百円'], [3000, '金 参阡円'], [5000, '金 伍阡円'], [10000, '金 壱萬円'],
    [15000, '金 壱萬伍阡円'], [20000, '金 弐萬円'], [30000, '金 参萬円'], [50000, '金 伍萬円'],
    [100000, '金 壱拾萬円'], [10500, '金 壱萬伍百円'], [1000000, '金 壱百萬円'], [99999999, '金 九阡九百九拾九萬九阡九百九拾九円']
  ];
  for (const [yen, expected] of cases) {
    assert.equal(N.toDaiji(yen), expected, `${yen} の大字が「${N.toDaiji(yen)}」。直し方: DAIJI_DIGITS / DAIJI_UNITS と fourDigits を確認する`);
  }
  for (const bad of [0, -1, 1.5, 100000000, NaN, '3000']) {
    assert.equal(N.toDaiji(bad), '', `不正な値 ${String(bad)} に大字を返した。直し方: toDaiji の先頭の検査を確認する`);
  }
});

/* ============================================================
   お札の組み合わせ
   ============================================================ */

function sum(plan) {
  return plan.reduce((t, p) => t + p.bill * p.count, 0);
}

function count(plan) {
  return plan.filter((p) => p.bill > 1).reduce((t, p) => t + p.count, 0);
}

test('billPlan の合計は常に金額と一致する', () => {
  for (const id of ['wedding', 'funeral', 'otoshidama']) {
    for (const yen of [1000, 3000, 5000, 10000, 15000, 20000, 30000, 50000, 80000, 100000, 12500]) {
      const plan = N.billPlan(yen, id);
      assert.equal(sum(plan), yen, `${id} ${yen} 円の組み合わせの合計が ${sum(plan)}。直し方: billPlan の繰り下げ処理を確認する`);
    }
  }
});

test('結婚祝いではお札の枚数を奇数にする（2万円は1万円札1枚＋5千円札2枚）', () => {
  assert.deepEqual(N.billPlan(20000, 'wedding'), [{ bill: 10000, count: 1 }, { bill: 5000, count: 2 }],
    '2万円の組み合わせが違う。直し方: billPlan の wedding 分岐を確認する');
  for (const yen of [20000, 30000, 50000, 60000, 70000, 80000]) {
    assert.equal(count(N.billPlan(yen, 'wedding')) % 2, 1, `結婚祝い ${yen} 円の枚数が偶数。直し方: billPlan の wedding 分岐を確認する`);
  }
  assert.deepEqual(N.billPlan(20000, 'funeral'), [{ bill: 10000, count: 2 }], '香典でくずす処理が入った。直し方: wedding の場面だけでくずす');
  assert.deepEqual(N.billPlan(0, 'wedding'), [], '0円で組み合わせを返した。直し方: billPlan の先頭で yen > 0 を確認する');
});

/* ============================================================
   金額の点検
   ============================================================ */

test('忌み数（4・9）を警告する', () => {
  for (const yen of [4000, 9000, 40000, 90000]) {
    assert.ok(codes('funeral', yen, { relation: 'friend' }).includes('taboo-digit'), `${yen} 円で忌み数の警告がない。直し方: checkAmount の leadingDigit を確認する`);
  }
  for (const yen of [3000, 5000, 10000, 14000]) {
    assert.ok(!codes('funeral', yen, { relation: 'friend' }).includes('taboo-digit'), `${yen} 円で忌み数の警告が出た。直し方: 先頭の数字だけを見る`);
  }
});

test('結婚祝いの偶数額を点検する（2万は参考、4万・6万は注意、8万・10万は対象外）', () => {
  const opts = { relation: 'friend' };
  assert.ok(codes('wedding', 20000, opts).includes('two-wedding'), '2万円で参考表示がない。直し方: checkAmount の man === 2 分岐を確認する');
  assert.ok(codes('wedding', 60000, opts).includes('even-wedding'), '6万円で注意がない。直し方: checkAmount の偶数判定を確認する');
  assert.ok(codes('wedding', 40000, opts).includes('even-wedding'), '4万円で偶数の注意がない。直し方: checkAmount の偶数判定を確認する');
  for (const yen of [30000, 50000, 80000, 100000]) {
    const c = codes('wedding', yen, { relation: 'sibling', age: '30' });
    assert.ok(!c.includes('even-wedding') && !c.includes('two-wedding'), `${yen} 円に偶数の指摘が出た。直し方: 8万・10の倍数の除外を確認する`);
  }
  assert.ok(!codes('birth', 20000, { relation: 'sibling' }).includes('two-wedding'), '出産祝いに結婚祝い用の指摘が出た。直し方: scene.wedding で分岐する');
});

test('相場との大きな差と端数を参考表示する', () => {
  assert.ok(codes('wedding', 100000, { relation: 'friend' }).includes('over'), '友人の結婚祝い10万円で多すぎる参考がない。直し方: max * 2 との比較を確認する');
  assert.ok(codes('wedding', 10000, { relation: 'friend' }).includes('under'), '友人の結婚祝い1万円で少なすぎる参考がない。直し方: min / 2 との比較を確認する');
  assert.ok(codes('funeral', 5500, { relation: 'friend' }).includes('unit'), '5,500円で千円単位の参考がない。直し方: unit の判定を確認する');
  assert.ok(!codes('otoshidama', 1500, { childAge: 'lowerElem' }).includes('unit'), 'お年玉の500円単位を端数扱いした。直し方: child の場面は 500 円単位にする');
});

test('香典の偶数額の参考表示はお札を奇数枚にする方法も案内する', () => {
  const r = N.checkAmount('funeral', 20000, guide('funeral', { relation: 'relative' }));
  const even = r.find((c) => c.code === 'even-funeral');
  assert.ok(even && even.message.includes('奇数枚'), `2万円の香典の参考表示が ${JSON.stringify(r)}。直し方: even-funeral の文面に枚数の工夫を書く`);
});

test('問題のない金額は ok を1件だけ返す', () => {
  const r = N.checkAmount('wedding', 30000, guide('wedding', { relation: 'friend' }));
  assert.deepEqual(r.map((c) => c.level), ['ok'], `3万円の結婚祝いで ${JSON.stringify(r)}。直し方: 指摘が無いときだけ ok を足す`);
  assert.equal(N.checkAmount('wedding', 0, null)[0].code, 'invalid', '0円で invalid にならない。直し方: checkAmount の先頭の検査を確認する');
  assert.deepEqual(N.checkAmount('nope', 30000, null), [], '存在しない場面で指摘を返した。直し方: SCENE_MAP を確認する');
});

/* ============================================================
   書式
   ============================================================ */

test('formatYen / formatRange は日本語の短い表記にする', () => {
  const cases = [[30000, '3万円'], [15000, '1万5千円'], [5000, '5千円'], [3300, '3,300円'], [500, '500円'], [12500, '12,500円']];
  for (const [yen, text] of cases) assert.equal(N.formatYen(yen), text, `${yen} の表記が「${N.formatYen(yen)}」。直し方: formatYen を確認する`);
  assert.equal(N.formatRange(5000, 10000), '5千〜1万円', '範囲の表記が違う。直し方: formatRange を確認する');
  assert.equal(N.formatRange(30000, 30000), '3万円', '同じ値の範囲が「〜」付きになった。直し方: min === max の分岐を確認する');
});

/* ============================================================
   画面のセキュリティ方針（静的検査）
   ============================================================ */

test('画面のコードは innerHTML・通信・保存を使わない', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  for (const file of ['src/app.js', 'src/engine.js']) {
    const code = fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'document.cookie', 'WebSocket', 'sendBeacon']) {
      assert.ok(!code.includes(banned), `${file} に ${banned} がある。直し方: DOM は textContent / createElement で作り、通信・保存のコードを書かない`);
    }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /connect-src 'none'/, 'CSP に connect-src \'none\' がない。直し方: index.html の CSP meta を確認する');
  assert.match(html, /script-src 'self'/, 'CSP の script-src が self に限定されていない。直し方: index.html の CSP meta を確認する');
  assert.ok(!/<script>(?!<\/script>)/.test(html) && !/\son[a-z]+=/.test(html), 'index.html にインラインスクリプトかイベント属性がある。直し方: 処理は src/app.js に移す');
});
