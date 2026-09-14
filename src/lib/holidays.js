/**
 * holidays — 「国民の祝日に関する法律」（祝日法）に基づく日本の休日計算。
 *
 * 3 段階で組み立てる。順序を入れ替えると連鎖判定を誤るため固定。
 *   1. 本来の祝日（固定日・ハッピーマンデー・春分/秋分・特例年）
 *   2. 振替休日（祝日が日曜のとき、その後の最も近い「祝日でない日」）
 *   3. 国民の休日（前日・翌日がともに祝日である平日）
 *
 * 注意: 春分の日・秋分の日は近似式による計算値であり、法的には前年 2 月の
 * 官報告示で確定する。将来の法改正（祝日の新設・移動）も反映されない。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dateutil.js'));
  } else {
    global.Yasumi = global.Yasumi || {};
    global.Yasumi.holidays = factory(global.Yasumi.dateutil);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (dateutil) {
  'use strict';

  /** 現行の振替休日の規定（「その後の最も近い祝日でない日」）が施行された年 */
  var MIN_YEAR = 2007;
  /** 春分/秋分の近似式が有効な上限年 */
  var MAX_YEAR = 2099;

  var KIND = {
    HOLIDAY: 'holiday', // 国民の祝日
    SUBSTITUTE: 'substitute', // 振替休日
    CITIZENS: 'citizens', // 国民の休日
  };

  var KIND_LABEL = {
    holiday: '国民の祝日',
    substitute: '振替休日',
    citizens: '国民の休日',
  };

  /** 五輪特例・即位関連など、法改正で個別に移動した祝日 */
  var SPECIAL_YEARS = {
    2019: {
      // 天皇の退位等に関する皇室典範特例法に伴う祝日
      extra: [
        { month: 5, day: 1, name: '天皇の即位の日' },
        { month: 10, day: 22, name: '即位礼正殿の儀の行われる日' },
      ],
    },
    2020: {
      moved: {
        海の日: { month: 7, day: 23 },
        スポーツの日: { month: 7, day: 24 },
        山の日: { month: 8, day: 10 },
      },
    },
    2021: {
      moved: {
        海の日: { month: 7, day: 22 },
        スポーツの日: { month: 7, day: 23 },
        山の日: { month: 8, day: 8 },
      },
    },
  };

  function assertYear(year) {
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      throw new Error(
        '対応している年は ' + MIN_YEAR + '〜' + MAX_YEAR + ' 年です: ' + String(year)
      );
    }
  }

  /**
   * 春分日（近似式、1980–2099 年で有効）
   */
  function vernalEquinoxDay(year) {
    assertYear(year);
    return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  }

  /**
   * 秋分日（近似式、1980–2099 年で有効）
   */
  function autumnalEquinoxDay(year) {
    assertYear(year);
    return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  }

  /**
   * その年の「本来の祝日」（振替休日・国民の休日を含まない）。
   * @returns {Array<{date: string, name: string}>} 日付昇順
   */
  function statutoryHolidays(year) {
    assertYear(year);
    var special = SPECIAL_YEARS[year] || {};
    var moved = special.moved || {};
    var list = [];

    function push(name, month, day) {
      var override = moved[name];
      if (override) {
        list.push({ date: dateutil.fromParts(year, override.month, override.day), name: name });
      } else {
        list.push({ date: dateutil.fromParts(year, month, day), name: name });
      }
    }

    function pushMonday(name, month, nth) {
      var override = moved[name];
      if (override) {
        list.push({ date: dateutil.fromParts(year, override.month, override.day), name: name });
        return;
      }
      list.push({ date: dateutil.nthWeekdayOfMonth(year, month, 1, nth), name: name });
    }

    push('元日', 1, 1);
    pushMonday('成人の日', 1, 2);
    push('建国記念の日', 2, 11);
    if (year >= 2020) push('天皇誕生日', 2, 23);
    push('春分の日', 3, vernalEquinoxDay(year));
    push('昭和の日', 4, 29);
    push('憲法記念日', 5, 3);
    push('みどりの日', 5, 4);
    push('こどもの日', 5, 5);
    pushMonday('海の日', 7, 3);
    push('山の日', 8, 11);
    pushMonday('敬老の日', 9, 3);
    push('秋分の日', 9, autumnalEquinoxDay(year));
    pushMonday(year >= 2020 ? 'スポーツの日' : '体育の日', 10, 2);
    push('文化の日', 11, 3);
    push('勤労感謝の日', 11, 23);
    if (year <= 2018) push('天皇誕生日', 12, 23);

    (special.extra || []).forEach(function (item) {
      list.push({ date: dateutil.fromParts(year, item.month, item.day), name: item.name });
    });

    list.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    return list;
  }

  /**
   * その年の全休日（祝日 + 振替休日 + 国民の休日）。
   *
   * 前提: 年境界（12/31 ↔ 1/1）をまたぐ振替休日・国民の休日は発生しない。
   * 現行法では 12/30・12/31 に祝日がなく、元日の前日も祝日ではないため、
   * 前後年を参照しなくても結果は変わらない。この前提は
   * tests/holidays.test.js の「年境界をまたぐ休日が発生しないこと」で検査している
   * （法改正で前提が崩れたらそのテストが落ちる）。
   *
   * @returns {Map<string, {date: string, name: string, kind: string, note: string}>}
   */
  function holidaysOfYear(year) {
    assertYear(year);
    var statutory = statutoryHolidays(year);
    var statutorySet = new Set();
    var result = new Map();

    statutory.forEach(function (item) {
      statutorySet.add(item.date);
      result.set(item.date, {
        date: item.date,
        name: item.name,
        kind: KIND.HOLIDAY,
        note: '',
      });
    });

    // 第2段: 振替休日。「その日後においてその日に最も近い国民の祝日でない日」
    statutory.forEach(function (item) {
      if (dateutil.weekdayOf(item.date) !== 0) return;
      var cursor = dateutil.addDays(item.date, 1);
      while (statutorySet.has(cursor)) cursor = dateutil.addDays(cursor, 1);
      if (!result.has(cursor)) {
        result.set(cursor, {
          date: cursor,
          name: '振替休日',
          kind: KIND.SUBSTITUTE,
          note: item.name + '（' + dateutil.formatShortJa(item.date) + '）が日曜日のため',
        });
      }
    });

    // 第3段: 国民の休日。前日・翌日がともに祝日である日（日曜・祝日・振替休日を除く）
    statutory.forEach(function (item) {
      var candidate = dateutil.addDays(item.date, 1);
      if (statutorySet.has(candidate)) return;
      if (result.has(candidate)) return;
      if (dateutil.weekdayOf(candidate) === 0) return;
      var next = dateutil.addDays(candidate, 1);
      if (!statutorySet.has(next)) return;
      result.set(candidate, {
        date: candidate,
        name: '国民の休日',
        kind: KIND.CITIZENS,
        note: item.name + 'と' + result.get(next).name + 'に挟まれた平日のため',
      });
    });

    return sortedMap(result);
  }

  /**
   * 複数年をまとめた休日 Map。
   */
  function buildHolidayMap(startYear, endYear) {
    var from = Math.min(startYear, endYear);
    var to = Math.max(startYear, endYear);
    assertYear(from);
    assertYear(to);
    var merged = new Map();
    for (var year = from; year <= to; year += 1) {
      holidaysOfYear(year).forEach(function (value, key) {
        merged.set(key, value);
      });
    }
    return sortedMap(merged);
  }

  function sortedMap(map) {
    var keys = Array.from(map.keys()).sort();
    var out = new Map();
    keys.forEach(function (key) {
      out.set(key, map.get(key));
    });
    return out;
  }

  return {
    MIN_YEAR: MIN_YEAR,
    MAX_YEAR: MAX_YEAR,
    KIND: KIND,
    KIND_LABEL: KIND_LABEL,
    vernalEquinoxDay: vernalEquinoxDay,
    autumnalEquinoxDay: autumnalEquinoxDay,
    statutoryHolidays: statutoryHolidays,
    holidaysOfYear: holidaysOfYear,
    buildHolidayMap: buildHolidayMap,
  };
});
