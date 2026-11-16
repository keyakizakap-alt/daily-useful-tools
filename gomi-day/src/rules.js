/*
 * あしたのごみ — 規則の判定・共有・カレンダー書き出しのロジック。
 * DOM に依存しない。ブラウザでは window.GomiRules、Node では module.exports で使う。
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.GomiRules = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LIMITS = Object.freeze({
    rules: 30,
    breaks: 30,
    nameLength: 20,
    shareLength: 4000,
    icsDays: 400,
  });

  var WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
  var RULE_TYPES = ["weekly", "nth", "biweekly"];
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  // ---------- 日付 ----------

  /** "YYYY-MM-DD" をローカル日付の Date（正午）にする。不正なら null。 */
  function parseDate(str) {
    if (typeof str !== "string") return null;
    var m = DATE_RE.exec(str);
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var date = new Date(y, mo - 1, d, 12, 0, 0, 0);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function formatDate(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  /** 正午を基準に日をずらす（夏時間の切り替えでも日付がずれない）。 */
  function addDays(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, 12, 0, 0, 0);
    return d;
  }

  function toNoon(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  }

  /** その月の何回目のその曜日か（1〜5）。 */
  function nthOfMonth(date) {
    return Math.ceil(date.getDate() / 7);
  }

  /** 日付の通し番号（UTC基準の日数）。曜日・週の差の計算に使う。 */
  function dayNumber(date) {
    return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  }

  function weekStartNumber(date) {
    return dayNumber(date) - date.getDay();
  }

  function formatJapanese(date) {
    return (date.getMonth() + 1) + "月" + date.getDate() + "日（" + WEEKDAY_LABELS[date.getDay()] + "）";
  }

  // ---------- 判定 ----------

  function matchesRule(rule, date) {
    if (!rule || rule.weekdays.indexOf(date.getDay()) === -1) return false;
    if (rule.type === "weekly") return true;
    if (rule.type === "nth") return rule.nths.indexOf(nthOfMonth(date)) !== -1;
    if (rule.type === "biweekly") {
      var anchor = parseDate(rule.anchor);
      if (!anchor) return false;
      var diffWeeks = (weekStartNumber(date) - weekStartNumber(anchor)) / 7;
      return diffWeeks % 2 === 0;
    }
    return false;
  }

  function isOnBreak(config, date) {
    var key = formatDate(date);
    for (var i = 0; i < config.breaks.length; i++) {
      var b = config.breaks[i];
      if (b.from <= key && key <= b.to) return true;
    }
    return false;
  }

  /** その日に出すごみの名前一覧（重複なし、規則の登録順）。 */
  function itemsOn(config, date) {
    if (isOnBreak(config, date)) return [];
    var names = [];
    for (var i = 0; i < config.rules.length; i++) {
      var rule = config.rules[i];
      if (matchesRule(rule, date) && names.indexOf(rule.name) === -1) {
        names.push(rule.name);
      }
    }
    return names;
  }

  function upcoming(config, from, days) {
    var start = toNoon(from);
    var list = [];
    for (var i = 0; i < days; i++) {
      var d = addDays(start, i);
      list.push({ date: formatDate(d), label: formatJapanese(d), items: itemsOn(config, d), onBreak: isOnBreak(config, d) });
    }
    return list;
  }

  function joinWeekdays(weekdays) {
    return weekdays
      .slice()
      .sort(function (a, b) { return a - b; })
      .map(function (w) { return WEEKDAY_LABELS[w]; })
      .join("・");
  }

  function describeRule(rule) {
    var wd = joinWeekdays(rule.weekdays);
    if (rule.type === "weekly") return "毎週 " + wd + "曜";
    if (rule.type === "nth") {
      var nths = rule.nths
        .slice()
        .sort(function (a, b) { return a - b; })
        .map(function (n) { return "第" + n; })
        .join("・");
      return nths + " " + wd + "曜";
    }
    if (rule.type === "biweekly") {
      var anchor = parseDate(rule.anchor);
      return "隔週 " + wd + "曜（" + (anchor ? formatJapanese(anchor) : rule.anchor) + " の週から）";
    }
    return "";
  }

  // ---------- 検査 ----------

  function fail(message) {
    var err = new Error(message);
    err.name = "GomiConfigError";
    throw err;
  }

  /** 制御文字・前後の空白を除いた種類名。不正なら例外。 */
  function cleanName(value) {
    if (typeof value !== "string") fail("ごみの種類名が文字ではありません。");
    // eslint-disable-next-line no-control-regex
    var name = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "").trim();
    if (name.length === 0) fail("ごみの種類名を入力してください。");
    if (Array.from(name).length > LIMITS.nameLength) {
      fail("ごみの種類名は" + LIMITS.nameLength + "文字以内にしてください。");
    }
    return name;
  }

  function cleanIntList(value, min, max, label) {
    if (!Array.isArray(value) || value.length === 0) fail(label + "を1つ以上選んでください。");
    if (value.length > max - min + 1) fail(label + "の指定が多すぎます。");
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var n = value[i];
      if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
        fail(label + "の値が正しくありません。");
      }
      if (out.indexOf(n) === -1) out.push(n);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function cleanRule(raw, index) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("規則の形式が正しくありません。");
    if (RULE_TYPES.indexOf(raw.type) === -1) fail("収集のしかたが正しくありません。");
    var rule = {
      id: "r" + (index + 1),
      name: cleanName(raw.name),
      type: raw.type,
      weekdays: cleanIntList(raw.weekdays, 0, 6, "曜日"),
    };
    if (raw.type === "nth") rule.nths = cleanIntList(raw.nths, 1, 5, "第何週か");
    if (raw.type === "biweekly") {
      if (!parseDate(raw.anchor)) fail("隔週の基準日が正しくありません。");
      rule.anchor = raw.anchor;
    }
    return rule;
  }

  function cleanBreak(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("お休み期間の形式が正しくありません。");
    if (!parseDate(raw.from) || !parseDate(raw.to)) fail("お休み期間の日付が正しくありません。");
    if (raw.from > raw.to) fail("お休み期間の終了日は開始日以降にしてください。");
    return { from: raw.from, to: raw.to };
  }

  /**
   * 外部（localStorage・共有URL）から来た設定を検査し、許可した項目だけの新しいオブジェクトを返す。
   * 不正な場合は GomiConfigError を投げる。
   */
  function sanitizeConfig(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) fail("設定の形式が正しくありません。");
    if (obj.version !== 1) fail("対応していない設定の版です。");
    var rules = obj.rules === undefined ? [] : obj.rules;
    var breaks = obj.breaks === undefined ? [] : obj.breaks;
    if (!Array.isArray(rules) || !Array.isArray(breaks)) fail("設定の形式が正しくありません。");
    if (rules.length > LIMITS.rules) fail("規則は" + LIMITS.rules + "件までです。");
    if (breaks.length > LIMITS.breaks) fail("お休み期間は" + LIMITS.breaks + "件までです。");
    return {
      version: 1,
      rules: rules.map(cleanRule),
      breaks: breaks.map(cleanBreak),
    };
  }

  function emptyConfig() {
    return { version: 1, rules: [], breaks: [] };
  }

  // ---------- 共有 ----------

  function utf8ToBase64Url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToUtf8(str) {
    var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  /** 設定を共有URL用の文字列にする。規則の id は含めない。 */
  function encodeShare(config) {
    var clean = sanitizeConfig(config);
    var compact = {
      version: 1,
      rules: clean.rules.map(function (r) {
        var o = { name: r.name, type: r.type, weekdays: r.weekdays };
        if (r.nths) o.nths = r.nths;
        if (r.anchor) o.anchor = r.anchor;
        return o;
      }),
      breaks: clean.breaks,
    };
    var encoded = utf8ToBase64Url(JSON.stringify(compact));
    if (encoded.length > LIMITS.shareLength) fail("共有するには規則が多すぎます。");
    return encoded;
  }

  /** 共有URLの文字列を検査して設定に戻す。不正なら GomiConfigError を投げる。 */
  function decodeShare(str) {
    if (typeof str !== "string" || str.length === 0) fail("共有リンクの内容がありません。");
    if (str.length > LIMITS.shareLength) fail("共有リンクが長すぎます。");
    if (!/^[A-Za-z0-9_-]+$/.test(str)) fail("共有リンクの形式が正しくありません。");
    var parsed;
    try {
      parsed = JSON.parse(base64UrlToUtf8(str));
    } catch (e) {
      fail("共有リンクを読み取れませんでした。リンクが途中で切れていないか確認してください。");
    }
    return sanitizeConfig(parsed);
  }

  // ---------- カレンダー（.ics） ----------

  function escapeICS(text) {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  /** 1行を75オクテット以内で折り返す（UTF-8 の文字の途中では切らない）。 */
  function foldLine(line) {
    var encoder = new TextEncoder();
    var out = [];
    var current = "";
    var currentBytes = 0;
    var limit = 75;
    var chars = Array.from(line);
    for (var i = 0; i < chars.length; i++) {
      var size = encoder.encode(chars[i]).length;
      if (currentBytes + size > limit) {
        out.push(current);
        current = " ";
        currentBytes = 1;
        limit = 75;
      }
      current += chars[i];
      currentBytes += size;
    }
    out.push(current);
    return out.join("\r\n");
  }

  function icsDate(date) {
    return formatDate(date).replace(/-/g, "");
  }

  function icsStamp(now) {
    return (
      now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) + "T" +
      pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z"
    );
  }

  /**
   * 今日から days 日分の収集日を、終日予定の .ics 文字列にする。
   * options.alarm が true なら前夜20時（予定開始の4時間前）に通知する。
   */
  function toICS(config, from, days, options) {
    var opts = options || {};
    var clean = sanitizeConfig(config);
    var count = Math.max(0, Math.min(LIMITS.icsDays, Math.floor(days)));
    var now = opts.now instanceof Date ? opts.now : new Date();
    var stamp = icsStamp(now);
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//daily-useful-tools//gomi-day//JA",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + escapeICS("ごみ出しの日"),
    ];
    var start = toNoon(from);
    for (var i = 0; i < count; i++) {
      var d = addDays(start, i);
      var items = itemsOn(clean, d);
      for (var j = 0; j < items.length; j++) {
        var summary = items[j] + "の日";
        lines.push("BEGIN:VEVENT");
        lines.push("UID:" + icsDate(d) + "-" + (j + 1) + "@gomi-day.daily-useful-tools");
        lines.push("DTSTAMP:" + stamp);
        lines.push("DTSTART;VALUE=DATE:" + icsDate(d));
        lines.push("DTEND;VALUE=DATE:" + icsDate(addDays(d, 1)));
        lines.push("SUMMARY:" + escapeICS(summary));
        lines.push("TRANSP:TRANSPARENT");
        if (opts.alarm) {
          lines.push("BEGIN:VALARM");
          lines.push("ACTION:DISPLAY");
          lines.push("DESCRIPTION:" + escapeICS("あしたは" + summary + "です"));
          lines.push("TRIGGER:-PT4H");
          lines.push("END:VALARM");
        }
        lines.push("END:VEVENT");
      }
    }
    lines.push("END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  return {
    LIMITS: LIMITS,
    WEEKDAY_LABELS: WEEKDAY_LABELS,
    parseDate: parseDate,
    formatDate: formatDate,
    formatJapanese: formatJapanese,
    addDays: addDays,
    nthOfMonth: nthOfMonth,
    matchesRule: matchesRule,
    isOnBreak: isOnBreak,
    itemsOn: itemsOn,
    upcoming: upcoming,
    describeRule: describeRule,
    sanitizeConfig: sanitizeConfig,
    emptyConfig: emptyConfig,
    encodeShare: encodeShare,
    decodeShare: decodeShare,
    escapeICS: escapeICS,
    foldLine: foldLine,
    toICS: toICS,
  };
});
