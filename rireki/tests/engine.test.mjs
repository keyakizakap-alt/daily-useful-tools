// としめくり 計算エンジンの単体テスト。assert の失敗メッセージには「直し方」を書く。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../src/engine.js');

const base = { refDate: '2026-11-23', path: 'univ4' };
const summary = (rows) => rows.map((r) => `${r.y}/${r.m} ${r.text}`);

test('parseDate は実在する日付だけを受け付ける', () => {
  assert.deepEqual(T.parseDate('2004-02-29'), { y: 2004, m: 2, d: 29 }, 'うるう日を拒否した。直し方: daysInMonth の isLeap 判定を確認する');
  for (const bad of ['2003-02-29', '2003-13-01', '2003-04-31', '2003/04/01', '', null, '20030401']) {
    assert.equal(T.parseDate(bad), null, `不正な日付 ${bad} を受け付けた。直し方: parseDate の正規表現と日数チェックを確認する`);
  }
});

test('改元境界: 平成→令和、昭和→平成', () => {
  const cases = [
    [[2019, 4, 30], '平成31年'],
    [[2019, 5, 1], '令和元年'],
    [[2020, 1, 1], '令和2年'],
    [[1989, 1, 7], '昭和64年'],
    [[1989, 1, 8], '平成元年'],
    [[1926, 12, 24], '大正15年'],
    [[1926, 12, 25], '昭和元年'],
  ];
  for (const [[y, m, d], label] of cases) {
    assert.equal(T.toWareki(y, m, d).label, label, `${y}-${m}-${d} の和暦が ${label} にならない。直し方: ERAS の開始日を確認する`);
  }
  assert.throws(() => T.toWareki(1912, 7, 29), RangeError, '大正より前を変換した。直し方: toWareki の範囲外で RangeError を投げる');
});

test('学歴欄の年月: 2019年4月は平成31年、5月以降は令和元年', () => {
  assert.equal(T.formatYm(2019, 4, 'wareki'), '平成31年 4月', '2019年4月入学が平成31年にならない。直し方: formatYm は4月を1日で判定する');
  assert.equal(T.formatYm(2019, 3, 'wareki'), '平成31年 3月', '2019年3月卒業が平成31年にならない');
  assert.equal(T.formatYm(2019, 5, 'wareki'), '令和元年 5月', '2019年5月が令和元年にならない');
  assert.equal(T.formatYm(2020, 3, 'wareki'), '令和2年 3月', '2020年3月が令和2年にならない');
  assert.equal(T.formatYm(2020, 3, 'seireki'), '2020年 3月', '西暦表記が崩れた。直し方: yearLabel の seireki 分岐を確認する');
});

test('toSeireki: 和暦の年を西暦に直し、範囲外はエラー', () => {
  assert.equal(T.toSeireki('令和', 1), 2019);
  assert.equal(T.toSeireki('平成', 31), 2019);
  assert.equal(T.toSeireki('昭和', 64), 1989);
  assert.equal(T.toSeireki('大正', 15), 1926);
  assert.throws(() => T.toSeireki('平成', 32), /平成31年までです/, '平成32年を受け付けた。直し方: eraLastYear で上限を確認する');
  assert.throws(() => T.toSeireki('昭和', 0), RangeError, '0年を受け付けた');
  assert.throws(() => T.toSeireki('明治', 1), RangeError, '未対応の元号を受け付けた');
  assert.throws(() => T.toSeireki('令和', 1.5), RangeError, '小数の年を受け付けた');
});

test('warekiDateToSeireki: 元号の期間外の日付を拒否する', () => {
  assert.deepEqual(T.warekiDateToSeireki('令和', 1, 5, 1), { y: 2019, m: 5, d: 1 });
  assert.throws(() => T.warekiDateToSeireki('令和', 1, 4, 30), /平成31年/, '令和元年4月30日を受け付けた。直し方: toWareki の結果の元号と照合する');
  assert.throws(() => T.warekiDateToSeireki('平成', 31, 5, 1), /令和元年/, '平成31年5月1日を受け付けた');
});

test('早生まれの境界: 4月1日生まれは前の学年、4月2日生まれは次の学年', () => {
  const cases = [
    ['2000-04-01', true, 2006],
    ['2000-04-02', false, 2007],
    ['2000-01-01', true, 2006],
    ['2000-03-31', true, 2006],
    ['1999-12-31', false, 2006],
  ];
  for (const [iso, haya, year] of cases) {
    const b = T.parseDate(iso);
    assert.equal(T.isHayaumare(b), haya, `${iso} の早生まれ判定が ${haya} にならない。直し方: isHayaumare の4月1日の扱いを確認する`);
    assert.equal(T.elementaryEntryYear(b), year, `${iso} の小学校入学年が ${year} にならない。直し方: elementaryEntryYear を確認する`);
  }
});

test('満年齢: 誕生日当日に加齢し、2月29日生まれは平年3月1日に加齢', () => {
  const b = T.parseDate('2000-05-10');
  assert.equal(T.ageOn(b, T.parseDate('2026-05-09')), 25, '誕生日前日に加齢した。直し方: ageOn の月日比較を確認する');
  assert.equal(T.ageOn(b, T.parseDate('2026-05-10')), 26, '誕生日当日に加齢しない');
  const leap = T.parseDate('2004-02-29');
  assert.equal(T.ageOn(leap, T.parseDate('2025-02-28')), 20, '2/29生まれが平年2/28に加齢した');
  assert.equal(T.ageOn(leap, T.parseDate('2025-03-01')), 21, '2/29生まれが平年3/1に加齢しない');
  assert.equal(T.ageOn(leap, T.parseDate('2028-02-29')), 24, '2/29生まれがうるう年の2/29に加齢しない');
});

test('大学（4年）: 2003年5月10日生まれの標準的な学歴欄', () => {
  const r = T.buildTimeline({ ...base, birth: '2003-05-10' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(summary(r.rows), [
    '2019/3 ○○中学校 卒業',
    '2019/4 ○○高等学校 入学',
    '2022/3 ○○高等学校 卒業',
    '2022/4 ○○大学 入学',
    '2026/3 ○○大学 卒業',
  ], '学歴欄の年がずれている。直し方: buildTimeline の年数計算を確認する');
  assert.equal(r.age, 23);
  assert.equal(r.hayaumare, false);
});

test('早生まれ（2004年4月1日）は2003年4月2日生まれと同じ学年になる', () => {
  const a = T.buildTimeline({ ...base, birth: '2004-04-01' });
  const b = T.buildTimeline({ ...base, birth: '2003-04-02' });
  const c = T.buildTimeline({ ...base, birth: '2004-04-02' });
  assert.deepEqual(summary(a.rows), summary(b.rows), '4月1日生まれが前の学年にならない。直し方: isHayaumare を確認する');
  assert.notDeepEqual(summary(a.rows), summary(c.rows), '4月2日生まれが同じ学年になっている');
});

test('記入日より後の卒業は「卒業見込み」、入学は「入学予定」', () => {
  const r = T.buildTimeline({ ...base, birth: '2005-08-01', refDate: '2026-11-23' });
  const last = r.rows[r.rows.length - 1];
  assert.equal(last.text, '○○大学 卒業見込み', `最後の行が見込みにならない: ${last.text}。直し方: add() の status 判定を確認する`);
  assert.equal(last.status, 'expected');
  const r2 = T.buildTimeline({ ...base, path: 'master', birth: '2008-08-01', refDate: '2026-11-23' });
  assert.ok(r2.rows.some((x) => x.text === '○○大学 入学予定'), '未来の入学が入学予定にならない');
  assert.ok(r2.rows.some((x) => x.text === '○○大学大学院 修士課程 修了見込み'), '大学院が修了見込みにならない');
  // 卒業月の3月31日当日は「卒業」
  const r3 = T.buildTimeline({ ...base, birth: '2003-05-10', refDate: '2026-03-31' });
  assert.equal(r3.rows[r3.rows.length - 1].text, '○○大学 卒業', '3月31日記入で卒業見込みになった');
});

test('学歴パターン9種の行数と最終行', () => {
  const expect = {
    juniorHigh: [1, '○○中学校 卒業'],
    high: [3, '○○高等学校 卒業'],
    kosen: [3, '○○工業高等専門学校 卒業'],
    junior: [5, '○○短期大学 卒業'],
    vocational: [5, '○○専門学校 卒業'],
    univ4: [5, '○○大学 卒業'],
    univ6: [5, '○○大学 卒業'],
    master: [7, '○○大学大学院 修士課程 修了'],
    doctor: [9, '○○大学大学院 博士課程 修了'],
  };
  for (const p of T.PATHS) {
    const r = T.buildTimeline({ ...base, refDate: '2060-01-01', birth: '1990-06-01', path: p.id });
    const [n, lastText] = expect[p.id];
    assert.equal(r.rows.length, n, `${p.id} の行数が ${n} にならない。直し方: buildTimeline の分岐を確認する`);
    assert.equal(r.rows[r.rows.length - 1].text, lastText, `${p.id} の最終行が違う`);
  }
  const k = T.buildTimeline({ ...base, birth: '1990-06-01', path: 'kosen', refDate: '2060-01-01' });
  assert.equal(k.rows[2].y - k.rows[1].y, 5, '高専が5年にならない');
  const d = T.buildTimeline({ ...base, birth: '1990-06-01', path: 'doctor', refDate: '2060-01-01' });
  assert.equal(d.rows[8].y, 2018, '博士修了年が違う（1990年6月生: 小1997→中卒2006→高卒2009→大卒2013→修士2015→博士2018年3月）');
  const u6 = T.buildTimeline({ ...base, birth: '1990-06-01', path: 'univ6', refDate: '2060-01-01' });
  assert.equal(u6.rows[4].y - u6.rows[3].y, 6, '6年制大学が6年にならない');
});

test('浪人・在学延長・専門学校の年数を反映する', () => {
  const r = T.buildTimeline({
    ...base, birth: '2000-06-01', refDate: '2040-01-01', path: 'master',
    roninYears: 1, extend: { high: 1, post: 1, grad: 1 },
  });
  assert.deepEqual(summary(r.rows), [
    '2016/3 ○○中学校 卒業',
    '2016/4 ○○高等学校 入学',
    '2020/3 ○○高等学校 卒業',
    '2021/4 ○○大学 入学',
    '2026/3 ○○大学 卒業',
    '2026/4 ○○大学大学院 修士課程 入学',
    '2029/3 ○○大学大学院 修士課程 修了',
  ], '浪人・延長の反映がずれている。直し方: postStart / postEnd / masterEnd を確認する');
  const v = T.buildTimeline({ ...base, birth: '2000-06-01', refDate: '2040-01-01', path: 'vocational', vocationalYears: 3 });
  assert.equal(v.rows[4].y - v.rows[3].y, 3, '専門学校の年数が反映されない');
  const clamp = T.buildTimeline({ ...base, birth: '2000-06-01', refDate: '2040-01-01', roninYears: 99, extend: { high: -3 } });
  assert.equal(clamp.rows[3].y, 2019 + 5, '浪人年数が上限5にクランプされない');
  assert.equal(clamp.rows[2].y, 2019, '負の延長年数が0にクランプされない');
});

test('小学校を含める指定で小学校入学から出す', () => {
  const r = T.buildTimeline({ ...base, birth: '2003-05-10', includeElementary: true });
  assert.deepEqual(summary(r.rows).slice(0, 4), [
    '2010/4 ○○小学校 入学',
    '2016/3 ○○小学校 卒業',
    '2016/4 ○○中学校 入学',
    '2019/3 ○○中学校 卒業',
  ], '小学校の行がずれている');
});

test('学校名: 反映・60文字で切る・制御文字を除く', () => {
  const long = 'あ'.repeat(80);
  const r = T.buildTimeline({
    ...base, birth: '2003-05-10',
    schools: { juniorHigh: '  市立\t第一中学校\n', high: long, post: '<img src=x onerror=alert(1)>' },
  });
  assert.equal(r.rows[0].school, '市立第一中学校', '制御文字・前後空白が残った。直し方: cleanSchoolName を確認する');
  assert.equal([...r.rows[1].school].length, 60, '60文字で切られていない');
  assert.equal(r.rows[3].school, '<img src=x onerror=alert(1)>', '学校名は文字列としてそのまま保持する（描画側で textContent を使う）');
});

test('入力エラーは日本語で返す', () => {
  const cases = [
    [{ ...base, birth: '' }, '生年月日を入力してください。'],
    [{ ...base, birth: '2003-02-30' }, '生年月日が正しい日付ではありません。'],
    [{ ...base, birth: '1920-01-01' }, '生年月日は1926年12月25日（昭和元年）以降で入力してください。'],
    [{ ...base, birth: '2027-01-01' }, '生年月日が記入日より後になっています。'],
    [{ ...base, birth: '2003-05-10', refDate: '' }, '記入日を入力してください。'],
    [{ ...base, birth: '2003-05-10', path: 'evil' }, '最終学歴の選択肢が正しくありません。'],
  ];
  for (const [input, msg] of cases) {
    const r = T.buildTimeline(input);
    assert.ok(r.errors.includes(msg), `エラー「${msg}」が出ない（実際: ${r.errors.join(' / ')}）。直し方: buildTimeline の検証を確認する`);
    assert.deepEqual(r.rows, [], 'エラー時に行を返した');
  }
  assert.ok(T.buildTimeline().errors.length > 0, '引数なしで例外にならずエラーを返すこと');
});

test('コピー文字列: タブ区切り3列で、和暦・西暦を切り替えられる', () => {
  const r = T.buildTimeline({ ...base, birth: '2003-05-10' });
  const w = T.formatTimelineText(r.rows, 'wareki').split('\n');
  assert.equal(w[0], '\t\t学歴', '見出し行が違う');
  assert.equal(w[1], '平成31年\t3月\t○○中学校 卒業', `和暦の行が違う: ${w[1]}`);
  assert.equal(w[5], '令和8年\t3月\t○○大学 卒業');
  const s = T.formatTimelineText(r.rows, 'seireki').split('\n');
  assert.equal(s[1], '2019年\t3月\t○○中学校 卒業', `西暦の行が違う: ${s[1]}`);
  for (const line of w.slice(1)) assert.equal(line.split('\t').length, 3, `列数が3でない: ${line}`);
});

// ---- レビュー指摘（feedback/review_report.md R1/R2/R5/R8/R14）への回帰テスト ----

test('R14: 範囲の端（昭和元年の前日・記入日=生年月日）', () => {
  assert.ok(T.buildTimeline({ ...base, birth: '1926-12-24' }).errors.length > 0, '1926-12-24 を受け付けた。直し方: MIN_BIRTH を確認する');
  assert.deepEqual(T.buildTimeline({ ...base, birth: '1926-12-25' }).errors, [], '1926-12-25 を拒否した');
  const same = T.buildTimeline({ ...base, birth: '2026-11-23', refDate: '2026-11-23' });
  assert.deepEqual(same.errors, [], '記入日と同じ生年月日を拒否した');
  assert.equal(same.age, 0);
});

test('R14: 記入日が3月30日なら卒業見込み、3月31日なら卒業、4月1日なら入学済み', () => {
  const at = (ref) => T.buildTimeline({ ...base, birth: '2003-05-10', refDate: ref }).rows;
  assert.equal(at('2026-03-30').at(-1).text, '○○大学 卒業見込み', '3/30 が見込みにならない。直し方: add() の比較日を確認する');
  assert.equal(at('2026-03-31').at(-1).text, '○○大学 卒業', '3/31 が卒業にならない');
  const r = T.buildTimeline({ ...base, birth: '2003-05-10', refDate: '2022-04-01', path: 'univ4' }).rows;
  assert.equal(r[3].text, '○○大学 入学', '4/1 記入で入学予定になった');
  const r2 = T.buildTimeline({ ...base, birth: '2003-05-10', refDate: '2022-03-31', path: 'univ4' }).rows;
  assert.equal(r2[3].text, '○○大学 入学予定', '3/31 記入で入学済みになった');
});

test('R14: 博士は在学延長が博士課程にだけ付き、浪人とも組み合わさる', () => {
  const r = T.buildTimeline({ ...base, birth: '1990-06-01', refDate: '2060-01-01', path: 'doctor', roninYears: 1, extend: { grad: 2 } });
  assert.deepEqual(summary(r.rows).slice(4), [
    '2014/3 ○○大学 卒業',
    '2014/4 ○○大学大学院 修士課程 入学',
    '2016/3 ○○大学大学院 修士課程 修了',
    '2016/4 ○○大学大学院 博士課程 入学',
    '2021/3 ○○大学大学院 博士課程 修了',
  ], '博士の年がずれている。直し方: masterEnd と博士の extGrad を確認する');
});

test('R14: 2月29日生まれの学年と年齢', () => {
  const r = T.buildTimeline({ ...base, birth: '2004-02-29', refDate: '2025-02-28' });
  assert.equal(r.hayaumare, true, '2/29 生まれが早生まれにならない');
  assert.equal(r.rows[0].y, 2019, '2/29 生まれ（2010年入学）の中学卒業が2019年にならない');
  assert.equal(r.age, 20);
});

test('R1: 中学校を卒業していない年齢なら警告を出す（エラーにはしない）', () => {
  const r = T.buildTimeline({ ...base, birth: '2020-01-01', schools: { juniorHigh: 'A中', high: 'B高', post: 'C大' } });
  assert.deepEqual(r.errors, [], '警告であるべきものをエラーにした');
  assert.ok(r.rows.length > 0, '表を出さなかった');
  assert.ok(r.warnings.some((w) => w.includes('中学校を卒業していない')), '年齢の警告が出ない。直し方: buildTimeline の warnings を確認する');
  const ok = T.buildTimeline({ ...base, birth: '2003-05-10', schools: { juniorHigh: 'A中', high: 'B高', post: 'C大' } });
  assert.deepEqual(ok.warnings, [], `通常の入力で警告が出た: ${ok.warnings}`);
});

test('R2: 学校名が未入力の行は placeholder として印を付け、警告を出す', () => {
  const r = T.buildTimeline({ ...base, birth: '2003-05-10', schools: { juniorHigh: '市立第一中学校' } });
  assert.equal(r.rows[0].placeholder, false, '入力済みの学校名を placeholder にした');
  assert.equal(r.rows[1].placeholder, true, '未入力の学校名に placeholder が付かない');
  assert.ok(r.warnings.some((w) => w.includes('学校名が未入力')), '未入力の警告が出ない');
});

test('R8: 学校名から双方向制御文字・ゼロ幅文字・行区切りを除く', () => {
  const name = T.normalizeSchoolName('‮abc​第一 中⁦学⁩校﻿');
  assert.equal(name, 'abc第一中学校', `除去されていない: ${JSON.stringify(name)}。直し方: normalizeSchoolName の正規表現を確認する`);
  assert.equal(T.normalizeSchoolName('　'), '', '全角スペースのみが空にならない');
  assert.equal(T.normalizeSchoolName('𠮷野家高校'), '𠮷野家高校', 'サロゲートペアが壊れた');
});

test('R5: 改元の年は2つの元号を返す', () => {
  assert.deepEqual(T.eraLabelsOfYear(1989), ['昭和64年', '平成元年'], '1989年の元号が違う。直し方: eraLabelsOfYear を確認する');
  assert.deepEqual(T.eraLabelsOfYear(2019), ['平成31年', '令和元年']);
  assert.deepEqual(T.eraLabelsOfYear(1926), ['大正15年', '昭和元年']);
  assert.deepEqual(T.eraLabelsOfYear(2000), ['平成12年']);
});

test('toSeireki と toWareki は全元号の境界年で往復する', () => {
  for (const era of T.ERAS) {
    const { y, m, d } = era.start;
    const w = T.toWareki(y, m, d);
    assert.equal(w.era, era.name);
    assert.equal(T.toSeireki(w.era, w.eraYear), y, `${era.name}元年が往復しない`);
  }
});
