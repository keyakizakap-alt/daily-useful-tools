/* ============================================================
   感情の郵便局 - letters.js
   手紙データのCRUD・配達判定などの中核ロジック(純粋関数中心)
   ブラウザ <script> / Node require() の両方から読み込める。
   ============================================================ */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  } else {
    root.KanjoPost = root.KanjoPost || {};
    root.KanjoPost.Letters = mod;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var RELATIONS = [
    { id: "boss", label: "上司" },
    { id: "colleague", label: "同僚" },
    { id: "family", label: "家族" },
    { id: "friend", label: "友人" },
    { id: "partner", label: "パートナー" },
    { id: "other", label: "その他" },
  ];

  var EMOTIONS = [
    { id: "anger", label: "怒り" },
    { id: "sad", label: "悲しみ" },
    { id: "moya", label: "モヤモヤ" },
    { id: "anxiety", label: "不安" },
    { id: "regret", label: "後悔" },
    { id: "lonely", label: "寂しさ" },
  ];

  var DELIVERY_PRESETS = [
    { id: "3days", label: "3日後", days: 3 },
    { id: "1week", label: "1週間後", days: 7 },
    { id: "1month", label: "1か月後", days: 30 },
    { id: "custom", label: "日付を指定する", days: null },
  ];

  var STATUS = {
    SEALED: "sealed",
    DELIVERED: "delivered",
    OPENED: "opened",
  };

  function relationLabel(id) {
    var found = RELATIONS.filter(function (r) {
      return r.id === id;
    })[0];
    return found ? found.label : "その他";
  }

  function emotionLabel(id) {
    var found = EMOTIONS.filter(function (e) {
      return e.id === id;
    })[0];
    return found ? found.label : id;
  }

  function isValidRelation(id) {
    return RELATIONS.some(function (r) {
      return r.id === id;
    });
  }

  function isValidEmotion(id) {
    return EMOTIONS.some(function (e) {
      return e.id === id;
    });
  }

  function generateId(prefix) {
    var rand =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            function (c) {
              var r = (Math.random() * 16) | 0;
              var v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            }
          );
    return prefix + "-" + rand;
  }

  /**
   * 配達日時のプリセットから実際の日時(ISO文字列)を計算する。
   * @param {string} presetId - DELIVERY_PRESETS のid
   * @param {Date} now - 基準日時
   * @param {string} [customDateStr] - presetId === 'custom' の場合の日付文字列(YYYY-MM-DD)
   * @returns {Date}
   * @throws customの場合、日付未指定・形式不正・今日以前の日付の場合に例外を投げる
   *   (時間差を置いて読み返すというアプリの核となる体験を守るため、当日・過去日は許可しない)。
   */
  function computeDeliverAt(presetId, now, customDateStr) {
    if (presetId === "custom") {
      if (!customDateStr) {
        throw new Error("配達日を選択してください。");
      }
      var custom = new Date(customDateStr + "T00:00:00");
      if (isNaN(custom.getTime())) {
        throw new Error("配達日の形式が正しくありません。");
      }
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (custom.getTime() <= today.getTime()) {
        throw new Error("配達日は明日以降の日付を選択してください。");
      }
      return custom;
    }
    var preset = DELIVERY_PRESETS.filter(function (p) {
      return p.id === presetId;
    })[0];
    if (!preset || preset.days == null) {
      throw new Error("配達タイミングを選択してください。");
    }
    var result = new Date(now.getTime());
    result.setDate(result.getDate() + preset.days);
    return result;
  }

  /**
   * 速達フォームの入力値から手紙オブジェクトを新規作成する。
   */
  function createLetter(input, now) {
    now = now || new Date();
    var errors = validateComposeInput(input);
    if (errors.length > 0) {
      var err = new Error(errors.join(" / "));
      err.fieldErrors = errors;
      throw err;
    }
    var deliverAt = computeDeliverAt(
      input.deliveryPreset,
      now,
      input.customDate
    );
    return {
      id: generateId("letter"),
      createdAt: now.toISOString(),
      deliverAt: deliverAt.toISOString(),
      relation: input.relation,
      emotionTags: input.emotionTags.slice(),
      eventText: input.eventText.trim(),
      trueFeelingText: input.trueFeelingText.trim(),
      status: STATUS.SEALED,
      openedAt: null,
      reflections: [],
    };
  }

  /**
   * 速達フォーム入力のバリデーション。エラーメッセージ配列を返す(空なら正常)。
   */
  function validateComposeInput(input) {
    var errors = [];
    input = input || {};
    if (!input.eventText || !input.eventText.trim()) {
      errors.push("何があったかを書いてください。");
    }
    if (!input.relation || !isValidRelation(input.relation)) {
      errors.push("関係性を選択してください。");
    }
    if (!input.trueFeelingText || !input.trueFeelingText.trim()) {
      errors.push("本当は何を言いたかったかを書いてください。");
    }
    if (
      !input.emotionTags ||
      !Array.isArray(input.emotionTags) ||
      input.emotionTags.length === 0
    ) {
      errors.push("今の感情を1つ以上選んでください。");
    } else if (!input.emotionTags.every(isValidEmotion)) {
      errors.push("感情タグの指定が正しくありません。");
    }
    if (!input.deliveryPreset) {
      errors.push("配達タイミングを選択してください。");
    } else if (input.deliveryPreset === "custom" && !input.customDate) {
      errors.push("配達日を指定してください。");
    }
    return errors;
  }

  /**
   * 全手紙に対し、配達予定日時が現在時刻以前になったものを
   * sealed -> delivered に更新する。既存配列は変更せず新しい配列を返す。
   * @returns {{letters: Array, newlyDeliveredIds: string[]}}
   */
  function checkDelivery(letters, now) {
    now = now || new Date();
    var nowTime = now.getTime();
    var newlyDeliveredIds = [];
    var updated = (letters || []).map(function (letter) {
      if (letter.status !== STATUS.SEALED) return letter;
      var deliverTime = new Date(letter.deliverAt).getTime();
      if (isNaN(deliverTime) || deliverTime > nowTime) return letter;
      newlyDeliveredIds.push(letter.id);
      return Object.assign({}, letter, { status: STATUS.DELIVERED });
    });
    return { letters: updated, newlyDeliveredIds: newlyDeliveredIds };
  }

  /**
   * 手紙を開封済みにする(初回のみopenedAtを記録)。
   */
  function openLetter(letter, now) {
    now = now || new Date();
    if (letter.status === STATUS.SEALED) {
      throw new Error("まだ配達されていない手紙は開封できません。");
    }
    if (letter.status === STATUS.OPENED) {
      return letter;
    }
    return Object.assign({}, letter, {
      status: STATUS.OPENED,
      openedAt: now.toISOString(),
    });
  }

  /**
   * 振り返り追記を1件追加した新しい手紙オブジェクトを返す。
   */
  function addReflection(letter, reflectionInput, now) {
    now = now || new Date();
    var text = {
      nowThink: (reflectionInput.nowThink || "").trim(),
      whatHappened: (reflectionInput.whatHappened || "").trim(),
      nextAction: (reflectionInput.nextAction || "").trim(),
    };
    if (!text.nowThink && !text.whatHappened && !text.nextAction) {
      throw new Error("振り返りの内容を何か1つ以上書いてください。");
    }
    var reflection = Object.assign(
      { id: generateId("reflection"), createdAt: now.toISOString() },
      text
    );
    var reflections = (letter.reflections || []).concat([reflection]);
    return Object.assign({}, letter, { reflections: reflections });
  }

  function replaceLetter(letters, updatedLetter) {
    return (letters || []).map(function (letter) {
      return letter.id === updatedLetter.id ? updatedLetter : letter;
    });
  }

  function removeLetter(letters, letterId) {
    return (letters || []).filter(function (letter) {
      return letter.id !== letterId;
    });
  }

  /**
   * 手紙を条件で絞り込む。
   * @param {Object} filters
   * @param {string|string[]} [filters.status] - 単一のステータス、またはいずれかに一致するステータスの配列
   * @param {string} [filters.relation]
   * @param {string} [filters.emotion]
   */
  function filterLetters(letters, filters) {
    filters = filters || {};
    return (letters || []).filter(function (letter) {
      if (filters.status != null) {
        if (Array.isArray(filters.status)) {
          if (filters.status.indexOf(letter.status) === -1) return false;
        } else if (letter.status !== filters.status) {
          return false;
        }
      }
      if (filters.relation != null && letter.relation !== filters.relation)
        return false;
      if (
        filters.emotion != null &&
        (letter.emotionTags || []).indexOf(filters.emotion) === -1
      )
        return false;
      return true;
    });
  }

  function sortByCreatedAtDesc(letters) {
    return (letters || [])
      .slice()
      .sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }

  return {
    RELATIONS: RELATIONS,
    EMOTIONS: EMOTIONS,
    DELIVERY_PRESETS: DELIVERY_PRESETS,
    STATUS: STATUS,
    relationLabel: relationLabel,
    emotionLabel: emotionLabel,
    isValidRelation: isValidRelation,
    isValidEmotion: isValidEmotion,
    generateId: generateId,
    computeDeliverAt: computeDeliverAt,
    createLetter: createLetter,
    validateComposeInput: validateComposeInput,
    checkDelivery: checkDelivery,
    openLetter: openLetter,
    addReflection: addReflection,
    replaceLetter: replaceLetter,
    removeLetter: removeLetter,
    filterLetters: filterLetters,
    sortByCreatedAtDesc: sortByCreatedAtDesc,
  };
});
