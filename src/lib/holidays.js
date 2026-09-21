// 国民の祝日・振替休日・国民の休日の算出。
//
// 計算順序には意味がある（docs/architecture.md 2.2）。
//   1. 国民の祝日（固定日・ハッピーマンデー・春分/秋分）
//   2. 年別の特例（2020/2021 の五輪に伴う移動）
//   3. 振替休日（祝日が日曜のとき、その後の最初の「祝日でない日」。連鎖する）
//   4. 国民の休日（前後がともに祝日である平日。祝日・日曜・振替休日は除く）

import { ymd, dayOfWeek, addDays, yearOf } from './date.js';

export const HOLIDAY_YEAR_MIN = 2020;
export const HOLIDAY_YEAR_MAX = 2050;

/** 休日の種別。 */
export const KIND_NATIONAL = 'national'; // 国民の祝日
export const KIND_SUBSTITUTE = 'substitute'; // 振替休日
export const KIND_CITIZEN = 'citizen'; // 国民の休日

// 春分・秋分の近似式（1980〜2099 年で有効）。
function equinoxDay(year, base) {
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

export function vernalEquinoxDay(year) {
  return equinoxDay(year, 20.8431);
}

export function autumnalEquinoxDay(year) {
  return equinoxDay(year, 23.2488);
}

/** その月の n 番目の weekday（0=日）の日。 */
export function nthWeekdayDay(year, month, weekday, n) {
  const firstDow = dayOfWeek(ymd(year, month, 1));
  const shift = (weekday - firstDow + 7) % 7;
  return 1 + shift + (n - 1) * 7;
}

const MONDAY = 1;

// 2020・2021 年は東京オリンピック・パラリンピックに伴い一部の祝日が移動した。
const MOVED = {
  2020: { 海の日: ymd(2020, 7, 23), スポーツの日: ymd(2020, 7, 24), 山の日: ymd(2020, 8, 10) },
  2021: { 海の日: ymd(2021, 7, 22), スポーツの日: ymd(2021, 7, 23), 山の日: ymd(2021, 8, 8) },
};

/** その年の「国民の祝日」だけを返す（振替休日・国民の休日を含まない）。 */
export function nationalHolidaysOf(year) {
  const moved = MOVED[year] ?? {};
  const at = (name, fallback) => moved[name] ?? fallback;
  const entries = [
    [ymd(year, 1, 1), '元日'],
    [ymd(year, 1, nthWeekdayDay(year, 1, MONDAY, 2)), '成人の日'],
    [ymd(year, 2, 11), '建国記念の日'],
    [ymd(year, 2, 23), '天皇誕生日'],
    [ymd(year, 3, vernalEquinoxDay(year)), '春分の日'],
    [ymd(year, 4, 29), '昭和の日'],
    [ymd(year, 5, 3), '憲法記念日'],
    [ymd(year, 5, 4), 'みどりの日'],
    [ymd(year, 5, 5), 'こどもの日'],
    [at('海の日', ymd(year, 7, nthWeekdayDay(year, 7, MONDAY, 3))), '海の日'],
    [at('山の日', ymd(year, 8, 11)), '山の日'],
    [ymd(year, 9, nthWeekdayDay(year, 9, MONDAY, 3)), '敬老の日'],
    [ymd(year, 9, autumnalEquinoxDay(year)), '秋分の日'],
    [at('スポーツの日', ymd(year, 10, nthWeekdayDay(year, 10, MONDAY, 2))), 'スポーツの日'],
    [ymd(year, 11, 3), '文化の日'],
    [ymd(year, 11, 23), '勤労感謝の日'],
  ];
  return new Map(entries.sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

const cache = new Map();

/**
 * その年の休日をすべて返す。
 * @returns {Map<string, {name: string, kind: string}>} 日付昇順
 */
export function holidaysOf(year) {
  if (!Number.isInteger(year)) throw new TypeError('年は整数で指定してください');
  const cached = cache.get(year);
  if (cached) return new Map(cached);

  // 年末年始の振替・国民の休日が年をまたぐ可能性があるため前後1年ぶんを計算してから絞る。
  const national = new Map();
  for (const y of [year - 1, year, year + 1]) {
    for (const [date, name] of nationalHolidaysOf(y)) national.set(date, name);
  }

  const all = new Map();
  for (const [date, name] of national) all.set(date, { name, kind: KIND_NATIONAL });

  // 振替休日: 祝日が日曜なら、その後の最初の「祝日でない日」。
  for (const date of [...national.keys()]) {
    if (dayOfWeek(date) !== 0) continue;
    let candidate = addDays(date, 1);
    while (national.has(candidate)) candidate = addDays(candidate, 1);
    if (!all.has(candidate)) all.set(candidate, { name: '振替休日', kind: KIND_SUBSTITUTE });
  }

  // 国民の休日: 前後がともに「国民の祝日」である平日。
  for (const date of [...national.keys()]) {
    const candidate = addDays(date, 1);
    if (national.has(candidate) || all.has(candidate)) continue;
    if (dayOfWeek(candidate) === 0) continue;
    if (!national.has(addDays(candidate, 1))) continue;
    all.set(candidate, { name: '国民の休日', kind: KIND_CITIZEN });
  }

  const result = new Map(
    [...all.entries()].filter(([date]) => yearOf(date) === year).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  );
  cache.set(year, new Map(result));
  return result;
}

/** from〜to（両端含む）に含まれる休日の Map。 */
export function holidaysInRange(from, to) {
  const out = new Map();
  for (let y = yearOf(from); y <= yearOf(to); y += 1) {
    for (const [date, info] of holidaysOf(y)) {
      if (date >= from && date <= to) out.set(date, info);
    }
  }
  return out;
}

/** 祝日として確定しているか（未確定の年かどうか）の判定に使う。 */
export function isConfirmedYear(year, today) {
  // 国民の祝日は前年2月の官報で確定する。翌年までを「確定」とみなす。
  const thisYear = yearOf(today);
  return year <= thisYear + 1;
}
