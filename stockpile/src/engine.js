/*
 * そなえ帳 — 計算・検証エンジン（DOM に触れない純粋関数のみ）
 * ブラウザでは window.Sonae、Node では module.exports として使う。
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Sonae = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STORAGE_KEY = "sonae-cho:v1";
  var MAX_ITEMS = 500;
  var MAX_NAME = 40;
  var MAX_QTY = 99999;
  var MAX_PEOPLE = 20;
  var MAX_DAYS = 30;
  var SOON_DAYS = 30;
  var ROLLING_DAYS = 60;

  var HOUSEHOLD_FIELDS = [
    { key: "adults", label: "大人", min: 0, max: MAX_PEOPLE, def: 2 },
    { key: "children", label: "子ども（小学生〜）", min: 0, max: MAX_PEOPLE, def: 0 },
    { key: "infants", label: "乳児（ミルク・おむつ）", min: 0, max: MAX_PEOPLE, def: 0 },
    { key: "elders", label: "高齢者・持病のある人", min: 0, max: MAX_PEOPLE, def: 0 },
    { key: "dogs", label: "犬", min: 0, max: MAX_PEOPLE, def: 0 },
    { key: "cats", label: "猫", min: 0, max: MAX_PEOPLE, def: 0 },
    { key: "days", label: "備える日数", min: 1, max: MAX_DAYS, def: 7 }
  ];

  // 必要量の基準（目安）。count(h) は「人数×日数」などの量を返す。
  var REQUIREMENTS = [
    { id: "water", name: "飲料水", unit: "L", group: "水・食料",
      note: "1人1日3L（飲用＋調理用）",
      count: function (h) { return 3 * humans(h) * h.days; } },
    { id: "staple", name: "主食（ごはん・麺・パンなど）", unit: "食", group: "水・食料",
      note: "1人1日3食（乳児を除く）",
      count: function (h) { return 3 * eaters(h) * h.days; } },
    { id: "side", name: "おかず（缶詰・レトルトなど）", unit: "品", group: "水・食料",
      note: "1人1日3品（乳児を除く）",
      count: function (h) { return 3 * eaters(h) * h.days; } },
    { id: "gas", name: "カセットボンベ", unit: "本", group: "生活用品",
      note: "1人1週間あたり6本（乳児を除く）",
      count: function (h) { return Math.ceil((6 * eaters(h) * h.days) / 7); } },
    { id: "toilet", name: "簡易トイレ", unit: "回分", group: "生活用品",
      note: "1人1日5回分",
      count: function (h) { return 5 * humans(h) * h.days; } },
    { id: "milk", name: "乳児用ミルク（粉・液体）", unit: "回分", group: "乳児",
      note: "1人1日8回分（月齢で変わります）",
      count: function (h) { return 8 * h.infants * h.days; } },
    { id: "diaper", name: "おむつ", unit: "枚", group: "乳児",
      note: "1人1日8枚（月齢で変わります）",
      count: function (h) { return 8 * h.infants * h.days; } },
    { id: "medicine", name: "常備薬", unit: "日分", group: "高齢者・持病",
      note: "高齢者・持病のある人1人あたり、備える日数分（最低7日）。お薬手帳の控えも",
      count: function (h) { return h.elders * Math.max(h.days, 7); } },
    { id: "petfood", name: "ペットフード", unit: "日分", group: "ペット",
      note: "1匹あたり備える日数分（最低5日）",
      count: function (h) { return (h.dogs + h.cats) * Math.max(h.days, 5); } },
    { id: "petwater", name: "ペットの水", unit: "L", group: "ペット",
      note: "犬1匹1日1L・猫1匹1日0.2L（最低5日）",
      count: function (h) { return round1((h.dogs * 1 + h.cats * 0.2) * Math.max(h.days, 5)); } },
    { id: "light", name: "懐中電灯・ランタン", unit: "個", group: "備品",
      note: "乳児を除く人数分",
      count: function (h) { return humans(h) > 0 ? Math.max(1, h.adults + h.children + h.elders) : 0; } },
    { id: "radio", name: "携帯ラジオ", unit: "台", group: "備品",
      note: "世帯に1台",
      count: function (h) { return humans(h) > 0 ? 1 : 0; } },
    { id: "battery", name: "モバイルバッテリー・乾電池", unit: "式", group: "備品",
      note: "世帯に1式",
      count: function (h) { return humans(h) > 0 ? 1 : 0; } },
    { id: "firstaid", name: "救急セット", unit: "式", group: "備品",
      note: "世帯に1式",
      count: function (h) { return humans(h) > 0 ? 1 : 0; } },
    { id: "bags", name: "ポリ袋（45L）", unit: "枚", group: "備品",
      note: "1人1日2枚（ごみ・給水・防寒に）",
      count: function (h) { return 2 * humans(h) * h.days; } }
  ];

  var REQ_BY_ID = Object.create(null);
  REQUIREMENTS.forEach(function (r) { REQ_BY_ID[r.id] = r; });
  function isReqId(id) { return typeof id === "string" && Object.prototype.hasOwnProperty.call(REQ_BY_ID, id); }
  // 全体の充足率に数えない分類（備品は揃えやすく、水・食料の不足を隠してしまうため）
  var COVERAGE_EXCLUDED_GROUP = "備品";

  function humans(h) { return h.adults + h.children + h.infants + h.elders; }
  function eaters(h) { return h.adults + h.children + h.elders; }
  function round1(n) { return Math.round(n * 10) / 10; }

  function defaultHousehold() {
    var h = {};
    HOUSEHOLD_FIELDS.forEach(function (f) { h[f.key] = f.def; });
    return h;
  }

  function defaultState() {
    return { version: 1, household: defaultHousehold(), items: [] };
  }

  function toInt(v, min, max, fallback) {
    var n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!isFinite(n)) return fallback;
    n = Math.floor(n);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  /** 家族構成を正規化する（範囲外は丸める。不正値は既定値）。 */
  function normalizeHousehold(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var h = {};
    HOUSEHOLD_FIELDS.forEach(function (f) {
      h[f.key] = toInt(src[f.key], f.min, f.max, f.def);
    });
    return h;
  }

  /** 家族構成から品目別の必要量を返す。必要量0の品目は含めない。 */
  function calcRequirements(household) {
    var h = normalizeHousehold(household);
    var out = [];
    REQUIREMENTS.forEach(function (r) {
      var required = r.count(h);
      if (required > 0) {
        out.push({ id: r.id, name: r.name, unit: r.unit, group: r.group, note: r.note, required: required });
      }
    });
    return out;
  }

  /** "YYYY-MM-DD" を検証し、実在する日付なら UTC のミリ秒を返す。不正なら null。 */
  function parseDate(str) {
    if (typeof str !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2200) return null;
    var t = Date.UTC(y, mo - 1, d);
    var dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return t;
  }

  /** Date（端末のローカル日付）を "YYYY-MM-DD" にする。 */
  function toDateString(date) {
    var y = date.getFullYear();
    var mo = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + d;
  }

  /** 期限までの暦日数。期限なし・不正は null。today は "YYYY-MM-DD"。 */
  function daysUntil(expiry, today) {
    var e = parseDate(expiry);
    var t = parseDate(today);
    if (e === null || t === null) return null;
    return Math.round((e - t) / 86400000);
  }

  function expiryStatus(days) {
    if (days === null || days === undefined) return "none";
    if (days < 0) return "expired";
    if (days <= SOON_DAYS) return "soon";
    if (days <= ROLLING_DAYS) return "rolling";
    return "ok";
  }

  function expiryLabel(days) {
    if (days === null || days === undefined) return "期限なし";
    if (days < 0) return "期限切れ（" + -days + "日前）";
    if (days === 0) return "今日まで";
    return "あと" + days + "日";
  }

  /**
   * 必要量と在庫を突き合わせる。期限切れの在庫は充足量に数えない。
   * @returns {{ rows, coverage, waterDays, alerts: { expired, soon, rolling } }}
   */
  function summarize(household, items, today) {
    var h = normalizeHousehold(household);
    var reqs = calcRequirements(h);
    var have = Object.create(null);
    var alerts = { expired: [], soon: [], rolling: [] };
    (Array.isArray(items) ? items : []).forEach(function (it) {
      var days = daysUntil(it.expiry, today);
      var status = expiryStatus(days);
      if (status !== "expired" && isReqId(it.reqId)) {
        have[it.reqId] = (have[it.reqId] || 0) + it.qty;
      }
      if (status === "expired" || status === "soon" || status === "rolling") {
        alerts[status].push({ id: it.id, name: it.name, qty: it.qty, reqId: it.reqId, expiry: it.expiry, days: days });
      }
    });
    Object.keys(alerts).forEach(function (k) {
      alerts[k].sort(function (a, b) { return a.days - b.days || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    });

    var ratioSum = 0;
    var counted = 0;
    var rows = reqs.map(function (r) {
      var amount = round1(have[r.id] || 0);
      var ratio = Math.min(1, amount / r.required);
      if (r.group !== COVERAGE_EXCLUDED_GROUP) { ratioSum += ratio; counted++; }
      return {
        id: r.id, name: r.name, unit: r.unit, group: r.group, note: r.note,
        required: r.required, have: amount, ratio: ratio,
        shortage: round1(Math.max(0, r.required - amount))
      };
    });
    var coverage = counted ? Math.round((ratioSum / counted) * 100) : 0;
    var people = humans(h);
    var waterDays = people > 0 ? Math.floor(((have.water || 0) / (3 * people)) * 10) / 10 : null;
    return { rows: rows, coverage: coverage, waterDays: waterDays, alerts: alerts };
  }

  /** 不足分の買い物リスト（テキスト）。不足がなければ空文字。 */
  function shoppingList(summary) {
    var lines = summary.rows
      .filter(function (r) { return r.shortage > 0; })
      .map(function (r) { return "・" + r.name + " あと" + formatNumber(r.shortage) + r.unit; });
    if (!lines.length) return "";
    return ["【そなえ帳 買い物リスト】"].concat(lines).join("\n");
  }

  function formatNumber(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  // 制御文字・ゼロ幅文字・双方向制御文字を取り除き、前後の空白を削る。
  function cleanText(s, max) {
    if (typeof s !== "string") return "";
    var cleaned = s.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, "").trim();
    return Array.from(cleaned).slice(0, max).join("");
  }

  var idCounter = 0;
  function newId() {
    idCounter = (idCounter + 1) % 1e6;
    return "i-" + Date.now().toString(36) + "-" + idCounter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** 在庫1件を検証する。成功なら { ok: true, item }、失敗なら { ok: false, error }。 */
  function sanitizeItem(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "在庫の形式が正しくありません" };
    var reqId = isReqId(raw.reqId) || raw.reqId === "other" ? raw.reqId : null;
    if (!reqId) return { ok: false, error: "品目の種類が不明です" };
    var name = cleanText(raw.name, MAX_NAME) || (isReqId(reqId) ? REQ_BY_ID[reqId].name : "");
    if (!name) return { ok: false, error: "品名を入力してください" };
    var qty = typeof raw.qty === "number" ? raw.qty : typeof raw.qty === "string" && raw.qty.trim() !== "" ? Number(raw.qty) : NaN;
    if (!isFinite(qty) || qty <= 0) return { ok: false, error: "数量は0より大きい数で入力してください" };
    if (qty > MAX_QTY) return { ok: false, error: "数量は" + MAX_QTY + "以下で入力してください" };
    qty = round1(qty);
    if (qty <= 0) return { ok: false, error: "数量は0より大きい数で入力してください" };
    var expiry = raw.expiry === undefined || raw.expiry === null || raw.expiry === "" ? "" : raw.expiry;
    if (expiry !== "" && parseDate(expiry) === null) return { ok: false, error: "期限の日付が正しくありません" };
    var id = typeof raw.id === "string" && /^i-[A-Za-z0-9_-]{1,38}$/.test(raw.id) ? raw.id : newId();
    return { ok: true, item: { id: id, reqId: reqId, name: name, qty: qty, expiry: expiry } };
  }

  /**
   * 保存データ・読み込みデータを検証する。知らない項目は捨てる。
   * 不正な在庫は取り込まず、errors に理由を積む。
   */
  function sanitizeState(raw) {
    var errors = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, state: defaultState(), errors: ["そなえ帳のデータではありません"] };
    }
    if (raw.version !== 1) {
      return { ok: false, state: defaultState(), errors: ["対応していないデータの版です"] };
    }
    var household = normalizeHousehold(raw.household);
    var items = [];
    if (raw.items !== undefined && !Array.isArray(raw.items)) {
      return { ok: false, state: defaultState(), errors: ["在庫の一覧が正しくありません"] };
    }
    var list = Array.isArray(raw.items) ? raw.items : [];
    if (list.length > MAX_ITEMS) {
      return { ok: false, state: defaultState(), errors: ["在庫が多すぎます（" + MAX_ITEMS + "件まで）"] };
    }
    var seen = Object.create(null);
    list.forEach(function (rawItem, i) {
      var r = sanitizeItem(rawItem);
      if (!r.ok) { errors.push((i + 1) + "件目: " + r.error); return; }
      if (seen[r.item.id]) r.item.id = newId();
      seen[r.item.id] = true;
      items.push(r.item);
    });
    if (list.length > 0 && items.length === 0) {
      return { ok: false, state: defaultState(), errors: ["取り込める在庫が1件もありません"].concat(errors.slice(0, 5)) };
    }
    return { ok: true, state: { version: 1, household: household, items: items }, errors: errors };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    MAX_ITEMS: MAX_ITEMS,
    MAX_NAME: MAX_NAME,
    MAX_QTY: MAX_QTY,
    SOON_DAYS: SOON_DAYS,
    ROLLING_DAYS: ROLLING_DAYS,
    HOUSEHOLD_FIELDS: HOUSEHOLD_FIELDS,
    REQUIREMENTS: REQUIREMENTS,
    defaultState: defaultState,
    normalizeHousehold: normalizeHousehold,
    calcRequirements: calcRequirements,
    parseDate: parseDate,
    toDateString: toDateString,
    daysUntil: daysUntil,
    expiryStatus: expiryStatus,
    expiryLabel: expiryLabel,
    summarize: summarize,
    shoppingList: shoppingList,
    formatNumber: formatNumber,
    cleanText: cleanText,
    sanitizeItem: sanitizeItem,
    sanitizeState: sanitizeState
  };
});
