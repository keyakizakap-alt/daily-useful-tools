/* ============================================================
   やすみつなぎ — 祝日エンジンの単体テスト
   実行: npm test
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  KIND,
  SUPPORTED_YEARS,
  addDays,
  autumnalEquinoxDay,
  dayOfWeek,
  diffDays,
  fromISO,
  holidayMap,
  holidaysOfYear,
  toISO,
  utcDate,
  vernalEquinoxDay,
} = require('../src/holidays.js');

/** 休日の一覧を 'MM-DD 名称' の配列にする。 */
function digest(year) {
  return holidaysOfYear(year).map((h) => `${h.date.slice(5)} ${h.name}`);
}

/* ------------------------------------------------------------
   日付ユーティリティ
   ------------------------------------------------------------ */

test('fromISO は実在しない日付を拒否する', () => {
  assert.equal(fromISO('2026-02-30'), null, '2月30日');
  assert.equal(fromISO('2026-13-01'), null, '13月');
  assert.equal(fromISO('2026-00-10'), null, '0月');
  assert.equal(fromISO('2026-04-00'), null, '0日');
  assert.equal(fromISO('2026-4-1'), null, '桁が足りない');
  assert.equal(fromISO('2026/04/01'), null, '区切りが違う');
  assert.equal(fromISO(''), null);
  assert.equal(fromISO(null), null);
  assert.equal(fromISO(20260401), null);
  // うるう年は受け付ける
  assert.notEqual(fromISO('2028-02-29'), null, '2028年はうるう年');
  assert.equal(fromISO('2027-02-29'), null, '2027年はうるう年ではない');
});

test('toISO と fromISO は往復する', () => {
  for (const iso of ['2016-01-01', '2026-03-20', '2099-12-31', '2028-02-29']) {
    assert.equal(toISO(fromISO(iso)), iso);
  }
});

test('addDays は月末・年末・うるう日をまたぐ', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('dayOfWeek はタイムゾーンに影響されない', () => {
  // UTC 固定の実装であることの確認（ローカルタイムだと環境によりずれる）
  assert.equal(dayOfWeek('2026-01-01'), 4, '2026-01-01 は木曜');
  assert.equal(dayOfWeek('2026-03-20'), 5, '2026-03-20 は金曜');
  assert.equal(dayOfWeek('2026-05-03'), 0, '2026-05-03 は日曜');
});

test('diffDays は両端を含めた日数を返す', () => {
  assert.equal(diffDays('2026-01-01', '2026-01-01'), 1);
  assert.equal(diffDays('2026-01-01', '2026-01-03'), 3);
  assert.equal(diffDays('2026-01-01', '2026-12-31'), 365);
  assert.equal(diffDays('2028-01-01', '2028-12-31'), 366, 'うるう年');
});

test('utcDate は月を 1 起点で受ける', () => {
  assert.equal(toISO(utcDate(2026, 1, 1)), '2026-01-01');
  assert.equal(toISO(utcDate(2026, 12, 31)), '2026-12-31');
});

/* ------------------------------------------------------------
   春分・秋分
   ------------------------------------------------------------ */

test('春分・秋分が官報の公表値と一致する', () => {
  // 内閣府「国民の祝日について」の公表値
  assert.equal(vernalEquinoxDay(2026), 20);
  assert.equal(autumnalEquinoxDay(2026), 23);
  assert.equal(vernalEquinoxDay(2027), 21);
  assert.equal(autumnalEquinoxDay(2027), 23);
  assert.equal(vernalEquinoxDay(2025), 20);
  assert.equal(autumnalEquinoxDay(2025), 23);
  assert.equal(vernalEquinoxDay(2024), 20);
  assert.equal(autumnalEquinoxDay(2024), 22);
});

/* ------------------------------------------------------------
   年ごとの祝日の一覧（回帰テストの本体）
   ------------------------------------------------------------ */

test('2026年の休日が官報の公表値と一致する', () => {
  assert.deepEqual(digest(2026), [
    '01-01 元日',
    '01-12 成人の日',
    '02-11 建国記念の日',
    '02-23 天皇誕生日',
    '03-20 春分の日',
    '04-29 昭和の日',
    '05-03 憲法記念日',
    '05-04 みどりの日',
    '05-05 こどもの日',
    '05-06 振替休日',
    '07-20 海の日',
    '08-11 山の日',
    '09-21 敬老の日',
    '09-22 国民の休日',
    '09-23 秋分の日',
    '10-12 スポーツの日',
    '11-03 文化の日',
    '11-23 勤労感謝の日',
  ]);
});

test('2027年の休日が官報の公表値と一致する', () => {
  assert.deepEqual(digest(2027), [
    '01-01 元日',
    '01-11 成人の日',
    '02-11 建国記念の日',
    '02-23 天皇誕生日',
    '03-21 春分の日',
    '03-22 振替休日',
    '04-29 昭和の日',
    '05-03 憲法記念日',
    '05-04 みどりの日',
    '05-05 こどもの日',
    '07-19 海の日',
    '08-11 山の日',
    '09-20 敬老の日',
    '09-23 秋分の日',
    '10-11 スポーツの日',
    '11-03 文化の日',
    '11-23 勤労感謝の日',
  ]);
});

/* ------------------------------------------------------------
   振替休日
   ------------------------------------------------------------ */

test('祝日が日曜なら翌日が振替休日になる', () => {
  // 2023/1/1 は日曜 → 1/2 が振替休日
  const h2023 = holidaysOfYear(2023);
  const sub = h2023.find((h) => h.date === '2023-01-02');
  assert.ok(sub, '2023-01-02 が休日である');
  assert.equal(sub.name, '振替休日');
  assert.equal(sub.kind, KIND.SUBSTITUTE);
});

test('連続する祝日の日曜は、祝日でない最初の日に振り替わる', () => {
  // 2026/5/3(日) 憲法記念日。5/4・5/5 も祝日なので 5/6 へ飛ぶ
  const dates = holidaysOfYear(2026).map((h) => h.date);
  assert.ok(dates.includes('2026-05-06'), '5/6 が振替休日');
  assert.ok(!dates.includes('2026-05-07'), '5/7 は休日にしない');
  const sub = holidaysOfYear(2026).find((h) => h.date === '2026-05-06');
  assert.equal(sub.name, '振替休日');
});

test('祝日が土曜のときは振替休日が付かない', () => {
  // 2028/1/1 は土曜
  assert.equal(dayOfWeek('2028-01-01'), 6);
  const dates = holidaysOfYear(2028).map((h) => h.date);
  assert.ok(!dates.includes('2028-01-03'), '土曜の祝日に振替はない');
});

/* ------------------------------------------------------------
   国民の休日
   ------------------------------------------------------------ */

test('祝日に挟まれた平日が国民の休日になる', () => {
  // 2026/9/21 敬老の日(月) と 9/23 秋分の日(水) に挟まれた 9/22(火)
  const citizens = holidaysOfYear(2026).find((h) => h.date === '2026-09-22');
  assert.ok(citizens);
  assert.equal(citizens.name, '国民の休日');
  assert.equal(citizens.kind, KIND.CITIZENS);
});

test('祝日が隣接しているだけでは国民の休日は生まれない', () => {
  // 2027 は 9/20 敬老の日 と 9/23 秋分の日 の間が 2 日空くため該当なし
  const names = holidaysOfYear(2027).map((h) => h.name);
  assert.ok(!names.includes('国民の休日'));
});

test('2019年の代替わり関連の休日が入る', () => {
  const d = digest(2019);
  assert.ok(d.includes('05-01 天皇の即位の日'));
  assert.ok(d.includes('10-22 即位礼正殿の儀の行われる日'));
  // 4/29 昭和の日 と 5/1 に挟まれた 4/30、5/1 と 5/3 に挟まれた 5/2 が国民の休日
  assert.ok(d.includes('04-30 国民の休日'));
  assert.ok(d.includes('05-02 国民の休日'));
  // 2019 年に天皇誕生日はない
  assert.ok(!d.some((x) => x.includes('天皇誕生日')), '2019年は天皇誕生日なし');
  assert.ok(d.includes('10-14 体育の日'), '2019年はスポーツの日ではなく体育の日');
});

/* ------------------------------------------------------------
   年ごとの特例
   ------------------------------------------------------------ */

test('2020年は五輪特例の日付になる', () => {
  const d = digest(2020);
  assert.ok(d.includes('07-23 海の日'));
  assert.ok(d.includes('07-24 スポーツの日'));
  assert.ok(d.includes('08-10 山の日'));
  assert.ok(d.includes('02-23 天皇誕生日'));
  assert.ok(d.includes('02-24 振替休日'), '2/23 が日曜のため');
  assert.ok(!d.some((x) => x.includes('10-1')), '10月に祝日はない');
});

test('2021年は五輪特例の日付になる', () => {
  const d = digest(2021);
  assert.ok(d.includes('07-22 海の日'));
  assert.ok(d.includes('07-23 スポーツの日'));
  assert.ok(d.includes('08-08 山の日'));
  assert.ok(d.includes('08-09 振替休日'), '8/8 が日曜のため');
});

test('2018年以前は天皇誕生日が12月23日で、体育の日がある', () => {
  const d = digest(2016);
  assert.ok(d.includes('12-23 天皇誕生日'));
  assert.ok(d.includes('10-10 体育の日'));
  assert.ok(!d.some((x) => x.includes('スポーツの日')));
});

test('2022年以降は現行法どおりになる', () => {
  const d = digest(2022);
  assert.ok(d.includes('02-23 天皇誕生日'));
  assert.ok(d.includes('08-11 山の日'));
  assert.ok(d.includes('10-10 スポーツの日'), '10月第2月曜');
  assert.ok(d.includes('07-18 海の日'), '7月第3月曜');
});

test('ハッピーマンデーは必ず月曜になる', () => {
  for (let year = SUPPORTED_YEARS.min; year <= 2040; year += 1) {
    for (const h of holidaysOfYear(year)) {
      if (['成人の日', '敬老の日'].includes(h.name)) {
        assert.equal(dayOfWeek(h.date), 1, `${h.date} ${h.name} は月曜`);
      }
      // 海の日・スポーツの日は 2020・2021 年の特例で月曜以外になる
      if (['海の日', 'スポーツの日', '体育の日'].includes(h.name) && year !== 2020 && year !== 2021) {
        assert.equal(dayOfWeek(h.date), 1, `${h.date} ${h.name} は月曜`);
      }
    }
  }
});

/* ------------------------------------------------------------
   不変条件・範囲
   ------------------------------------------------------------ */

test('対応年の全域で、休日は日付昇順・重複なしで返る', () => {
  for (let year = SUPPORTED_YEARS.min; year <= SUPPORTED_YEARS.max; year += 1) {
    const list = holidaysOfYear(year);
    assert.ok(list.length >= 16, `${year}年の休日が少なすぎる: ${list.length}`);
    assert.ok(list.length <= 25, `${year}年の休日が多すぎる: ${list.length}`);
    const dates = list.map((h) => h.date);
    assert.deepEqual(dates, [...dates].sort(), `${year}年が昇順でない`);
    assert.equal(new Set(dates).size, dates.length, `${year}年に重複がある`);
    for (const h of list) {
      assert.ok(fromISO(h.date), `${h.date} が不正`);
      assert.equal(h.date.slice(0, 4), String(year), `${h.date} が対象年の外`);
      assert.ok(typeof h.name === 'string' && h.name.length > 0);
      assert.ok(Object.values(KIND).includes(h.kind));
    }
  }
});

test('国民の休日は日曜にならない', () => {
  for (let year = SUPPORTED_YEARS.min; year <= SUPPORTED_YEARS.max; year += 1) {
    for (const h of holidaysOfYear(year)) {
      if (h.kind === KIND.CITIZENS) {
        assert.notEqual(dayOfWeek(h.date), 0, `${h.date} が日曜の国民の休日`);
      }
    }
  }
});

test('対応範囲外の年は RangeError になる', () => {
  for (const bad of [2015, 2100, 0, -1, 1.5, NaN, '2026', null, undefined]) {
    assert.throws(() => holidaysOfYear(bad), RangeError, `${String(bad)} を受け付けてしまった`);
  }
});

/* ------------------------------------------------------------
   holidayMap
   ------------------------------------------------------------ */

test('holidayMap は年をまたぐ期間を扱える', () => {
  const map = holidayMap('2026-12-25', '2027-01-15');
  assert.ok(map.has('2027-01-01'), '元日');
  assert.ok(map.has('2027-01-11'), '成人の日');
  assert.ok(!map.has('2026-11-23'), '期間外は含まない');
  assert.equal(map.get('2027-01-01').name, '元日');
});

test('holidayMap は期間の両端を含む', () => {
  const map = holidayMap('2026-01-01', '2026-01-01');
  assert.equal(map.size, 1);
  assert.ok(map.has('2026-01-01'));
});

test('holidayMap は不正な入力を弾く', () => {
  assert.throws(() => holidayMap('2026-13-01', '2026-12-31'), TypeError);
  assert.throws(() => holidayMap('2026-12-31', '2026-01-01'), RangeError, '開始が終了より後');
});
