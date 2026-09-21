// 祝日ロジックの検証。期待値は内閣府が公表している「国民の祝日」の一覧に合わせている。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  holidaysOf,
  nationalHolidaysOf,
  vernalEquinoxDay,
  autumnalEquinoxDay,
  nthWeekdayDay,
  isConfirmedYear,
  KIND_NATIONAL,
  KIND_SUBSTITUTE,
  KIND_CITIZEN,
} from '../src/lib/holidays.js';
import { dayOfWeek } from '../src/lib/date.js';

const EXPECTED = {
  2020: {
    '2020-01-01': '元日',
    '2020-01-13': '成人の日',
    '2020-02-11': '建国記念の日',
    '2020-02-23': '天皇誕生日',
    '2020-02-24': '振替休日',
    '2020-03-20': '春分の日',
    '2020-04-29': '昭和の日',
    '2020-05-03': '憲法記念日',
    '2020-05-04': 'みどりの日',
    '2020-05-05': 'こどもの日',
    '2020-05-06': '振替休日',
    '2020-07-23': '海の日',
    '2020-07-24': 'スポーツの日',
    '2020-08-10': '山の日',
    '2020-09-21': '敬老の日',
    '2020-09-22': '秋分の日',
    '2020-11-03': '文化の日',
    '2020-11-23': '勤労感謝の日',
  },
  2021: {
    '2021-01-01': '元日',
    '2021-01-11': '成人の日',
    '2021-02-11': '建国記念の日',
    '2021-02-23': '天皇誕生日',
    '2021-03-20': '春分の日',
    '2021-04-29': '昭和の日',
    '2021-05-03': '憲法記念日',
    '2021-05-04': 'みどりの日',
    '2021-05-05': 'こどもの日',
    '2021-07-22': '海の日',
    '2021-07-23': 'スポーツの日',
    '2021-08-08': '山の日',
    '2021-08-09': '振替休日',
    '2021-09-20': '敬老の日',
    '2021-09-23': '秋分の日',
    '2021-11-03': '文化の日',
    '2021-11-23': '勤労感謝の日',
  },
  2024: {
    '2024-01-01': '元日',
    '2024-01-08': '成人の日',
    '2024-02-11': '建国記念の日',
    '2024-02-12': '振替休日',
    '2024-02-23': '天皇誕生日',
    '2024-03-20': '春分の日',
    '2024-04-29': '昭和の日',
    '2024-05-03': '憲法記念日',
    '2024-05-04': 'みどりの日',
    '2024-05-05': 'こどもの日',
    '2024-05-06': '振替休日',
    '2024-07-15': '海の日',
    '2024-08-11': '山の日',
    '2024-08-12': '振替休日',
    '2024-09-16': '敬老の日',
    '2024-09-22': '秋分の日',
    '2024-09-23': '振替休日',
    '2024-10-14': 'スポーツの日',
    '2024-11-03': '文化の日',
    '2024-11-04': '振替休日',
    '2024-11-23': '勤労感謝の日',
  },
  2025: {
    '2025-01-01': '元日',
    '2025-01-13': '成人の日',
    '2025-02-11': '建国記念の日',
    '2025-02-23': '天皇誕生日',
    '2025-02-24': '振替休日',
    '2025-03-20': '春分の日',
    '2025-04-29': '昭和の日',
    '2025-05-03': '憲法記念日',
    '2025-05-04': 'みどりの日',
    '2025-05-05': 'こどもの日',
    '2025-05-06': '振替休日',
    '2025-07-21': '海の日',
    '2025-08-11': '山の日',
    '2025-09-15': '敬老の日',
    '2025-09-23': '秋分の日',
    '2025-10-13': 'スポーツの日',
    '2025-11-03': '文化の日',
    '2025-11-23': '勤労感謝の日',
    '2025-11-24': '振替休日',
  },
  2026: {
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
  },
};

for (const [year, expected] of Object.entries(EXPECTED)) {
  test(`${year}年の休日が公表値と一致する`, () => {
    const actual = Object.fromEntries([...holidaysOf(Number(year))].map(([date, info]) => [date, info.name]));
    assert.deepEqual(actual, expected);
  });
}

test('休日の種別が正しく付く', () => {
  const y2026 = holidaysOf(2026);
  assert.equal(y2026.get('2026-01-01').kind, KIND_NATIONAL);
  assert.equal(y2026.get('2026-05-06').kind, KIND_SUBSTITUTE);
  assert.equal(y2026.get('2026-09-22').kind, KIND_CITIZEN);
});

test('振替休日は祝日が連続していても後ろへずれる（2026-05-03 日曜 → 05-06）', () => {
  const y2026 = holidaysOf(2026);
  assert.equal(dayOfWeek('2026-05-03'), 0);
  assert.equal(y2026.has('2026-05-04'), true); // みどりの日
  assert.equal(y2026.has('2026-05-05'), true); // こどもの日
  assert.equal(y2026.get('2026-05-06').name, '振替休日');
});

test('国民の休日は前後が祝日の平日にだけ生じる', () => {
  // 2026年は敬老の日(9/21 月)と秋分の日(9/23 水)に挟まれた 9/22(火) が該当する。
  const y2026 = holidaysOf(2026);
  assert.equal(y2026.get('2026-09-22').name, '国民の休日');
  // 2025年は敬老の日(9/15)と秋分の日(9/23)が離れているため生じない。
  const y2025 = holidaysOf(2025);
  for (let day = 16; day <= 22; day += 1) {
    assert.equal(y2025.has(`2025-09-${String(day).padStart(2, '0')}`), false);
  }
});

test('ハッピーマンデーは必ず月曜になる', () => {
  for (let year = 2022; year <= 2050; year += 1) {
    for (const [date, info] of holidaysOf(year)) {
      if (['成人の日', '海の日', '敬老の日', 'スポーツの日'].includes(info.name)) {
        assert.equal(dayOfWeek(date), 1, `${date} (${info.name}) が月曜ではない`);
      }
    }
  }
});

test('春分・秋分の近似式が既知の年と一致する', () => {
  assert.equal(vernalEquinoxDay(2023), 21);
  assert.equal(vernalEquinoxDay(2024), 20);
  assert.equal(vernalEquinoxDay(2025), 20);
  assert.equal(vernalEquinoxDay(2026), 20);
  assert.equal(vernalEquinoxDay(2027), 21);
  assert.equal(autumnalEquinoxDay(2023), 23);
  assert.equal(autumnalEquinoxDay(2024), 22);
  assert.equal(autumnalEquinoxDay(2025), 23);
  assert.equal(autumnalEquinoxDay(2026), 23);
});

test('nthWeekdayDay が月初の曜日に依らず正しい', () => {
  assert.equal(nthWeekdayDay(2026, 1, 1, 2), 12); // 2026年1月第2月曜
  assert.equal(nthWeekdayDay(2026, 7, 1, 3), 20); // 7月第3月曜
  assert.equal(nthWeekdayDay(2024, 10, 1, 2), 14); // 2024年10月第2月曜
});

test('国民の祝日の一覧には振替休日が含まれない', () => {
  const national = nationalHolidaysOf(2026);
  assert.equal(national.has('2026-05-06'), false);
  assert.equal(national.has('2026-09-22'), false);
  assert.equal(national.size, 16);
});

test('祝日は毎年16日ぶん定義されている（2022年以降）', () => {
  for (let year = 2022; year <= 2050; year += 1) {
    assert.equal(nationalHolidaysOf(year).size, 16, `${year}年の祝日数が16でない`);
  }
});

test('確定年の判定', () => {
  assert.equal(isConfirmedYear(2026, '2026-09-21'), true);
  assert.equal(isConfirmedYear(2027, '2026-09-21'), true);
  assert.equal(isConfirmedYear(2028, '2026-09-21'), false);
});

test('holidaysOf は対象年だけを返す', () => {
  for (const [date] of holidaysOf(2026)) {
    assert.equal(date.startsWith('2026-'), true);
  }
});
