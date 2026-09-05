/*!
 * もしもしガード - コアロジック (core.js)
 *
 * 副作用のない純粋関数を中心に構成し、DOM操作から分離している。
 * Node.js からは `require("../src/core.js")` で、
 * ブラウザからは `<script src="core.js"></script>` で読み込める
 * UMD 風のエクスポート形式を採用する（import/export構文は使わない）。
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MoshimoshiCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------------
  // 1. 定数・静的データ
  // ---------------------------------------------------------------------

  var STORAGE_KEYS = {
    contacts: "moshimoshiGuard.contacts",
    sessions: "moshimoshiGuard.sessions",
    currentSession: "moshimoshiGuard.currentSession",
  };

  var CATEGORY_LABELS = {
    money: "金銭要求",
    personalInfo: "個人情報・カード要求",
    urgency: "緊急性を煽る",
    impersonation: "なりすまし",
    refund: "還付金・当選",
  };

  var CATEGORY_ORDER = [
    "money",
    "personalInfo",
    "urgency",
    "impersonation",
    "refund",
  ];

  var LEVEL_LABELS = {
    low: "低（安全）",
    mid: "中（注意）",
    high: "高（危険）",
  };

  // 要注意フレーズ定義（17件）
  var PHRASES = [
    {
      id: "atm_visit",
      category: "money",
      text: "ATM・コンビニのATMに行くように言われた",
      weight: 5,
      critical: true,
    },
    {
      id: "prepaid_card",
      category: "money",
      text: "コンビニでプリペイドカード・電子マネーを買うように言われた",
      weight: 5,
      critical: true,
    },
    {
      id: "cash_pickup",
      category: "money",
      text: "現金を自宅まで取りに行く、または宅配便で送るように言われた",
      weight: 5,
      critical: true,
    },
    {
      id: "bank_transfer",
      category: "money",
      text: "指定された口座にお金を振り込むように言われた",
      weight: 4,
      critical: false,
    },
    {
      id: "card_pin",
      category: "personalInfo",
      text: "キャッシュカードの暗証番号を聞かれた",
      weight: 5,
      critical: true,
    },
    {
      id: "card_handover",
      category: "personalInfo",
      text: "キャッシュカードや通帳を渡す・預けるように言われた",
      weight: 5,
      critical: true,
    },
    {
      id: "mynumber",
      category: "personalInfo",
      text: "マイナンバーや保険証番号を聞かれた",
      weight: 3,
      critical: false,
    },
    {
      id: "urgency_now",
      category: "urgency",
      text: "「今すぐ」「今日中に」などと急がされた",
      weight: 3,
      critical: false,
    },
    {
      id: "urgency_secret",
      category: "urgency",
      text: "「誰にも言わないで」「家族には内緒で」と言われた",
      weight: 4,
      critical: false,
    },
    {
      id: "urgency_rush",
      category: "urgency",
      text: "「もう時間がない」などと焦らされた",
      weight: 3,
      critical: false,
    },
    {
      id: "number_changed",
      category: "impersonation",
      text: "電話番号（携帯・自宅）が変わったと言われた",
      weight: 3,
      critical: false,
    },
    {
      id: "relative_noname",
      category: "impersonation",
      text: "息子・孫・親族を名乗るが、こちらから名前を聞くまで名乗らない",
      weight: 3,
      critical: false,
    },
    {
      id: "official_claim",
      category: "impersonation",
      text: "警察官・銀行員・市役所職員などを名乗っている",
      weight: 2,
      critical: false,
    },
    {
      id: "callback_number",
      category: "impersonation",
      text: "一度電話を切って、指定された番号にかけ直すように言われた",
      weight: 3,
      critical: false,
    },
    {
      id: "tax_refund",
      category: "refund",
      text: "医療費や税金の還付金がある、手続きが必要と言われた",
      weight: 4,
      critical: false,
    },
    {
      id: "insurance_refund",
      category: "refund",
      text: "保険料や年金の払い戻しがあると言われた",
      weight: 4,
      critical: false,
    },
    {
      id: "lottery_win",
      category: "refund",
      text: "懸賞・宝くじ・保険などに当選したと言われた",
      weight: 3,
      critical: false,
    },
  ];

  // ---------------------------------------------------------------------
  // 2. フレーズ関連
  // ---------------------------------------------------------------------

  /** 全フレーズ定義のコピーを返す */
  function getAllPhrases() {
    return PHRASES.slice();
  }

  /** IDからフレーズ定義を1件取得する。見つからなければ null */
  function getPhraseById(id, phrases) {
    var list = phrases || PHRASES;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /** フレーズをカテゴリ別にグルーピングして返す（カテゴリの並び順は固定） */
  function getPhrasesByCategory(phrases) {
    var list = phrases || PHRASES;
    var grouped = {};
    CATEGORY_ORDER.forEach(function (cat) {
      grouped[cat] = [];
    });
    list.forEach(function (p) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    return grouped;
  }

  // ---------------------------------------------------------------------
  // 3. スコアリング・危険度判定
  // ---------------------------------------------------------------------

  /** 選択されたフレーズIDから合計スコアを算出する（未知のIDは無視） */
  function calcScore(selectedPhraseIds, phrases) {
    var list = phrases || PHRASES;
    var ids = selectedPhraseIds || [];
    var score = 0;
    ids.forEach(function (id) {
      var phrase = getPhraseById(id, list);
      if (phrase) score += phrase.weight;
    });
    return score;
  }

  /** 選択されたフレーズの中にcritical:trueのものが1件でもあればtrue */
  function hasCriticalPhrase(selectedPhraseIds, phrases) {
    var list = phrases || PHRASES;
    var ids = selectedPhraseIds || [];
    for (var i = 0; i < ids.length; i++) {
      var phrase = getPhraseById(ids[i], list);
      if (phrase && phrase.critical) return true;
    }
    return false;
  }

  /**
   * 危険度レベルを判定する。
   * 1. criticalフレーズが1件でも含まれる場合は無条件で "high"
   * 2. それ以外は合計スコアで判定 (score<5:low, 5<=score<10:mid, score>=10:high)
   */
  function calcLevel(selectedPhraseIds, phrases) {
    var list = phrases || PHRASES;
    if (hasCriticalPhrase(selectedPhraseIds, list)) return "high";
    var score = calcScore(selectedPhraseIds, list);
    if (score >= 10) return "high";
    if (score >= 5) return "mid";
    return "low";
  }

  /** 危険度レベルに応じた「次の行動」メッセージを返す */
  function nextActionMessage(level) {
    switch (level) {
      case "high":
        return "危険度が非常に高い通話です。今すぐ電話を切ってください。折り返さず、下の緊急連絡先へすぐ連絡しましょう。";
      case "mid":
        return "注意が必要です。「家族に確認してからかけ直します」と伝えて、一度電話を切りましょう。";
      case "low":
        return "今のところ大きな危険は見られません。引き続き注意しながら会話を続けましょう。";
      default:
        return "フレーズを選択すると、ここに次に取るべき行動が表示されます。";
    }
  }

  // ---------------------------------------------------------------------
  // 4. セッション（通話チェック記録）
  // ---------------------------------------------------------------------

  /** 新規セッションを生成する。id/startedAtは呼び出し側が生成して渡す */
  function createSession(params) {
    var p = params || {};
    return {
      id: p.id,
      startedAt: p.startedAt,
      finishedAt: null,
      callerName: "",
      callerPhone: "",
      requestContent: "",
      memo: "",
      selectedPhraseIds: [],
      score: 0,
      level: "low",
    };
  }

  /**
   * フレーズ選択をトグルし、スコア・レベルを再計算した新しいセッションを返す。
   * 元のsessionオブジェクトは変更しない。
   */
  function togglePhrase(session, phraseId, phrases) {
    var list = phrases || PHRASES;
    var current = (session && session.selectedPhraseIds) || [];
    var idx = current.indexOf(phraseId);
    var nextIds;
    if (idx === -1) {
      nextIds = current.concat([phraseId]);
    } else {
      nextIds = current.slice(0, idx).concat(current.slice(idx + 1));
    }
    var next = assign({}, session, {
      selectedPhraseIds: nextIds,
      score: calcScore(nextIds, list),
      level: calcLevel(nextIds, list),
    });
    return next;
  }

  /** メモ系フィールドを更新した新しいセッションを返す（スコア・レベルには影響しない） */
  function updateSessionField(session, field, value) {
    var patch = {};
    patch[field] = value;
    return assign({}, session, patch);
  }

  /** セッションを終了状態にする（finishedAtを設定） */
  function finishSession(session, params) {
    var p = params || {};
    return assign({}, session, { finishedAt: p.finishedAt });
  }

  // 進行中セッションをこの時間以上放置した場合は「別の通話」とみなし、
  // 復元せず新規セッションとして扱う（無関係な古い判定を引き継がないため）。
  var SESSION_STALE_MS = 30 * 60 * 1000; // 30分

  /**
   * 進行中セッションが放置され過ぎているか（＝別の通話とみなすべきか）を判定する。
   * startedAtが不正・欠落している場合も安全側に倒してtrue（stale）を返す。
   */
  function isSessionStale(session, nowTime) {
    if (!session || !session.startedAt) return true;
    var started = Date.parse(session.startedAt);
    if (isNaN(started)) return true;
    var now = typeof nowTime === "number" ? nowTime : Date.now();
    return now - started > SESSION_STALE_MS;
  }

  /** 履歴配列から指定IDのセッションを取り除いた新しい配列を返す */
  function removeSessionById(sessions, id) {
    var list = sessions || [];
    return list.filter(function (s) {
      return s.id !== id;
    });
  }

  /** startedAtの新しい順（降順）にソートした新しい配列を返す（元配列は変更しない） */
  function sortSessionsByDateDesc(sessions) {
    var list = (sessions || []).slice();
    list.sort(function (a, b) {
      var ta = Date.parse(a && a.startedAt) || 0;
      var tb = Date.parse(b && b.startedAt) || 0;
      return tb - ta;
    });
    return list;
  }

  // ---------------------------------------------------------------------
  // 5. 緊急連絡先
  // ---------------------------------------------------------------------

  /** 連絡先の簡易バリデーション（名前・電話番号必須） */
  function validateContact(contact) {
    var errors = [];
    var c = contact || {};
    var name = (c.name || "").trim();
    var phone = (c.phone || "").trim();
    if (!name) errors.push("名前を入力してください。");
    if (!phone) {
      errors.push("電話番号を入力してください。");
    } else if (!/^[0-9\-+() ]+$/.test(phone)) {
      errors.push("電話番号は数字・ハイフンなどで入力してください。");
    } else if (!/\d/.test(phone)) {
      errors.push("電話番号には数字を1文字以上含めてください。");
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * 全角数字・全角記号を半角に正規化する（IME入力ミスの救済用）。
   * 全角数字０-９→0-9、全角ハイフン類→-、全角スペース→半角スペース、
   * 全角プラス／丸括弧→半角に変換する。
   */
  function normalizePhoneInput(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/[０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .replace(/[－ー―─‐]/g, "-")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/[＋]/g, "+")
      .replace(/　/g, " ");
  }

  /** 複数の連絡先の中から最優先連絡先（isPrimary:true）を1件返す。なければnull */
  function pickPrimaryContact(contacts) {
    var list = contacts || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].isPrimary) return list[i];
    }
    return null;
  }

  /**
   * 指定IDの連絡先だけをisPrimary:trueにし、他はfalseにした新しい配列を返す。
   * 指定IDが存在しない場合はすべてfalseにした配列を返す。
   */
  function setPrimaryContact(contacts, contactId) {
    var list = contacts || [];
    return list.map(function (c) {
      return assign({}, c, { isPrimary: c.id === contactId });
    });
  }

  /**
   * 連絡先が1件以上あるのに誰もisPrimary:trueでない場合、
   * 先頭の連絡先を自動的に最優先へ昇格させた新しい配列を返す。
   * すでに最優先が存在する場合や連絡先が0件の場合は、配列のコピーをそのまま返す。
   */
  function ensurePrimaryContact(contacts) {
    var list = contacts || [];
    if (list.length === 0) return list.slice();
    var hasPrimary = list.some(function (c) {
      return c.isPrimary;
    });
    if (hasPrimary) return list.slice();
    return setPrimaryContact(list, list[0].id);
  }

  /** 指定IDの連絡先を取り除いた新しい配列を返す */
  function removeContactById(contacts, id) {
    var list = contacts || [];
    return list.filter(function (c) {
      return c.id !== id;
    });
  }

  // ---------------------------------------------------------------------
  // 6. フォーマットユーティリティ
  // ---------------------------------------------------------------------

  /** ISO8601文字列を「2026年8月9日 10:00」のような日本語表記に変換する。不正な値は "-" を返す */
  function formatDateTimeJa(isoString) {
    if (!isoString) return "-";
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return "-";
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    return y + "年" + m + "月" + day + "日 " + hh + ":" + mm;
  }

  /** 電話番号表示用の簡易整形（現状はトリムのみ。将来拡張用） */
  function formatPhone(phone) {
    if (typeof phone !== "string") return "";
    return phone.trim();
  }

  /** id生成用の簡易ヘルパー（非決定的。テスト対象外の補助関数） */
  function generateId(prefix) {
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || "id") + "_" + Date.now() + "_" + rand;
  }

  // ---------------------------------------------------------------------
  // 7. ストレージ（localStorage読み書き、DI可能）
  // ---------------------------------------------------------------------

  /** インメモリのフォールバックストア（localStorageが使えない環境向け） */
  function createMemoryStore() {
    var data = {};
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key)
          ? data[key]
          : null;
      },
      setItem: function (key, value) {
        data[key] = String(value);
      },
      removeItem: function (key) {
        delete data[key];
      },
    };
  }

  var fallbackMemoryStore = null;

  /** 実行環境に応じてデフォルトのストレージを返す（ブラウザ: localStorage、それ以外: インメモリ） */
  function getDefaultStore() {
    try {
      if (typeof localStorage !== "undefined" && localStorage) {
        return localStorage;
      }
    } catch (e) {
      // localStorageへのアクセスが禁止されている環境（プライベートモード等）
    }
    try {
      if (
        typeof window !== "undefined" &&
        window &&
        window.localStorage
      ) {
        return window.localStorage;
      }
    } catch (e) {
      // no-op
    }
    if (!fallbackMemoryStore) fallbackMemoryStore = createMemoryStore();
    return fallbackMemoryStore;
  }

  function loadJSON(store, key, defaultValue) {
    var s = store || getDefaultStore();
    try {
      var raw = s.getItem(key);
      if (raw === null || raw === undefined) return defaultValue;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? defaultValue : parsed;
    } catch (e) {
      return defaultValue;
    }
  }

  function saveJSON(store, key, value) {
    var s = store || getDefaultStore();
    try {
      s.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 保存に失敗しても例外でアプリを止めない（容量オーバー等）
    }
  }

  function loadContacts(store) {
    return loadJSON(store, STORAGE_KEYS.contacts, []);
  }

  function saveContacts(contacts, store) {
    saveJSON(store, STORAGE_KEYS.contacts, contacts || []);
  }

  function loadSessions(store) {
    return loadJSON(store, STORAGE_KEYS.sessions, []);
  }

  function saveSessions(sessions, store) {
    saveJSON(store, STORAGE_KEYS.sessions, sessions || []);
  }

  function loadCurrentSession(store) {
    return loadJSON(store, STORAGE_KEYS.currentSession, null);
  }

  function saveCurrentSession(session, store) {
    saveJSON(store, STORAGE_KEYS.currentSession, session || null);
  }

  function clearCurrentSession(store) {
    var s = store || getDefaultStore();
    try {
      if (typeof s.removeItem === "function") {
        s.removeItem(STORAGE_KEYS.currentSession);
      } else {
        s.setItem(STORAGE_KEYS.currentSession, JSON.stringify(null));
      }
    } catch (e) {
      // no-op
    }
  }

  // ---------------------------------------------------------------------
  // 8. 内部ユーティリティ
  // ---------------------------------------------------------------------

  /** Object.assign簡易実装（古い環境向けの保険。通常はネイティブが使われる） */
  function assign(target) {
    if (typeof Object.assign === "function") {
      return Object.assign.apply(Object, arguments);
    }
    var to = target || {};
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var key in src) {
        if (Object.prototype.hasOwnProperty.call(src, key)) {
          to[key] = src[key];
        }
      }
    }
    return to;
  }

  // ---------------------------------------------------------------------
  // 9. 公開API
  // ---------------------------------------------------------------------

  return {
    STORAGE_KEYS: STORAGE_KEYS,
    CATEGORY_LABELS: CATEGORY_LABELS,
    CATEGORY_ORDER: CATEGORY_ORDER,
    LEVEL_LABELS: LEVEL_LABELS,
    PHRASES: PHRASES,

    getAllPhrases: getAllPhrases,
    getPhraseById: getPhraseById,
    getPhrasesByCategory: getPhrasesByCategory,

    calcScore: calcScore,
    hasCriticalPhrase: hasCriticalPhrase,
    calcLevel: calcLevel,
    nextActionMessage: nextActionMessage,

    createSession: createSession,
    togglePhrase: togglePhrase,
    updateSessionField: updateSessionField,
    finishSession: finishSession,
    removeSessionById: removeSessionById,
    sortSessionsByDateDesc: sortSessionsByDateDesc,
    SESSION_STALE_MS: SESSION_STALE_MS,
    isSessionStale: isSessionStale,

    validateContact: validateContact,
    normalizePhoneInput: normalizePhoneInput,
    pickPrimaryContact: pickPrimaryContact,
    setPrimaryContact: setPrimaryContact,
    ensurePrimaryContact: ensurePrimaryContact,
    removeContactById: removeContactById,

    formatDateTimeJa: formatDateTimeJa,
    formatPhone: formatPhone,
    generateId: generateId,

    createMemoryStore: createMemoryStore,
    getDefaultStore: getDefaultStore,
    loadContacts: loadContacts,
    saveContacts: saveContacts,
    loadSessions: loadSessions,
    saveSessions: saveSessions,
    loadCurrentSession: loadCurrentSession,
    saveCurrentSession: saveCurrentSession,
    clearCurrentSession: clearCurrentSession,
  };
});
