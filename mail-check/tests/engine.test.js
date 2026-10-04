/* ============================================================
   おくるまえに — 点検エンジンの単体テスト
   実行: npm test（node --test tests/）
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const OPTS = { subject: '10/2打ち合わせ資料のご確認のお願い', audience: 'external' };

function check(text, extra) {
  return E.check(text, Object.assign({}, OPTS, extra || {}));
}

function find(result, ruleId) {
  return result.findings.filter((f) => f.ruleId === ruleId);
}

function hasRule(result, ruleId) {
  return find(result, ruleId).length > 0;
}

/* ============================================================
   スパンルールの網羅
   [ruleId, 入力, 修正適用後の期待値（null は修正候補を持たない）]
   ============================================================ */

const SPAN_FIXTURES = [
  ['security.password', '社内システムのパスワードはAbcd1234です。', null],
  ['security.apikey', '接続情報は api_key: sk_live_9fj2k3l4m5n6 です。', null],
  ['security.card', 'カード番号は4242 4242 4242 4242です。', null],
  ['security.mynumber', 'マイナンバーは123456789012でお願いします。', null],
  ['security.account', '口座番号は1234567です。', null],

  ['keigo.ryokai', '了解しました。', '承知しました。'],
  ['keigo.gokurou', 'ご苦労様です。', 'お疲れ様です。'],
  ['keigo.tondemo', 'とんでもございません。', 'とんでもないことでございます。'],
  ['keigo.yoroshikatta', '日程は金曜でよろしかったでしょうか。', '日程は金曜でよろしいでしょうか。'],
  ['keigo.osewasama', 'お世話様です。', 'お世話になっております。'],
  ['keigo.kakuiSama', '関係者各位様', '関係者各位'],
  ['keigo.onchuSama', '株式会社あおぞら商事御中様', '株式会社あおぞら商事御中'],
  ['keigo.uchiSama', '弊社の田中様が対応いたします。', '弊社の田中が対応いたします。'],
  ['keigo.goSuruKudasai', 'ご確認してください。', 'ご確認ください。'],
  ['keigo.sumimasen', 'すみません、日程を変更したいです。', '申し訳ございません、日程を変更したいです。'],

  ['humble.aiteMoushi', 'お客様が申しておりました。', 'お客様がおっしゃっていました。'],
  ['humble.aiteMousare', '部長が申されました。', '部長がおっしゃいました。'],
  ['humble.jibunSonkei', '私がご覧になります。', null],
  ['humble.haikenItadaku', '資料を拝見していただけますか。', '資料をご覧いただけますか。'],

  ['double.oukagai', '明後日お伺いします。', '明後日伺います。'],
  ['double.haikenSasete', '資料を拝見させていただきました。', '資料を拝見しました。'],
  ['double.ninarare', '規約をお読みになられましたか。', '規約をお読みになりましたか。'],
  ['double.ossharare', '先ほどおっしゃられました点について。', '先ほどおっしゃいました点について。'],
  ['redundant.goSasete', '後ほどご連絡させていただきます。', '後ほどご連絡いたします。'],
  ['double.itadakemasudeshouka', 'ご確認いただけますでしょうか。', 'ご確認いただけますか。'],

  ['vague.naruhaya', 'なるはやでご回答をお願いします。', null],
  ['vague.konshuchu', '今週中にご回答をお願いします。', null],
  ['vague.tekigi', '進捗は適宜ご共有します。', null],
  ['vague.ashita', '明日お送りします。', null],
  ['vague.daijoubu', 'その日程で大丈夫です。', 'その日程で問題ございません。'],

  ['tone.shikyu', '至急ご回答をお願いします。', null],
  ['tone.soukyu', '早急にご回答をお願いします。', null],
  ['tone.naze', 'なぜご返信いただけないのでしょうか。', null],
  ['tone.zenkai', '前回もお伝えしましたが、期限は明後日です。', null],
  ['tone.hazu', '先週お送りしており、届いているはずですが。', null],
  ['tone.dounatte', 'その後どうなっていますか。', 'その後進捗をお伺いできますか。'],

  ['redundant.mazuSaisho', 'まず最初にご報告します。', 'まずご報告します。'],
  ['redundant.kanarazuHitsuyou', '押印が必ず必要です。', '押印が必要です。'],
  ['redundant.ichibanSaiteki', '一番最適な案を選びます。', '最適な案を選びます。'],
  ['redundant.yakuTeido', '所要は約30分程度です。', '所要は約30分です。'],
  ['redundant.dekimasu', '当日に変更することができます。', '当日に変更できます。'],
  ['redundant.katachide', '来週という形で進めます。', '来週進めます。'],
  ['redundant.ninarimasu', '内訳は以上になります。', '内訳は以上です。'],
  ['redundant.nohou', 'こちらの方で再計算しました。', 'こちらで再計算しました。'],
  ['redundant.atodeKoukai', '後で後悔しないよう確認します。', '後悔しないよう確認します。'],

  ['notation.itashimasu', 'よろしくお願い致します。', 'よろしくお願いいたします。'],
  ['notation.kudasai', 'ご対応下さい。', 'ご対応ください。'],
  ['notation.itadaki', '資料を送って頂きました。', '資料を送っていただきました。'],
  ['notation.yoroshiku', '宜しくお願いいたします。', 'よろしくお願いいたします。'],
  ['notation.arigatou', '有難うございます。', 'ありがとうございます。']
];

test('すべてのスパンルールにテストがある（ルール追加時の取りこぼし防止）', () => {
  const covered = new Set(SPAN_FIXTURES.map(([ruleId]) => ruleId));
  const missing = E.SPAN_RULES.map((r) => r.id).filter((id) => !covered.has(id));
  assert.deepEqual(missing, [], 'テストのない SPAN_RULES: ' + missing.join(', '));
});

test('スパンルールが検出され、修正候補が期待どおりに適用される', () => {
  for (const [ruleId, input, expected] of SPAN_FIXTURES) {
    const result = check(input);
    const found = find(result, ruleId);
    assert.equal(found.length > 0, true, ruleId + ' が検出されない: ' + input);

    const f = found[0];
    assert.equal(input.slice(f.start, f.end), f.matched, ruleId + ' の位置がずれている');

    if (expected === null) {
      assert.equal(f.suggestion, null, ruleId + ' は修正候補を持たない想定');
    } else {
      assert.equal(E.applyFix(input, f), expected, ruleId + ' の修正結果が違う');
    }
  }
});

test('修正候補を適用すると、同じ指摘は再発しない（提案が自己矛盾しない）', () => {
  for (const [ruleId, , expected] of SPAN_FIXTURES) {
    if (expected === null) continue;
    const after = check(expected);
    assert.equal(hasRule(after, ruleId), false, ruleId + ' の修正候補が同じ指摘を再発させる');

    const introduced = after.findings.filter(
      (f) => f.start !== null && (f.severity === '高' || f.severity === '中')
    );
    assert.deepEqual(
      introduced.map((f) => f.ruleId), [],
      ruleId + ' の修正候補が別の重い指摘を生む: ' + JSON.stringify(expected)
    );
  }
});

/* ============================================================
   誤検出の防止
   ============================================================ */

const CLEAN_SUBJECT = '10/2打ち合わせ資料のご確認のお願い';
const CLEAN_MAIL = [
  '株式会社あおぞら商事',
  '営業部 田中様',
  '',
  'いつもお世話になっております。',
  'みどり工業の山田です。',
  '',
  '10月2日（木）の打ち合わせについて、資料をお送りします。',
  'お手数ですが、10月1日（水）17時までにご確認いただき、',
  '修正点があればご返信いただけますか。',
  '',
  '資料は3ページです。ご不明な点はお知らせください。',
  '',
  'よろしくお願いいたします。',
  '',
  '--',
  'みどり工業株式会社 山田太郎',
  'yamada@example.com'
].join('\n');

test('丁寧に書けているメールでは重要度「高」「中」が出ない', () => {
  const result = E.check(CLEAN_MAIL, { subject: CLEAN_SUBJECT, audience: 'external' });
  const heavy = result.findings.filter((f) => f.severity === '高' || f.severity === '中');
  assert.deepEqual(
    heavy.map((f) => f.ruleId + ':' + f.matched), [],
    '模範メールで誤検出が出ている'
  );
});

test('「パスワードは別便でお送りします」を資格情報として検出しない', () => {
  const result = check('パスワードは別便でお送りします。');
  assert.equal(hasRule(result, 'security.password'), false);
});

test('Luhn 検査を通らない数字列はカード番号として検出しない', () => {
  assert.equal(E.isLuhnCard('4242424242424242'), true);
  assert.equal(E.isLuhnCard('4242 4242 4242 4242'), true);
  assert.equal(E.isLuhnCard('4242424242424241'), false);
  assert.equal(E.isLuhnCard('123456789012'), false, '12桁はカードの桁数ではない');

  const result = check('伝票番号は12345678901234です。');
  assert.equal(hasRule(result, 'security.card'), false);
});

test('電話番号はカード番号として検出しない', () => {
  const result = check('連絡先は03-1234-5678です。');
  assert.equal(hasRule(result, 'security.card'), false);
});

test('引用行（> 始まり）は点検の対象外', () => {
  const quoted = ['田中様', '', 'ご確認ください。', '', '> 了解しました。至急ご対応下さい。'].join('\n');
  const result = check(quoted);
  assert.equal(hasRule(result, 'keigo.ryokai'), false);
  assert.equal(hasRule(result, 'tone.shikyu'), false);
  assert.equal(hasRule(result, 'notation.kudasai'), false);
});

/* ============================================================
   送信相手による出し分け
   ============================================================ */

test('「了解しました」は社外・上司で指摘し、同僚では指摘しない', () => {
  assert.equal(hasRule(check('了解しました。', { audience: 'external' }), 'keigo.ryokai'), true);
  assert.equal(hasRule(check('了解しました。', { audience: 'boss' }), 'keigo.ryokai'), true);
  assert.equal(hasRule(check('了解しました。', { audience: 'colleague' }), 'keigo.ryokai'), false);
});

test('身内への敬称は社外宛のときだけ指摘する', () => {
  assert.equal(hasRule(check('弊社の田中様が対応します。', { audience: 'external' }), 'keigo.uchiSama'), true);
  assert.equal(hasRule(check('弊社の田中様が対応します。', { audience: 'colleague' }), 'keigo.uchiSama'), false);
});

test('未知の送信相手は社外として扱う', () => {
  const result = E.check('了解しました。', { subject: '件名', audience: 'unknown-audience' });
  assert.equal(result.stats.audience, 'external');
  assert.equal(hasRule(result, 'keigo.ryokai'), true);
});

/* ============================================================
   文書チェック
   ============================================================ */

test('件名が空だと指摘する（本文が30文字以上のとき）', () => {
  const long = 'いつもお世話になっております。資料をお送りしますのでご確認をお願いいたします。';
  assert.equal(hasRule(E.check(long, { subject: '' }), 'structure.subjectEmpty'), true);
  assert.equal(hasRule(E.check(long, { subject: '資料送付のご連絡' }), 'structure.subjectEmpty'), false);
});

test('件名が長い・用件がわからない・強い符号つきをそれぞれ指摘する', () => {
  assert.equal(hasRule(E.check('本文です。', { subject: 'あ'.repeat(41) }), 'structure.subjectLong'), true);
  assert.equal(hasRule(E.check('本文です。', { subject: 'ご連絡' }), 'structure.subjectVague'), true);
  assert.equal(hasRule(E.check('本文です。', { subject: '【至急】請求書の件' }), 'structure.subjectTag'), true);
});

test('宛名・挨拶・結び・署名の欠落を指摘する', () => {
  const noHead = [
    '打ち合わせの資料を送ります。内容を確認して返信をもらえると助かります。',
    '日程は10月2日（木）の15時からです。会議室は追って連絡します。',
    '費用の見積もりは別途まとめているところで、来週には共有できる見込みです。',
    '不明点があれば、この本文に返信する形で質問をもらえれば回答します。'
  ].join('\n');
  const result = E.check(noHead, { subject: '資料送付', audience: 'external' });
  assert.equal(hasRule(result, 'structure.noSalutation'), true);
  assert.equal(hasRule(result, 'structure.noGreeting'), true);
  assert.equal(hasRule(result, 'structure.noClosing'), true);
  assert.equal(hasRule(result, 'structure.noSignature'), true);
});

test('添付に触れていれば付け忘れの確認を促す', () => {
  const result = check('添付の資料をご確認ください。');
  const found = find(result, 'structure.attachment');
  assert.equal(found.length, 1);
  assert.equal(found[0].matched, '添付');
});

test('長すぎる行を行番号つきで指摘する', () => {
  const result = check('田中様\n' + 'あ'.repeat(60));
  const found = find(result, 'structure.longLine');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /2行目が長いです（60文字）/);
  assert.equal(found[0].start, null, '行全体を範囲にすると同じ行の指摘を覆い隠す');
});

test('長い行があっても、その行の他の指摘は消えない（R1 の回帰テスト）', () => {
  const line = '宜しくお願い致します。'.repeat(6); // 66文字の1行
  const result = check(line);
  assert.equal(hasRule(result, 'structure.longLine'), true);
  assert.equal(find(result, 'notation.yoroshiku').length, 6, '長行の指摘に飲み込まれている');
  assert.equal(find(result, 'notation.itashimasu').length, 6);
});

test('引用行に書かれた「添付」は拾わない（R2 の回帰テスト）', () => {
  const quoted = ['田中様', '> 添付の資料をご確認ください。', 'よろしくお願いいたします。'].join('\n');
  assert.equal(hasRule(check(quoted), 'structure.attachment'), false);

  const own = ['田中様', '添付の資料をご確認ください。', 'よろしくお願いいたします。'].join('\n');
  const found = find(check(own), 'structure.attachment');
  assert.equal(found.length, 1);
  assert.equal(own.slice(found[0].start, found[0].end), '添付', '位置がずれている');
});

test('本文を編集して位置が動いても、無視した指摘は復活しない（R3 の回帰テスト）', () => {
  const before = '了解しました。';
  const target = find(check(before), 'keigo.ryokai')[0];

  const after = 'お世話になっております。' + before; // 位置が12文字ずれる
  assert.equal(hasRule(check(after, { ignored: [target.key] }), 'keigo.ryokai'), false);
});

test('重要度「低」だけでは0点にならない（R5 の回帰テスト）', () => {
  const result = check('宜しくお願い致します。'.repeat(12));
  assert.equal(result.stats.counts['高'], 0);
  assert.equal(result.stats.counts['低'] > 5, true);
  const floor = 100 - E.SEVERITY_CAP['低'] - E.SEVERITY_WEIGHT['中'] * result.stats.counts['中'];
  assert.equal(result.score >= floor, true,
    '「低」の減点が上限で打ち切られていない（点数: ' + result.score + '）');
  assert.equal(result.score > 0, true);
});

test('12桁でも、数字が隣接していればマイナンバーとして扱わない（R4 の回帰テスト）', () => {
  assert.equal(hasRule(check('マイナンバーは123456789012です。'), 'security.mynumber'), true);
  assert.equal(hasRule(check('伝票番号は1234567890123です。'), 'security.mynumber'), false);
  assert.equal(hasRule(check('内線は0120-123456789012です。'), 'security.mynumber'), false);
});

test('敬体と常体の混在を指摘する', () => {
  assert.equal(hasRule(check('明日は晴れです。準備は完了だ。'), 'consistency.mixedStyle'), true);
  assert.equal(hasRule(check('明日は晴れです。準備は完了しました。'), 'consistency.mixedStyle'), false);
});

test('「させていただく」の多用を回数つきで指摘する', () => {
  const text = 'ご案内させていただきます。確認は省きません。同席させていただきます。送付させていただきます。';
  const found = find(check(text), 'redundant.saseteItadakuOveruse');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /3回/);
});

test('依頼が続くのに前置きがない場合だけ指摘する', () => {
  const withoutCushion = 'ご確認ください。あわせてご返信ください。';
  const withCushion = 'お手数ですが、ご確認ください。あわせてご返信ください。';
  assert.equal(hasRule(check(withoutCushion), 'tone.noCushion'), true);
  assert.equal(hasRule(check(withCushion), 'tone.noCushion'), false);
});

/* ============================================================
   点数・無視・並び
   ============================================================ */

test('点数は重要度の重みで決まり、0を下回らない', () => {
  const empty = E.check('', { subject: '件名' });
  assert.equal(empty.score, 100);
  assert.equal(empty.findings.length, 0);

  const result = check('了解しました。');
  const deduction = E.SEVERITIES.reduce((sum, sev) => {
    const raw = E.SEVERITY_WEIGHT[sev] * result.stats.counts[sev];
    const cap = E.SEVERITY_CAP[sev];
    return sum + (typeof cap === 'number' ? Math.min(cap, raw) : raw);
  }, 0);
  assert.equal(result.score, Math.max(0, 100 - deduction));

  const terrible = E.check('パスワードはAbcd1234です。'.repeat(12), { subject: '' });
  assert.equal(terrible.score, 0);
});

test('無視した指摘は結果から消える', () => {
  const text = '了解しました。';
  const first = check(text);
  const target = find(first, 'keigo.ryokai')[0];
  const second = check(text, { ignored: [target.key] });
  assert.equal(hasRule(second, 'keigo.ryokai'), false);
  assert.equal(second.score > first.score, true);
});

test('指摘は重要度の高い順に並ぶ', () => {
  const result = check('宜しくお願いします。パスワードはAbcd1234です。了解しました。');
  const ranks = result.findings.map((f) => E.SEVERITIES.indexOf(f.severity));
  const sorted = ranks.slice().sort((a, b) => a - b);
  assert.deepEqual(ranks, sorted);
});

test('重なる指摘は重要度の高い方だけを残す', () => {
  const result = check('ご確認して下さい。');
  const overlapping = result.findings.filter((f) => f.start !== null);
  for (let i = 0; i < overlapping.length; i++) {
    for (let j = i + 1; j < overlapping.length; j++) {
      const a = overlapping[i];
      const b = overlapping[j];
      assert.equal(a.start < b.end && b.start < a.end, false, '指摘の範囲が重なっている');
    }
  }
  assert.equal(hasRule(result, 'keigo.goSuruKudasai'), true);
  assert.equal(hasRule(result, 'notation.kudasai'), false);
});

/* ============================================================
   一括適用
   ============================================================ */

test('一括適用で複数の指摘が位置ずれなく反映される', () => {
  const text = '宜しくお願い致します。了解しました。まず最初にご報告します。';
  const result = check(text);
  const fixed = E.applyFixes(text, result.findings);
  assert.equal(fixed, 'よろしくお願いいたします。承知しました。まずご報告します。');
});

test('一括適用を繰り返すと、修正候補のある指摘は残らない', () => {
  let text = [
    '株式会社あおぞら商事 各位様',
    'お世話になっております。',
    '資料を拝見させていただきました。有難うございます。',
    'こちらの方で再計算しましたので、ご確認して下さい。',
    'よろしくお願い致します。'
  ].join('\n');

  for (let i = 0; i < 5; i++) {
    const result = check(text);
    const fixable = result.findings.filter((f) => f.start !== null && typeof f.suggestion === 'string');
    if (fixable.length === 0) break;
    const next = E.applyFixes(text, result.findings);
    assert.notEqual(next, text, '一括適用が何も変えていない');
    text = next;
  }

  const finalResult = check(text);
  const remaining = finalResult.findings.filter((f) => f.start !== null && typeof f.suggestion === 'string');
  assert.deepEqual(remaining.map((f) => f.ruleId), [], '修正候補が収束していない');
});

test('修正候補のない指摘に applyFix を呼んでも本文は変わらない', () => {
  const text = '至急ご回答をお願いします。';
  const f = find(check(text), 'tone.shikyu')[0];
  assert.equal(E.applyFix(text, f), text);
  assert.equal(E.applyFix(text, null), text);
});

/* ============================================================
   描画支援（DOM を使わない部分）
   ============================================================ */

test('buildSegments は元の本文を復元でき、指摘箇所に印がつく', () => {
  const text = '了解しました。宜しくお願いします。';
  const result = check(text);
  const segments = E.buildSegments(text, result.findings);
  assert.equal(segments.map((s) => s.text).join(''), text);

  const marked = segments.filter((s) => s.findingId !== null);
  assert.equal(marked.length > 0, true);
  for (const seg of marked) {
    assert.equal(E.SEVERITIES.includes(seg.severity), true);
  }
});

test('buildSegments は重なりがあっても先着だけを採用する', () => {
  const text = 'ABCDEFG';
  const segments = E.buildSegments(text, [
    { id: 'f0', start: 1, end: 4, severity: '高' },
    { id: 'f1', start: 2, end: 5, severity: '中' }
  ]);
  assert.equal(segments.map((s) => s.text).join(''), text);
  assert.deepEqual(segments.filter((s) => s.findingId).map((s) => s.findingId), ['f0']);
});

test('escapeHtml は HTML として解釈されうる文字をすべて実体参照にする', () => {
  assert.equal(
    E.escapeHtml('<script>alert("x&y")</script>' + "'"),
    '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;&#39;'
  );
});

test('本文に HTML が含まれても、描画用の文字列はエスケープされる', () => {
  const text = '<img src=x onerror=alert(1)> 了解しました。';
  const result = check(text);
  const html = E.buildSegments(text, result.findings)
    .map((s) => E.escapeHtml(s.text))
    .join('');
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('&lt;img'), true);
});

/* ============================================================
   堅牢性・性能
   ============================================================ */

test('不正な入力でも例外を投げない', () => {
  for (const input of [undefined, null, 0, {}, []]) {
    const result = E.check(/** @type {any} */ (input));
    assert.equal(result.findings.length >= 0, true);
    assert.equal(typeof result.score, 'number');
  }
  assert.doesNotThrow(() => E.check('本文', { audience: null, ignored: null, subject: null }));
});

test('すべての指摘の start / end が本文と一致する', () => {
  const text = [
    '各位様',
    'お世話になっております。至急ご確認して下さい。',
    'パスワードはAbcd1234です。カード番号は4242424242424242です。',
    'こちらの方で約30分程度お待ち頂きます。宜しくお願い致します。'
  ].join('\n');
  const result = check(text);
  assert.equal(result.findings.length > 5, true);
  for (const f of result.findings) {
    if (f.start === null) {
      assert.equal(f.matched, '');
      continue;
    }
    assert.equal(text.slice(f.start, f.end), f.matched, f.ruleId);
    assert.equal(f.start < f.end, true);
  }
});

test('10,000文字の本文でも200ms未満で点検できる', () => {
  const paragraph = 'いつもお世話になっております。資料をお送りしますので、ご確認のうえご返信いただけますか。\n';
  let text = '';
  while (text.length < 10000) text += paragraph;
  const started = process.hrtime.bigint();
  const result = check(text);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(result.findings.length >= 0, true);
  assert.equal(elapsedMs < 200, true, '点検に ' + elapsedMs.toFixed(1) + 'ms かかった');
});

test('公開APIがそろっている', () => {
  for (const key of ['check', 'applyFix', 'applyFixes', 'buildSegments', 'escapeHtml',
    'SPAN_RULES', 'DOCUMENT_CHECKS', 'CATEGORIES', 'SEVERITIES', 'SEVERITY_META',
    'SEVERITY_WEIGHT', 'SEVERITY_CAP', 'AUDIENCES', 'findingKey', 'isLuhnCard']) {
    assert.equal(key in E, true, key + ' が公開されていない');
  }
  for (const rule of E.SPAN_RULES) {
    assert.equal(rule.pattern.flags.includes('g'), true, rule.id + ' に g フラグがない');
    assert.equal(rule.pattern.source.includes('(?<'), false,
      rule.id + ' が後読みを使っている（未対応ブラウザでファイル全体が読めなくなる）');
    assert.equal(rule.id.split('.')[0], rule.category,
      rule.id + ' のIDの接頭辞と分類が一致していない');
    assert.equal(rule.category in E.CATEGORIES, true, rule.id + ' の分類が未定義');
    assert.equal(E.SEVERITIES.includes(rule.severity), true, rule.id + ' の重要度が不正');
    assert.equal(typeof rule.message === 'string' && rule.message.length > 0, true, rule.id + ' に説明がない');
    assert.equal(typeof rule.why === 'string' && rule.why.length > 0, true, rule.id + ' に理由がない');
  }
  const ids = E.SPAN_RULES.map((r) => r.id).concat(E.DOCUMENT_CHECKS.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length, 'ルールIDが重複している');
});

test('文書チェックの定義がそろっている', () => {
  for (const check_ of E.DOCUMENT_CHECKS) {
    assert.equal(check_.category in E.CATEGORIES, true, check_.id + ' の分類が未定義');
    assert.equal(E.SEVERITIES.includes(check_.severity), true, check_.id + ' の重要度が不正');
    assert.equal(typeof check_.run, 'function', check_.id + ' に run がない');
    assert.doesNotThrow(() => E.check('', { subject: '' }), check_.id + ' が空入力で落ちる');
  }
  // 指摘は JSON にできる形だけを持つ（描画層へそのまま渡せること）
  const findings = E.check('各位様\n了解しました。', { subject: 'ご連絡' }).findings;
  assert.equal(findings.length > 0, true);
  assert.deepEqual(JSON.parse(JSON.stringify(findings)), findings);
});
