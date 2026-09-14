/**
 * dateutil — YYYY-MM-DD 文字列を正とする日付演算。
 *
 * 実行環境のタイムゾーンに影響されないよう、内部表現は常に UTC 基準の
 * 「1970-01-01 からの日数」とする。`new Date('2026-09-14')`（UTC 解釈）と
 * `new Date(2026, 8, 14)`（ローカル解釈）の混在による 1 日ずれを避けるため、
 * アプリ側は Date オブジェクトを直接扱わない。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.Yasumi = global.Yasumi || {};
    global.Yasumi.dateutil = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MS_PER_DAY = 86400000;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  /** 曜日名（0 = 日曜） */
  var WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** うるう年判定 */
  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /** 指定年月の日数（month は 1–12） */
  function daysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
    return 31;
  }

  /**
   * 'YYYY-MM-DD' が形式として正しく、かつ実在する日付かどうか。
   * '2026-02-30' や '2026-1-1' は false。
   */
  function isValidDate(value) {
    if (typeof value !== 'string') return false;
    var m = DATE_RE.exec(value);
    if (!m) return false;
    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > daysInMonth(year, month)) return false;
    return true;
  }

  function assertDate(value, label) {
    if (!isValidDate(value)) {
      throw new Error((label || '日付') + 'の形式が正しくありません（YYYY-MM-DD）: ' + String(value));
    }
    return value;
  }

  /** 'YYYY-MM-DD' → { year, month, day } */
  function toParts(value) {
    assertDate(value);
    return {
      year: Number(value.slice(0, 4)),
      month: Number(value.slice(5, 7)),
      day: Number(value.slice(8, 10)),
    };
  }

  /** (year, month, day) → 'YYYY-MM-DD'（月・日の桁あふれは正規化しない） */
  function fromParts(year, month, day) {
    return String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day);
  }

  /** 'YYYY-MM-DD' → 1970-01-01 からの日数 */
  function toDayNumber(value) {
    var p = toParts(value);
    return Math.round(Date.UTC(p.year, p.month - 1, p.day) / MS_PER_DAY);
  }

  /** 1970-01-01 からの日数 → 'YYYY-MM-DD' */
  function fromDayNumber(dayNumber) {
    if (!Number.isInteger(dayNumber)) {
      throw new Error('日数は整数である必要があります: ' + String(dayNumber));
    }
    var d = new Date(dayNumber * MS_PER_DAY);
    return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  /** n 日後（負値で n 日前） */
  function addDays(value, n) {
    if (!Number.isInteger(n)) {
      throw new Error('加算日数は整数である必要があります: ' + String(n));
    }
    return fromDayNumber(toDayNumber(value) + n);
  }

  /** to − from の日数 */
  function diffDays(from, to) {
    return toDayNumber(to) - toDayNumber(from);
  }

  /**
   * n か月後（負値で n か月前）。
   * 月末があふれる場合はその月の末日に丸める（1/31 の1か月後は 2/28 または 2/29）。
   */
  function addMonths(value, n) {
    if (!Number.isInteger(n)) {
      throw new Error('加算月数は整数である必要があります: ' + String(n));
    }
    var p = toParts(value);
    var total = p.year * 12 + (p.month - 1) + n;
    var year = Math.floor(total / 12);
    var month = (total % 12) + 1;
    var day = Math.min(p.day, daysInMonth(year, month));
    return fromParts(year, month, day);
  }

  /** 曜日（0 = 日曜 … 6 = 土曜） */
  function weekdayOf(value) {
    // 1970-01-01 は木曜（4）
    var n = toDayNumber(value);
    return ((n % 7) + 7 + 4) % 7;
  }

  /** start から count 日分の日付配列 */
  function rangeDays(start, count) {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error('日数は 1 以上の整数である必要があります: ' + String(count));
    }
    var base = toDayNumber(start);
    var out = new Array(count);
    for (var i = 0; i < count; i += 1) out[i] = fromDayNumber(base + i);
    return out;
  }

  /**
   * 指定月の「第 nth ○曜日」。
   * @param {number} weekday 0 = 日曜
   * @param {number} nth 1 起点
   */
  function nthWeekdayOfMonth(year, month, weekday, nth) {
    var first = fromParts(year, month, 1);
    var firstWeekday = weekdayOf(first);
    var offset = (weekday - firstWeekday + 7) % 7;
    var day = 1 + offset + (nth - 1) * 7;
    if (day > daysInMonth(year, month)) {
      throw new Error(year + '年' + month + '月に第' + nth + WEEKDAY_JA[weekday] + '曜日は存在しません');
    }
    return fromParts(year, month, day);
  }

  /** 実行環境のタイムゾーンに関係なく、日本時間での「今日」 */
  function todayInJapan(nowMs) {
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    // JST は UTC+9 固定（日本に夏時間はない）
    var shifted = new Date(now + 9 * 3600000);
    return fromParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }

  /** '2026-09-14' → '2026年9月14日(月)' */
  function formatJa(value, options) {
    var opts = options || {};
    var p = toParts(value);
    var text = '';
    if (!opts.omitYear) text += p.year + '年';
    text += p.month + '月' + p.day + '日';
    if (!opts.omitWeekday) text += '(' + WEEKDAY_JA[weekdayOf(value)] + ')';
    return text;
  }

  /** '2026-09-14' → '9/14(月)' */
  function formatShortJa(value) {
    var p = toParts(value);
    return p.month + '/' + p.day + '(' + WEEKDAY_JA[weekdayOf(value)] + ')';
  }

  return {
    MS_PER_DAY: MS_PER_DAY,
    WEEKDAY_JA: WEEKDAY_JA,
    isLeapYear: isLeapYear,
    daysInMonth: daysInMonth,
    isValidDate: isValidDate,
    assertDate: assertDate,
    toParts: toParts,
    fromParts: fromParts,
    toDayNumber: toDayNumber,
    fromDayNumber: fromDayNumber,
    addDays: addDays,
    diffDays: diffDays,
    addMonths: addMonths,
    weekdayOf: weekdayOf,
    rangeDays: rangeDays,
    nthWeekdayOfMonth: nthWeekdayOfMonth,
    todayInJapan: todayInJapan,
    formatJa: formatJa,
    formatShortJa: formatShortJa,
  };
});
