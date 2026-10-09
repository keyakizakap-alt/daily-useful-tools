/* ============================================================
   とびいし — 祝日計算の単体テスト
   実行: npm test
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/holidays.js');

function dates(year) {
  return H.holidaysInYear(year).map((h) => h.date);
}

function find(year, date) {
  return H.holidaysInYear(year).find((h) => h.date === date) || null;
}

/* ============================================================
   日付ユーティリティ
   ============================================================ */

test('iso / parseIso は実在しない日を受け付けない', () => {
  assert.equal(H.iso(2026, 3, 7), '2026-03-07');
  assert.deepEqual(H.parseIso('2026-03-07'), { year: 2026, month: 3, day: 7 });
  assert.equal(H.parseIso('2026-02-30'), null);
  assert.equal(H.parseIso('2026-13-01'), null);
  assert.equal(H.parseIso('2026-3-7'), null);
  assert.equal(H.parseIso('20260307'), null);
  assert.equal(H.parseIso(20260307), null);
  assert.equal(H.parseIso(null), null);
});

test('うるう年の2月29日は実在扱い', () => {
  assert.ok(H.isValidIso('2028-02-29'));
  assert.ok(!H.isValidIso('2026-02-29'));
  assert.equal(H.daysInMonth(2028, 2), 29);
  assert.equal(H.daysInMonth(2026, 2), 28);
});

test('通日の往復とタイムゾーン非依存', () => {
  assert.equal(H.fromDayNumber(H.toDayNumber('2026-01-01')), '2026-01-01');
  assert.equal(H.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(H.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(H.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(H.toDayNumber('1970-01-01'), 0);
});

test('曜日が正しい', () => {
  assert.equal(H.dayOfWeek('2026-01-01'), 4);      // 木
  assert.equal(H.dowLabel(H.dayOfWeek('2026-01-01')), '木');
  assert.equal(H.dowLabel(H.dayOfWeek('2026-10-05')), '月');
});

/* ============================================================
   規則の計算
   ============================================================ */

test('第n月曜の計算', () => {
  assert.equal(H.nthMonday(2026, 1, 2), '2026-01-12');   // 成人の日
  assert.equal(H.nthMonday(2026, 7, 3), '2026-07-20');   // 海の日
  assert.equal(H.nthMonday(2026, 10, 2), '2026-10-12');  // スポーツの日
  // 1日が月曜の月では、第1月曜が1日になる
  assert.equal(H.dayOfWeek('2026-06-01'), 1);
  assert.equal(H.nthMonday(2026, 6, 1), '2026-06-01');
});

test('春分・秋分の近似式', () => {
  assert.equal(H.equinoxDay(2026, 20.8431), 20);
  assert.equal(H.equinoxDay(2027, 20.8431), 21);
  assert.equal(H.equinoxDay(2028, 20.8431), 20);
  assert.equal(H.equinoxDay(2026, 23.2488), 23);
  assert.equal(H.equinoxDay(2028, 23.2488), 22);
});

/* ============================================================
   年ごとの期待値（既知の暦と突き合わせる）
   ============================================================ */

test('2026年の休日は18件で、既知の暦と一致する', () => {
  assert.deepEqual(dates(2026), [
    '2026-01-01',  // 元日（木）
    '2026-01-12',  // 成人の日
    '2026-02-11',  // 建国記念の日
    '2026-02-23',  // 天皇誕生日
    '2026-03-20',  // 春分の日
    '2026-04-29',  // 昭和の日
    '2026-05-03',  // 憲法記念日（日）
    '2026-05-04',  // みどりの日
    '2026-05-05',  // こどもの日
    '2026-05-06',  // 振替休日
    '2026-07-20',  // 海の日
    '2026-08-11',  // 山の日
    '2026-09-21',  // 敬老の日
    '2026-09-22',  // 国民の休日
    '2026-09-23',  // 秋分の日
    '2026-10-12',  // スポーツの日
    '2026-11-03',  // 文化の日
    '2026-11-23'   // 勤労感謝の日
  ]);
});

test('2027年の休日は17件で、既知の暦と一致する', () => {
  assert.deepEqual(dates(2027), [
    '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23',
    '2027-03-21', '2027-03-22',  // 春分の日（日）＋振替休日
    '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05',
    '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23',
    '2027-10-11', '2027-11-03', '2027-11-23'
  ]);
});

/* ============================================================
   振替休日（祝日法 第3条第2項）
   ============================================================ */

test('日曜の祝日には振替休日がつく', () => {
  const substitute = find(2027, '2027-03-22');
  assert.equal(substitute.kind, '振替休日');
  assert.equal(H.dayOfWeek('2027-03-21'), 0);
});

test('祝日が連続する5月でも、祝日でない最初の日まで後ろへずれる', () => {
  // 2026年: 5/3(日) 憲法記念日 → 5/4 みどりの日・5/5 こどもの日は祝日 → 5/6 が振替休日
  assert.equal(find(2026, '2026-05-04').kind, '祝日');
  assert.equal(find(2026, '2026-05-05').kind, '祝日');
  assert.equal(find(2026, '2026-05-06').kind, '振替休日');
  // 2025年: 5/4(日) みどりの日 → 5/5 こどもの日は祝日 → 5/6 が振替休日（「翌日」ではない）
  assert.equal(H.dayOfWeek('2025-05-04'), 0);
  assert.equal(find(2025, '2025-05-05').kind, '祝日');
  assert.equal(find(2025, '2025-05-06').kind, '振替休日');
  // 2032年は 5/3 が月曜なので、5月に振替休日は生まれない
  assert.equal(find(2032, '2032-05-06'), null);
});

test('振替休日は1日しか作られない（同じ日に2つ重ならない）', () => {
  for (let y = H.MIN_YEAR; y <= H.MAX_YEAR; y++) {
    const list = H.holidaysInYear(y);
    const unique = new Set(list.map((h) => h.date));
    assert.equal(unique.size, list.length, y + '年に同じ日付の休日が重複している');
  }
});

/* ============================================================
   国民の休日（祝日法 第3条第3項）
   ============================================================ */

test('祝日に挟まれた平日は国民の休日になる', () => {
  // 2026年9月: 21(月)敬老の日 / 23(水)秋分の日 → 22(火)が国民の休日
  const extra = find(2026, '2026-09-22');
  assert.equal(extra.kind, '国民の休日');
  assert.equal(extra.name, '国民の休日');
});

test('国民の休日は、挟む2日がどちらも「祝日」のときだけ成立する', () => {
  // 2027年9月は 20(月)敬老の日 / 23(木)秋分の日 で間が2日あるため成立しない
  assert.equal(find(2027, '2027-09-21'), null);
  assert.equal(find(2027, '2027-09-22'), null);
  // 振替休日に隣接しただけでは国民の休日にならない
  for (let y = H.MIN_YEAR; y <= H.MAX_YEAR; y++) {
    for (const h of H.holidaysInYear(y)) {
      if (h.kind !== '国民の休日') continue;
      const before = find(y, H.addDays(h.date, -1));
      const after = find(y, H.addDays(h.date, 1));
      assert.ok(before && before.kind === '祝日', y + ' ' + h.date + ' の前日が祝日でない');
      assert.ok(after && after.kind === '祝日', y + ' ' + h.date + ' の翌日が祝日でない');
    }
  }
});

test('国民の休日は日曜にならない（日曜は対象外）', () => {
  for (let y = H.MIN_YEAR; y <= H.MAX_YEAR; y++) {
    for (const h of H.holidaysInYear(y)) {
      if (h.kind === '国民の休日') {
        assert.notEqual(H.dayOfWeek(h.date), 0, y + ' ' + h.date);
      }
    }
  }
});

/* ============================================================
   年単位の特例（東京五輪）
   ============================================================ */

test('2020年の海の日・スポーツの日・山の日は移動後の日付', () => {
  assert.equal(find(2020, '2020-07-23').name, '海の日');
  assert.equal(find(2020, '2020-07-24').name, 'スポーツの日');
  assert.equal(find(2020, '2020-08-10').name, '山の日');
  // 本来の日付には祝日が立たない
  assert.equal(find(2020, '2020-07-20'), null);   // 7月第3月曜
  assert.equal(find(2020, '2020-08-11'), null);
});

test('2021年の山の日は8月8日（日）で、8月9日が振替休日', () => {
  assert.equal(find(2021, '2021-08-08').name, '山の日');
  assert.equal(H.dayOfWeek('2021-08-08'), 0);
  assert.equal(find(2021, '2021-08-09').kind, '振替休日');
  assert.equal(find(2021, '2021-07-22').name, '海の日');
  assert.equal(find(2021, '2021-07-23').name, 'スポーツの日');
});

/* ============================================================
   対応範囲
   ============================================================ */

test('対応年の外は空配列を返す', () => {
  assert.equal(H.MIN_YEAR, 2020);
  assert.equal(H.MAX_YEAR, 2050);
  assert.deepEqual(H.holidaysInYear(2019), []);
  assert.deepEqual(H.holidaysInYear(2051), []);
  assert.deepEqual(H.holidaysInYear(2026.5), []);
  assert.deepEqual(H.holidaysInYear('2026'), []);
  assert.ok(H.isSupportedYear(2020) && H.isSupportedYear(2050));
  assert.ok(!H.isSupportedYear(2019) && !H.isSupportedYear(2051));
});

test('対応年はすべて16種の祝日を持つ（規則の取りこぼしがない）', () => {
  for (let y = H.MIN_YEAR; y <= H.MAX_YEAR; y++) {
    const statutory = H.holidaysInYear(y).filter((h) => h.kind === '祝日');
    assert.equal(statutory.length, 16, y + '年の祝日が16件ではない');
    const names = new Set(statutory.map((h) => h.name));
    assert.equal(names.size, 16, y + '年に同名の祝日がある');
  }
});

test('holidayMap は年をまたいで1つのマップにまとまる', () => {
  const map = H.holidayMap(2026, 2027);
  assert.equal(map['2026-01-01'].name, '元日');
  assert.equal(map['2027-03-22'].kind, '振替休日');
  assert.equal(map['2026-06-01'], undefined);
  assert.equal(Object.keys(H.holidayMap(2027, 2026)).length, 0);   // 逆順は空
});

test('holidayMap はプロトタイプを持たない（外から来るキーで引くため）', () => {
  const map = H.holidayMap(2026, 2026);
  assert.equal(Object.getPrototypeOf(map), null);
  assert.equal(map.constructor, undefined);
  assert.equal(map['__proto__'], undefined);
  assert.equal(map.toString, undefined);
});

test('holidaysInYear の戻り値を書き換えてもキャッシュが汚れない', () => {
  const first = H.holidaysInYear(2026);
  first[0].name = '書き換え';
  first.push({ date: '2026-06-01', name: '偽の祝日', kind: '祝日' });
  const second = H.holidaysInYear(2026);
  assert.equal(second[0].name, '元日');
  assert.equal(second.length, 18);
});
