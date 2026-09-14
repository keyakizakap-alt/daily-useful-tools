'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const holidays = require('../src/lib/holidays.js');

/** その年の休日を { 日付: 名称 } のプレーンなオブジェクトにする */
function namesOf(year) {
  const out = {};
  holidays.holidaysOfYear(year).forEach((value, key) => {
    out[key] = value.name;
  });
  return out;
}

function kindOf(year, date) {
  const entry = holidays.holidaysOfYear(year).get(date);
  return entry ? entry.kind : null;
}

test('2026年の休日が祝日法どおりに並ぶ', () => {
  assert.deepEqual(namesOf(2026), {
    '2026-01-01': '元日',
    '2026-01-12': '成人の日',
    '2026-02-11': '建国記念の日',
    '2026-02-23': '天皇誕生日',
    '2026-03-20': '春分の日',
    '2026-04-29': '昭和の日',
    '2026-05-03': '憲法記念日',
    '2026-05-04': 'みどりの日',
    '2026-05-05': 'こどもの日',
    '2026-05-06': '振替休日',
    '2026-07-20': '海の日',
    '2026-08-11': '山の日',
    '2026-09-21': '敬老の日',
    '2026-09-22': '国民の休日',
    '2026-09-23': '秋分の日',
    '2026-10-12': 'スポーツの日',
    '2026-11-03': '文化の日',
    '2026-11-23': '勤労感謝の日',
  });
});

test('振替休日: 日曜の祝日の「その後の最も近い祝日でない日」', () => {
  // 2026-05-03(日) 憲法記念日 → 5/4, 5/5 は祝日なので 5/6 が振替休日
  assert.equal(kindOf(2026, '2026-05-06'), 'substitute');
  // 2021-08-08(日) 山の日 → 8/9
  assert.equal(namesOf(2021)['2021-08-09'], '振替休日');
  // 2023-01-01(日) 元日 → 1/2
  assert.equal(namesOf(2023)['2023-01-02'], '振替休日');
  // 2024年は4回（2/12, 5/6, 9/23, 11/4）
  const y2024 = namesOf(2024);
  assert.equal(y2024['2024-02-12'], '振替休日');
  assert.equal(y2024['2024-05-06'], '振替休日');
  assert.equal(y2024['2024-09-23'], '振替休日');
  assert.equal(y2024['2024-11-04'], '振替休日');
  // 2018-12-23(日) 天皇誕生日 → 12/24
  assert.equal(namesOf(2018)['2018-12-24'], '振替休日');
  // 2007-04-29(日) 昭和の日 → 4/30、2007-02-11(日) 建国記念の日 → 2/12
  const y2007 = namesOf(2007);
  assert.equal(y2007['2007-04-30'], '振替休日');
  assert.equal(y2007['2007-02-12'], '振替休日');
});

test('振替休日に理由が付く', () => {
  const entry = holidays.holidaysOfYear(2021).get('2021-08-09');
  assert.equal(entry.kind, 'substitute');
  assert.match(entry.note, /山の日/);
  assert.match(entry.note, /日曜日/);
});

test('国民の休日: 前後を祝日に挟まれた平日', () => {
  // 2026: 敬老の日(9/21) と 秋分の日(9/23) に挟まれた 9/22
  assert.equal(kindOf(2026, '2026-09-22'), 'citizens');
  // 2019: 即位関連で 4/30 と 5/2 が国民の休日
  const y2019 = namesOf(2019);
  assert.equal(y2019['2019-04-30'], '国民の休日');
  assert.equal(y2019['2019-05-02'], '国民の休日');
  // 2015: 敬老の日(9/21) と 秋分の日(9/23) に挟まれた 9/22 … は対応範囲内の別年で確認
  assert.equal(namesOf(2015)['2015-09-22'], '国民の休日');
});

test('国民の休日に理由が付く', () => {
  const entry = holidays.holidaysOfYear(2026).get('2026-09-22');
  assert.match(entry.note, /敬老の日/);
  assert.match(entry.note, /秋分の日/);
});

test('国民の休日は日曜には設定しない', () => {
  for (let year = holidays.MIN_YEAR; year <= 2060; year += 1) {
    holidays.holidaysOfYear(year).forEach((value, date) => {
      if (value.kind === 'citizens') {
        const weekday = require('../src/lib/dateutil.js').weekdayOf(date);
        assert.notEqual(weekday, 0, `${date} が日曜の国民の休日になっている`);
      }
    });
  }
});

test('2019年の即位関連の特例', () => {
  const y2019 = namesOf(2019);
  assert.equal(y2019['2019-05-01'], '天皇の即位の日');
  assert.equal(y2019['2019-10-22'], '即位礼正殿の儀の行われる日');
  // 2019年に天皇誕生日は設定されない
  assert.equal(Object.values(y2019).includes('天皇誕生日'), false);
  // 2019年は「体育の日」（スポーツの日への改称は2020年から）
  assert.equal(y2019['2019-10-14'], '体育の日');
});

test('2020年・2021年の五輪特例', () => {
  const y2020 = namesOf(2020);
  assert.equal(y2020['2020-07-23'], '海の日');
  assert.equal(y2020['2020-07-24'], 'スポーツの日');
  assert.equal(y2020['2020-08-10'], '山の日');
  assert.equal(y2020['2020-07-20'], undefined, '通常の海の日（7月第3月曜）は無効');
  assert.equal(y2020['2020-08-11'], undefined, '通常の山の日は無効');
  assert.equal(y2020['2020-10-12'], undefined, '通常のスポーツの日は無効');

  const y2021 = namesOf(2021);
  assert.equal(y2021['2021-07-22'], '海の日');
  assert.equal(y2021['2021-07-23'], 'スポーツの日');
  assert.equal(y2021['2021-08-08'], '山の日');
  assert.equal(y2021['2021-08-09'], '振替休日');
  assert.equal(y2021['2021-07-19'], undefined);
  assert.equal(y2021['2021-10-11'], undefined);
});

test('天皇誕生日の移動', () => {
  assert.equal(namesOf(2018)['2018-12-23'], '天皇誕生日');
  assert.equal(namesOf(2018)['2018-02-23'], undefined);
  assert.equal(namesOf(2020)['2020-02-23'], '天皇誕生日');
  assert.equal(namesOf(2020)['2020-12-23'], undefined);
  // 2020-02-23 は日曜なので 2/24 が振替休日
  assert.equal(namesOf(2020)['2020-02-24'], '振替休日');
});

test('春分・秋分: 既知の確定日と一致する', () => {
  const vernal = {
    2007: 21, 2008: 20, 2012: 20, 2016: 20, 2019: 21, 2020: 20,
    2021: 20, 2022: 21, 2023: 21, 2024: 20, 2025: 20, 2026: 20,
    2027: 21, 2028: 20, 2030: 20,
  };
  Object.entries(vernal).forEach(([year, day]) => {
    assert.equal(holidays.vernalEquinoxDay(Number(year)), day, `${year}年の春分日`);
  });

  const autumnal = {
    2007: 23, 2008: 23, 2012: 22, 2016: 22, 2019: 23, 2020: 22,
    2021: 23, 2022: 23, 2023: 23, 2024: 22, 2025: 23, 2026: 23,
    2027: 23, 2028: 22, 2030: 23,
  };
  Object.entries(autumnal).forEach(([year, day]) => {
    assert.equal(holidays.autumnalEquinoxDay(Number(year)), day, `${year}年の秋分日`);
  });
});

test('ハッピーマンデーは必ず月曜になる', () => {
  const dateutil = require('../src/lib/dateutil.js');
  const mondayHolidays = ['成人の日', '海の日', '敬老の日', 'スポーツの日', '体育の日'];
  for (let year = 2022; year <= 2040; year += 1) {
    holidays.statutoryHolidays(year).forEach((item) => {
      if (mondayHolidays.includes(item.name)) {
        assert.equal(dateutil.weekdayOf(item.date), 1, `${item.date} ${item.name} が月曜でない`);
      }
    });
  }
});

test('祝日の件数が妥当な範囲に収まる', () => {
  for (let year = holidays.MIN_YEAR; year <= holidays.MAX_YEAR; year += 1) {
    const count = holidays.holidaysOfYear(year).size;
    assert.ok(count >= 15 && count <= 24, `${year}年の休日数が異常: ${count}`);
  }
});

test('同じ日に休日が重複登録されない', () => {
  for (let year = holidays.MIN_YEAR; year <= 2060; year += 1) {
    const dates = Array.from(holidays.holidaysOfYear(year).keys());
    assert.equal(new Set(dates).size, dates.length, `${year}年に重複がある`);
    // Map は日付昇順
    assert.deepEqual(dates, dates.slice().sort(), `${year}年の並びが昇順でない`);
  }
});

test('休日はすべて対象年に属する', () => {
  for (let year = holidays.MIN_YEAR; year <= 2060; year += 1) {
    holidays.holidaysOfYear(year).forEach((value, date) => {
      assert.equal(date.slice(0, 4), String(year), `${date} が ${year} 年の結果に混入`);
    });
  }
});

test('buildHolidayMap: 複数年を結合し昇順で返す', () => {
  const map = holidays.buildHolidayMap(2026, 2028);
  assert.equal(map.get('2026-01-01').name, '元日');
  assert.equal(map.get('2027-01-01').name, '元日');
  assert.equal(map.get('2028-01-01').name, '元日');
  const keys = Array.from(map.keys());
  assert.deepEqual(keys, keys.slice().sort());
  // 引数が逆順でも同じ結果
  assert.deepEqual(Array.from(holidays.buildHolidayMap(2028, 2026).keys()), keys);
});

test('対応範囲外の年は例外', () => {
  assert.throws(() => holidays.holidaysOfYear(2006), /2007〜2099/);
  assert.throws(() => holidays.holidaysOfYear(2100), /2007〜2099/);
  assert.throws(() => holidays.holidaysOfYear(2026.5), /2007〜2099/);
  assert.throws(() => holidays.holidaysOfYear('2026'), /2007〜2099/);
});

test('年境界をまたぐ休日が発生しないこと（年単位計算の前提）', () => {
  // holidaysOfYear() は年単位で計算するため、以下が崩れると静かに誤る。
  //   - 12/30・12/31 に祝日があると、翌年 1/1 への振替や 12/31 の国民の休日が起きうる
  //   - 1/2 が祝日だと、1/1 と挟まれた関係が前年の計算に影響しうる
  for (let year = holidays.MIN_YEAR; year <= holidays.MAX_YEAR; year += 1) {
    const statutory = holidays.statutoryHolidays(year);
    const dates = new Set(statutory.map((item) => item.date));
    assert.equal(dates.has(`${year}-12-30`), false, `${year}-12-30 に祝日がある`);
    assert.equal(dates.has(`${year}-12-31`), false, `${year}-12-31 に祝日がある`);
    assert.equal(dates.has(`${year}-01-02`), false, `${year}-01-02 に祝日がある`);
  }
});

test('結果は呼び出しごとに同一（純粋関数）', () => {
  assert.deepEqual(namesOf(2026), namesOf(2026));
  assert.deepEqual(namesOf(2031), namesOf(2031));
});
