/**
 * calendar — 祝日・週休・会社独自の休業日を合成して「休日カレンダー」を作る。
 *
 * 優先順位（上が強い）
 *   1. 特別出勤日（ユーザー指定）… 祝日でも勤務日として扱う
 *   2. 祝日 / 振替休日 / 国民の休日
 *   3. 会社休業日（ユーザー指定）
 *   4. 週休曜日
 *   5. 勤務日
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dateutil.js'), require('./holidays.js'));
  } else {
    global.Yasumi = global.Yasumi || {};
    global.Yasumi.calendar = factory(global.Yasumi.dateutil, global.Yasumi.holidays);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (dateutil, holidays) {
  'use strict';

  /** 一度に扱える最大日数（DoS 対策および UI の現実的な上限） */
  var MAX_DAY_COUNT = 366;
  /** 日付リスト 1 本あたりの最大件数（DoS 対策） */
  var MAX_DATE_LIST = 500;

  var KIND = {
    HOLIDAY: holidays.KIND.HOLIDAY,
    SUBSTITUTE: holidays.KIND.SUBSTITUTE,
    CITIZENS: holidays.KIND.CITIZENS,
    WEEKLY: 'weekly',
    COMPANY: 'company',
    WORKDAY: 'workday',
  };

  var KIND_LABEL = {
    holiday: '祝日',
    substitute: '振替休日',
    citizens: '国民の休日',
    weekly: '週休',
    company: '会社休業日',
    workday: '勤務日',
  };

  /** 休日種別を表す記号（色だけに依存しないため） */
  var KIND_SYMBOL = {
    holiday: '祝',
    substitute: '振',
    citizens: '民',
    weekly: '休',
    company: '社',
    workday: '',
  };

  function normalizeWeeklyOffDays(input) {
    var source = input === undefined || input === null ? [0, 6] : input;
    if (!Array.isArray(source)) {
      throw new Error('週休曜日は配列で指定してください');
    }
    var set = new Set();
    source.forEach(function (value) {
      if (!Number.isInteger(value) || value < 0 || value > 6) {
        throw new Error('週休曜日は 0（日）〜6（土）の整数で指定してください: ' + String(value));
      }
      set.add(value);
    });
    return set;
  }

  function normalizeDateList(input, label) {
    if (input === undefined || input === null) return new Set();
    if (!Array.isArray(input)) {
      throw new Error(label + 'は配列で指定してください');
    }
    if (input.length > MAX_DATE_LIST) {
      throw new Error(label + 'は ' + MAX_DATE_LIST + ' 件までです（指定: ' + input.length + ' 件）');
    }
    var set = new Set();
    input.forEach(function (value) {
      var trimmed = typeof value === 'string' ? value.trim() : value;
      if (trimmed === '') return;
      dateutil.assertDate(trimmed, label);
      set.add(trimmed);
    });
    return set;
  }

  /**
   * 休日カレンダーを作る。
   *
   * @param {object} options
   * @param {string} options.startDate 開始日 'YYYY-MM-DD'
   * @param {number} options.dayCount 日数（1〜366）
   * @param {number[]} [options.weeklyOffDays=[0,6]] 週休曜日（0 = 日）
   * @param {string[]} [options.companyHolidays=[]] 会社休業日
   * @param {string[]} [options.workOverrides=[]] 特別出勤日
   * @returns {{days: Array, holidayMap: Map, startDate: string, endDate: string}}
   */
  function buildCalendar(options) {
    var opts = options || {};
    var startDate = dateutil.assertDate(opts.startDate, '開始日');
    var dayCount = opts.dayCount;
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > MAX_DAY_COUNT) {
      throw new Error('日数は 1〜' + MAX_DAY_COUNT + ' の整数で指定してください: ' + String(dayCount));
    }

    var weeklyOff = normalizeWeeklyOffDays(opts.weeklyOffDays);
    var companyHolidays = normalizeDateList(opts.companyHolidays, '会社休業日');
    var workOverrides = normalizeDateList(opts.workOverrides, '特別出勤日');

    var dates = dateutil.rangeDays(startDate, dayCount);
    var endDate = dates[dates.length - 1];
    // 前後 1 年分を含めて計算する（期間端の連休判定で前後の祝日を参照するため）
    var holidayMap = holidays.buildHolidayMap(
      clampYear(dateutil.toParts(startDate).year),
      clampYear(dateutil.toParts(endDate).year)
    );

    var days = dates.map(function (date, index) {
      var weekday = dateutil.weekdayOf(date);
      var holiday = holidayMap.get(date);

      var kind;
      var label;
      var note = '';

      if (workOverrides.has(date)) {
        kind = KIND.WORKDAY;
        label = '特別出勤日';
        note = holiday ? holiday.name + 'だが出勤日として指定' : '出勤日として指定';
      } else if (holiday) {
        kind = holiday.kind;
        label = holiday.name;
        note = holiday.note;
      } else if (companyHolidays.has(date)) {
        kind = KIND.COMPANY;
        label = '会社休業日';
      } else if (weeklyOff.has(weekday)) {
        kind = KIND.WEEKLY;
        label = dateutil.WEEKDAY_JA[weekday] + '曜（週休）';
      } else {
        kind = KIND.WORKDAY;
        label = '勤務日';
      }

      return {
        index: index,
        date: date,
        weekday: weekday,
        off: kind !== KIND.WORKDAY,
        kind: kind,
        label: label,
        note: note,
        symbol: KIND_SYMBOL[kind],
      };
    });

    return {
      days: days,
      holidayMap: holidayMap,
      startDate: startDate,
      endDate: endDate,
    };
  }

  function clampYear(year) {
    return Math.min(Math.max(year, holidays.MIN_YEAR), holidays.MAX_YEAR);
  }

  /** 期間内の休日日数・勤務日数などの要約 */
  function summarize(days) {
    var counts = {};
    Object.keys(KIND_LABEL).forEach(function (key) {
      counts[key] = 0;
    });
    days.forEach(function (day) {
      counts[day.kind] += 1;
    });
    var offDays = days.filter(function (day) {
      return day.off;
    }).length;
    return {
      total: days.length,
      offDays: offDays,
      workDays: days.length - offDays,
      counts: counts,
    };
  }

  return {
    MAX_DAY_COUNT: MAX_DAY_COUNT,
    MAX_DATE_LIST: MAX_DATE_LIST,
    KIND: KIND,
    KIND_LABEL: KIND_LABEL,
    KIND_SYMBOL: KIND_SYMBOL,
    buildCalendar: buildCalendar,
    summarize: summarize,
  };
});
