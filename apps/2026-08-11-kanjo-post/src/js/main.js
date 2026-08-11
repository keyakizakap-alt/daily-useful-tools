/* ============================================================
   感情の郵便局 - main.js
   初期化・画面ルーティング・DOM描画のワイヤリング。
   ブラウザ専用(このファイルはNodeテストの対象外)。
   ============================================================ */
(function () {
  "use strict";

  var KP = window.KanjoPost;
  var STATUS = KP.Letters.STATUS;

  var TITLES = {
    home: "感情の郵便局",
    compose: "速達を出す",
    mailbox: "手紙一覧",
    detail: "手紙",
    dashboard: "傾向ダッシュボード",
    settings: "設定・バックアップ",
  };

  var STATUS_FILTERS = [
    { value: null, label: "すべて" },
    { value: STATUS.SEALED, label: "配達待ち" },
    { value: STATUS.DELIVERED, label: "未読" },
    { value: STATUS.OPENED, label: "既読" },
  ];

  function defaultMailboxFilters() {
    return { status: null, relation: null, emotion: null };
  }

  var state = {
    letters: [],
    settings: {},
    screen: null,
    currentOpts: {},
    navStack: [],
    composeStep: 1,
    compose: {
      eventText: "",
      relation: null,
      trueFeelingText: "",
      emotionTags: [],
      deliveryPreset: null,
      customDate: null,
    },
    mailboxFilters: defaultMailboxFilters(),
    currentDetailId: null,
    dashboardPeriod: "week",
  };

  var toastTimer = null;

  /* ---------------- ユーティリティ ---------------- */

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return formatDate(iso) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function showToast(message) {
    var el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-visible");
    }, 2600);
  }

  function persistLetters() {
    try {
      KP.Storage.saveLetters(state.letters);
    } catch (err) {
      showToast(err.message || "保存に失敗しました。");
    }
  }

  function persistSettings() {
    try {
      KP.Storage.saveSettings(state.settings);
    } catch (err) {
      showToast(err.message || "保存に失敗しました。");
    }
  }

  /* ---------------- 配達判定 ---------------- */

  function runDeliveryCheck() {
    // checkDelivery はsealed状態の手紙のみを対象にするため、一度deliveredへ
    // 更新された手紙(state.letters側)は次回以降の呼び出しで自然に対象外になる。
    // そのため「同じ手紙で二重に音を鳴らさないための」重複排除は別途不要。
    var result = KP.Letters.checkDelivery(state.letters, new Date());
    if (result.newlyDeliveredIds.length > 0) {
      state.letters = result.letters;
      persistLetters();
      if (state.settings.soundEnabled) {
        KP.Sound.playDeliveryChime();
      }
    }
    return result.newlyDeliveredIds;
  }

  /* ---------------- 画面ルーティング ---------------- */

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-active", el.dataset.screen === name);
    });
  }

  function navigate(screen, opts, options) {
    options = options || {};
    if (screen === "home") {
      state.navStack = [];
    } else if (!options.isBack && state.screen && state.screen !== screen) {
      state.navStack.push({ screen: state.screen, opts: state.currentOpts });
    }
    state.screen = screen;
    state.currentOpts = opts || {};
    showScreen(screen);
    document.getElementById("backBtn").hidden = screen === "home";
    document.getElementById("headerTitle").textContent =
      TITLES[screen] || "感情の郵便局";

    if (screen === "home") renderHome();
    else if (screen === "compose") {
      if (!options.isBack) resetCompose();
      else renderComposeStep();
    } else if (screen === "mailbox") renderMailbox();
    else if (screen === "detail") renderDetail(state.currentOpts.id);
    else if (screen === "dashboard") renderDashboard();
    else if (screen === "settings") renderSettings();

    window.scrollTo(0, 0);
    // 画面遷移のたびに見出しへフォーカスを移し、スクリーンリーダー/キーボード
    // ユーザーにも新しい画面に来たことが伝わるようにする。
    var titleEl = document.getElementById("headerTitle");
    if (titleEl && titleEl.focus) {
      titleEl.focus({ preventScroll: true });
    }
  }

  function goBack() {
    if (state.navStack.length === 0) {
      navigate("home");
      return;
    }
    var prev = state.navStack.pop();
    navigate(prev.screen, prev.opts, { isBack: true });
  }

  /* ---------------- ホーム ---------------- */

  function renderHome() {
    runDeliveryCheck();

    var sealedCount = state.letters.filter(function (l) {
      return l.status === STATUS.SEALED;
    }).length;
    var arrivedCount = state.letters.filter(function (l) {
      return l.status !== STATUS.SEALED;
    }).length;

    document.getElementById("homeSealedCount").textContent =
      "配達待ち " + sealedCount + "通";
    document.getElementById("homeDeliveredCount").textContent =
      "届いた手紙 " + arrivedCount + "通";

    var bannerEl = document.getElementById("deliveryBanner");
    var deliveredUnopened = state.letters.filter(function (l) {
      return l.status === STATUS.DELIVERED;
    }).length;
    bannerEl.innerHTML = "";
    if (deliveredUnopened > 0) {
      var banner = document.createElement("button");
      banner.type = "button";
      banner.className = "delivery-banner";
      banner.style.width = "100%";
      banner.style.textAlign = "left";
      banner.style.cursor = "pointer";
      var icon = document.createElement("span");
      icon.className = "delivery-banner__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "📬";
      var text = document.createElement("span");
      text.className = "delivery-banner__text";
      text.textContent =
        "あなた宛の手紙が " + deliveredUnopened + " 通、届いています。";
      banner.appendChild(icon);
      banner.appendChild(text);
      banner.addEventListener("click", function () {
        state.mailboxFilters = Object.assign(defaultMailboxFilters(), {
          status: STATUS.DELIVERED,
        });
        navigate("mailbox");
      });
      bannerEl.appendChild(banner);
    }
  }

  /* ---------------- 速達フォーム(compose) ---------------- */

  function buildChips(containerId, items, onClick) {
    var container = document.getElementById(containerId);
    container.innerHTML = "";
    items.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.value = item.id;
      btn.setAttribute("aria-pressed", "false");
      var check = document.createElement("span");
      check.className = "chip__check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓ ";
      btn.appendChild(check);
      btn.appendChild(document.createTextNode(item.label));
      btn.addEventListener("click", function () {
        onClick(item.id);
      });
      container.appendChild(btn);
    });
  }

  function updateChipSelection(containerId, isSelectedFn) {
    var selector = "#" + containerId + " .chip";
    document.querySelectorAll(selector).forEach(function (btn) {
      var selected = isSelectedFn(btn.dataset.value);
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function onRelationClick(id) {
    state.compose.relation = id;
    updateChipSelection("relationChips", function (v) {
      return v === id;
    });
  }

  function onEmotionClick(id) {
    var idx = state.compose.emotionTags.indexOf(id);
    if (idx === -1) state.compose.emotionTags.push(id);
    else state.compose.emotionTags.splice(idx, 1);
    updateChipSelection("emotionChips", function (v) {
      return state.compose.emotionTags.indexOf(v) !== -1;
    });
  }

  function onDeliveryClick(id) {
    state.compose.deliveryPreset = id;
    updateChipSelection("deliveryChips", function (v) {
      return v === id;
    });
    var dateInput = document.getElementById("customDateInput");
    var dateLabel = document.getElementById("customDateLabel");
    if (id === "custom") {
      dateInput.hidden = false;
      dateLabel.hidden = false;
    } else {
      dateInput.hidden = true;
      dateLabel.hidden = true;
      dateInput.value = "";
      state.compose.customDate = null;
    }
  }

  /**
   * カスタム配達日入力の下限(明日の日付、ローカルタイムのYYYY-MM-DD)を計算する。
   * 「時間差を置いて読み返す」というアプリの核を守るため、当日・過去日は選べないようにする。
   */
  function tomorrowDateString(now) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var mm = d.getMonth() + 1 < 10 ? "0" + (d.getMonth() + 1) : "" + (d.getMonth() + 1);
    var dd = d.getDate() < 10 ? "0" + d.getDate() : "" + d.getDate();
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function showComposeError(msg) {
    var el = document.getElementById("composeError");
    el.textContent = msg;
    el.hidden = false;
  }

  function hideComposeError() {
    var el = document.getElementById("composeError");
    el.hidden = true;
    el.textContent = "";
  }

  function resetCompose() {
    state.compose = {
      eventText: "",
      relation: null,
      trueFeelingText: "",
      emotionTags: [],
      deliveryPreset: null,
      customDate: null,
    };
    state.composeStep = 1;
    document.getElementById("eventText").value = "";
    document.getElementById("trueFeelingText").value = "";
    document.getElementById("eventTextCount").textContent = "0";
    document.getElementById("trueFeelingTextCount").textContent = "0";
    var dateInput = document.getElementById("customDateInput");
    dateInput.value = "";
    dateInput.hidden = true;
    dateInput.min = tomorrowDateString(new Date());
    document.getElementById("customDateLabel").hidden = true;
    updateChipSelection("relationChips", function () {
      return false;
    });
    updateChipSelection("emotionChips", function () {
      return false;
    });
    updateChipSelection("deliveryChips", function () {
      return false;
    });
    renderComposeStep();
  }

  function renderComposeStep() {
    document.querySelectorAll("[data-compose-step]").forEach(function (el) {
      el.hidden = Number(el.dataset.composeStep) !== state.composeStep;
    });
    document.querySelectorAll("[data-step-dot]").forEach(function (dot) {
      var n = Number(dot.dataset.stepDot);
      dot.classList.toggle("is-active", n === state.composeStep);
      dot.classList.toggle("is-done", n < state.composeStep);
    });
    document.getElementById("composeNextBtn").textContent =
      state.composeStep === 3 ? "✉️ 封をする" : "次へ";
    document.getElementById("composeBackStepBtn").hidden =
      state.composeStep === 1;
    hideComposeError();
  }

  function prefersReducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function playSealAnimation(callback) {
    var overlay = document.getElementById("sealOverlay");
    overlay.classList.add("is-active");
    var delay = prefersReducedMotion() ? 150 : 950;
    setTimeout(function () {
      overlay.classList.remove("is-active");
      callback();
    }, delay);
  }

  function handleComposeNext() {
    if (state.composeStep === 1) {
      if (!state.compose.eventText.trim()) {
        showComposeError("何があったかを書いてください。");
        return;
      }
      if (!state.compose.relation) {
        showComposeError("関係性を選択してください。");
        return;
      }
      state.composeStep = 2;
      renderComposeStep();
      return;
    }
    if (state.composeStep === 2) {
      if (!state.compose.trueFeelingText.trim()) {
        showComposeError("本当は何を言いたかったかを書いてください。");
        return;
      }
      state.composeStep = 3;
      renderComposeStep();
      return;
    }
    // step 3: 封をする
    try {
      var letter = KP.Letters.createLetter(state.compose, new Date());
      state.letters.push(letter);
      persistLetters();
      playSealAnimation(function () {
        navigate("home");
        showToast("手紙を封筒に入れました。届く日をお楽しみに。");
      });
    } catch (err) {
      showComposeError(err.message);
    }
  }

  /* ---------------- 手紙一覧(mailbox) ---------------- */

  function buildRelationFilters() {
    return [{ value: null, label: "すべて" }].concat(
      KP.Letters.RELATIONS.map(function (r) {
        return { value: r.id, label: r.label };
      })
    );
  }

  function buildEmotionFilters() {
    return [{ value: null, label: "すべて" }].concat(
      KP.Letters.EMOTIONS.map(function (e) {
        return { value: e.id, label: e.label };
      })
    );
  }

  function renderFilterRow(containerId, filters, currentValue, onSelect) {
    var row = document.getElementById(containerId);
    row.innerHTML = "";
    filters.forEach(function (f) {
      var btn = document.createElement("button");
      btn.type = "button";
      var selected = currentValue === f.value;
      btn.className = "filter-chip" + (selected ? " is-selected" : "");
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      btn.textContent = f.label;
      btn.addEventListener("click", function () {
        onSelect(f.value);
      });
      row.appendChild(btn);
    });
  }

  function buildEnvelopeCard(letter) {
    var btn = document.createElement("button");
    btn.type = "button";
    var statusClass =
      letter.status === STATUS.SEALED
        ? "envelope--sealed"
        : letter.status === STATUS.DELIVERED
        ? "envelope--delivered"
        : "envelope--opened";
    btn.className = "envelope " + statusClass;

    var top = document.createElement("div");
    top.className = "envelope__top";
    var stamp = document.createElement("span");
    stamp.className = "envelope__stamp";
    stamp.setAttribute("aria-hidden", "true");
    stamp.textContent =
      letter.status === STATUS.SEALED
        ? "✉️"
        : letter.status === STATUS.DELIVERED
        ? "📬"
        : "📖";
    var statusLabel = document.createElement("span");
    statusLabel.className = "envelope__status";
    statusLabel.textContent =
      letter.status === STATUS.SEALED
        ? "まだ届いていません"
        : letter.status === STATUS.DELIVERED
        ? "届いています"
        : "読みました";
    top.appendChild(stamp);
    top.appendChild(statusLabel);

    var meta = document.createElement("div");
    meta.className = "envelope__meta";
    meta.textContent =
      "送った日: " +
      formatDate(letter.createdAt) +
      (letter.status === STATUS.SEALED
        ? " ・ 届く日: " + formatDate(letter.deliverAt)
        : "");

    var tags = document.createElement("div");
    tags.className = "envelope__tags";
    var relTag = document.createElement("span");
    relTag.className = "tag tag--relation";
    relTag.textContent = KP.Letters.relationLabel(letter.relation);
    tags.appendChild(relTag);
    if (letter.status !== STATUS.SEALED) {
      (letter.emotionTags || []).forEach(function (id) {
        var t = document.createElement("span");
        t.className = "tag tag--emotion";
        t.textContent = KP.Letters.emotionLabel(id);
        tags.appendChild(t);
      });
    }

    btn.appendChild(top);
    btn.appendChild(meta);
    btn.appendChild(tags);

    btn.addEventListener("click", function () {
      if (letter.status === STATUS.SEALED) {
        showToast("まだ届いていません。届く日までそっとしておきましょう。");
        return;
      }
      navigate("detail", { id: letter.id });
    });
    return btn;
  }

  function renderMailboxList() {
    var listEl = document.getElementById("mailboxList");
    var filtered = KP.Letters.filterLetters(state.letters, {
      status: state.mailboxFilters.status || undefined,
      relation: state.mailboxFilters.relation || undefined,
      emotion: state.mailboxFilters.emotion || undefined,
    });
    var sorted = KP.Letters.sortByCreatedAtDesc(filtered);
    listEl.innerHTML = "";
    if (sorted.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent =
        "まだ手紙がありません。書きたくなったら、いつでもどうぞ。";
      listEl.appendChild(empty);
      return;
    }
    sorted.forEach(function (letter) {
      listEl.appendChild(buildEnvelopeCard(letter));
    });
  }

  function renderMailbox() {
    runDeliveryCheck();
    renderFilterRow(
      "statusFilterRow",
      STATUS_FILTERS,
      state.mailboxFilters.status,
      function (value) {
        state.mailboxFilters.status = value;
        renderMailbox();
      }
    );
    renderFilterRow(
      "relationFilterRow",
      buildRelationFilters(),
      state.mailboxFilters.relation,
      function (value) {
        state.mailboxFilters.relation = value;
        renderMailbox();
      }
    );
    renderFilterRow(
      "emotionFilterRow",
      buildEmotionFilters(),
      state.mailboxFilters.emotion,
      function (value) {
        state.mailboxFilters.emotion = value;
        renderMailbox();
      }
    );
    renderMailboxList();
  }

  /* ---------------- 手紙詳細/振り返り(detail) ---------------- */

  function textBlock(label, text) {
    var wrap = document.createElement("div");
    wrap.className = "card";
    var l = document.createElement("p");
    l.className = "section-title";
    l.textContent = label;
    var p = document.createElement("p");
    p.style.whiteSpace = "pre-wrap";
    p.style.marginTop = "8px";
    p.style.fontSize = "15px";
    p.style.lineHeight = "1.8";
    p.textContent = text;
    wrap.appendChild(l);
    wrap.appendChild(p);
    return wrap;
  }

  function buildReflectionItem(r) {
    var wrap = document.createElement("div");
    wrap.className = "reflection-item";
    var date = document.createElement("div");
    date.className = "reflection-item__date";
    date.textContent = formatDateTime(r.createdAt);
    wrap.appendChild(date);
    var rows = [
      ["今どう思うか", r.nowThink],
      ["実際どうなったか", r.whatHappened],
      ["次にどうしたいか", r.nextAction],
    ];
    rows.forEach(function (pair) {
      if (!pair[1]) return;
      var row = document.createElement("div");
      row.className = "reflection-item__row";
      var b = document.createElement("b");
      b.textContent = pair[0] + ":";
      row.appendChild(b);
      row.appendChild(document.createTextNode(pair[1]));
      wrap.appendChild(row);
    });
    return wrap;
  }

  function buildDeleteLetterButton(letterId) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ghost";
    btn.textContent = "この手紙を削除する";
    btn.addEventListener("click", function () {
      var proceed = window.confirm(
        "この手紙を削除します。元に戻すことはできません。よろしいですか?"
      );
      if (!proceed) return;
      state.letters = KP.Letters.removeLetter(state.letters, letterId);
      persistLetters();
      showToast("手紙を削除しました。");
      goBack();
    });
    return btn;
  }

  function renderDetail(letterId) {
    state.currentDetailId = letterId;
    var container = document.getElementById("detailContent");
    container.innerHTML = "";

    var letter = state.letters.filter(function (l) {
      return l.id === letterId;
    })[0];

    if (!letter) {
      var missing = document.createElement("p");
      missing.className = "empty-state";
      missing.textContent = "手紙が見つかりませんでした。";
      container.appendChild(missing);
      return;
    }

    if (letter.status === STATUS.SEALED) {
      var sealed = document.createElement("p");
      sealed.className = "empty-state";
      sealed.textContent = "この手紙はまだ届いていません。";
      container.appendChild(sealed);
      container.appendChild(buildDeleteLetterButton(letter.id));
      return;
    }

    if (letter.status === STATUS.DELIVERED) {
      var opened = KP.Letters.openLetter(letter, new Date());
      state.letters = KP.Letters.replaceLetter(state.letters, opened);
      persistLetters();
      letter = opened;
    }

    var tagsRow = document.createElement("div");
    tagsRow.className = "envelope__tags";
    var relTag = document.createElement("span");
    relTag.className = "tag tag--relation";
    relTag.textContent = KP.Letters.relationLabel(letter.relation);
    tagsRow.appendChild(relTag);
    letter.emotionTags.forEach(function (id) {
      var t = document.createElement("span");
      t.className = "tag tag--emotion";
      t.textContent = KP.Letters.emotionLabel(id);
      tagsRow.appendChild(t);
    });
    container.appendChild(tagsRow);

    var meta = document.createElement("p");
    meta.className = "hero-lead";
    meta.textContent =
      "書いた日: " +
      formatDate(letter.createdAt) +
      " ・ 届いた日: " +
      formatDate(letter.deliverAt);
    container.appendChild(meta);

    container.appendChild(textBlock("何があったか", letter.eventText));
    container.appendChild(
      textBlock("本当は言いたかったこと", letter.trueFeelingText)
    );

    if (letter.reflections && letter.reflections.length > 0) {
      var reflHeading = document.createElement("p");
      reflHeading.className = "section-title";
      reflHeading.textContent = "振り返りの記録";
      container.appendChild(reflHeading);
      var reflWrap = document.createElement("div");
      reflWrap.className = "stack";
      letter.reflections.forEach(function (r) {
        reflWrap.appendChild(buildReflectionItem(r));
      });
      container.appendChild(reflWrap);
    }

    var formCard = document.createElement("div");
    formCard.className = "card stack";
    var formTitle = document.createElement("p");
    formTitle.className = "section-title";
    formTitle.textContent = "追記を書く";
    formCard.appendChild(formTitle);

    var fields = [
      { key: "nowThink", label: "今どう思うか" },
      { key: "whatHappened", label: "実際どうなったか" },
      { key: "nextAction", label: "次にどうしたいか" },
    ];
    var inputs = {};
    fields.forEach(function (f) {
      var fieldId = "reflection-" + f.key;
      var label = document.createElement("label");
      label.className = "field-hint";
      label.textContent = f.label;
      label.setAttribute("for", fieldId);
      var textarea = document.createElement("textarea");
      textarea.id = fieldId;
      textarea.className = "text-input";
      textarea.rows = 4;
      textarea.style.minHeight = "auto";
      textarea.placeholder = "また今度で大丈夫です";
      formCard.appendChild(label);
      formCard.appendChild(textarea);
      inputs[f.key] = textarea;
    });

    var reflectError = document.createElement("p");
    reflectError.className = "field-hint";
    reflectError.setAttribute("role", "alert");
    reflectError.hidden = true;
    formCard.appendChild(reflectError);

    var submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "btn btn-secondary";
    submitBtn.textContent = "追記を残す";
    submitBtn.addEventListener("click", function () {
      var current = state.letters.filter(function (l) {
        return l.id === letterId;
      })[0];
      try {
        var updated = KP.Letters.addReflection(
          current,
          {
            nowThink: inputs.nowThink.value,
            whatHappened: inputs.whatHappened.value,
            nextAction: inputs.nextAction.value,
          },
          new Date()
        );
        state.letters = KP.Letters.replaceLetter(state.letters, updated);
        persistLetters();
        showToast("追記を残しました。");
        renderDetail(letterId);
      } catch (err) {
        reflectError.textContent = err.message;
        reflectError.hidden = false;
      }
    });
    formCard.appendChild(submitBtn);

    container.appendChild(formCard);
    container.appendChild(buildDeleteLetterButton(letter.id));
  }

  /* ---------------- 傾向ダッシュボード ---------------- */

  function renderBarList(containerId, items, extraFillClass) {
    var el = document.getElementById(containerId);
    el.innerHTML = "";
    var max = Math.max.apply(
      null,
      items.map(function (i) {
        return i.count;
      }).concat([1])
    );
    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "bar-row";
      var label = document.createElement("span");
      label.textContent = item.label;
      var track = document.createElement("div");
      track.className = "bar-track";
      var fill = document.createElement("div");
      fill.className = "bar-fill" + (extraFillClass ? " " + extraFillClass : "");
      fill.style.width = Math.round((item.count / max) * 100) + "%";
      track.appendChild(fill);
      var count = document.createElement("span");
      count.style.textAlign = "right";
      count.textContent = item.count + "通";
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(count);
      el.appendChild(row);
    });
  }

  function renderPeriodBars() {
    var data = KP.Dashboard.aggregateByPeriod(
      state.letters,
      state.dashboardPeriod
    );
    var el = document.getElementById("periodBars");
    el.innerHTML = "";
    if (data.length === 0) {
      var e = document.createElement("p");
      e.className = "empty-state";
      e.textContent = "まだ手紙がありません。";
      el.appendChild(e);
      return;
    }
    var max = Math.max.apply(
      null,
      data.map(function (d) {
        return d.count;
      }).concat([1])
    );
    data.forEach(function (d) {
      var row = document.createElement("div");
      row.className = "bar-row";
      var label = document.createElement("span");
      label.textContent = d.key;
      var track = document.createElement("div");
      track.className = "bar-track";
      var fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = Math.round((d.count / max) * 100) + "%";
      track.appendChild(fill);
      var count = document.createElement("span");
      count.textContent = d.count + "通";
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(count);
      el.appendChild(row);
    });
  }

  function updatePeriodToggleUI() {
    document.querySelectorAll("#periodToggle button").forEach(function (btn) {
      var selected = btn.dataset.period === state.dashboardPeriod;
      btn.classList.toggle("btn-primary", selected);
      btn.classList.toggle("btn-secondary", !selected);
    });
  }

  function renderDashboard() {
    var emo = KP.Dashboard.aggregateByEmotion(state.letters);
    var rel = KP.Dashboard.aggregateByRelation(state.letters);
    renderBarList("emotionBars", emo, null);
    renderBarList("relationBars", rel, "bar-fill--relation");
    renderPeriodBars();
    updatePeriodToggleUI();
  }

  /* ---------------- 設定・バックアップ ---------------- */

  function updateThemeSegmentedUI() {
    document.querySelectorAll("#themeSegmented button").forEach(function (btn) {
      var selected = btn.dataset.themeValue === state.settings.theme;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function updateSoundSwitchUI() {
    var sw = document.getElementById("soundSwitch");
    sw.classList.toggle("is-on", !!state.settings.soundEnabled);
    sw.setAttribute("aria-checked", state.settings.soundEnabled ? "true" : "false");
  }

  function renderSettings() {
    updateThemeSegmentedUI();
    updateSoundSwitchUI();
  }

  /* ---------------- 静的イベント配線(1度だけ) ---------------- */

  function wireStaticEvents() {
    document.getElementById("backBtn").addEventListener("click", function () {
      if (state.screen === "compose" && state.composeStep > 1) {
        state.composeStep -= 1;
        renderComposeStep();
        return;
      }
      goBack();
    });

    document.querySelectorAll("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.dataset.nav;
        if (target === "mailbox") {
          state.mailboxFilters = defaultMailboxFilters();
        }
        navigate(target);
      });
    });

    document
      .getElementById("homeSealedTile")
      .addEventListener("click", function () {
        state.mailboxFilters = Object.assign(defaultMailboxFilters(), {
          status: STATUS.SEALED,
        });
        navigate("mailbox");
      });
    document
      .getElementById("homeDeliveredTile")
      .addEventListener("click", function () {
        // 「届いた手紙」= 配達待ち以外(未読+既読)。sealedを除外した配列で絞り込む。
        state.mailboxFilters = Object.assign(defaultMailboxFilters(), {
          status: [STATUS.DELIVERED, STATUS.OPENED],
        });
        navigate("mailbox");
      });

    var eventTextEl = document.getElementById("eventText");
    eventTextEl.addEventListener("input", function () {
      state.compose.eventText = eventTextEl.value;
      document.getElementById("eventTextCount").textContent =
        eventTextEl.value.length;
    });

    var trueFeelingTextEl = document.getElementById("trueFeelingText");
    trueFeelingTextEl.addEventListener("input", function () {
      state.compose.trueFeelingText = trueFeelingTextEl.value;
      document.getElementById("trueFeelingTextCount").textContent =
        trueFeelingTextEl.value.length;
    });

    document
      .getElementById("customDateInput")
      .addEventListener("change", function (evt) {
        state.compose.customDate = evt.target.value;
      });

    document
      .getElementById("composeNextBtn")
      .addEventListener("click", handleComposeNext);
    document
      .getElementById("composeBackStepBtn")
      .addEventListener("click", function () {
        state.composeStep = Math.max(1, state.composeStep - 1);
        renderComposeStep();
      });

    document.querySelectorAll("#themeSegmented button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.settings.theme = btn.dataset.themeValue;
        persistSettings();
        KP.Theme.applyTheme(state.settings.theme);
        updateThemeSegmentedUI();
      });
    });

    document.getElementById("soundSwitch").addEventListener("click", function () {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      persistSettings();
      updateSoundSwitchUI();
    });

    document.querySelectorAll("#periodToggle button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.dashboardPeriod = btn.dataset.period;
        renderPeriodBars();
        updatePeriodToggleUI();
      });
    });

    document.getElementById("exportBtn").addEventListener("click", function () {
      var payload = KP.Backup.buildExportPayload(
        state.letters,
        state.settings,
        new Date()
      );
      var blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = KP.Backup.buildExportFilename(new Date());
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      showToast("バックアップを書き出しました。");
    });

    document
      .getElementById("importFileInput")
      .addEventListener("change", function (evt) {
        var file = evt.target.files && evt.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var parsed = KP.Backup.parseImportPayload(reader.result);
            var proceed = window.confirm(
              "現在のデータに読み込んだ内容を統合します。よろしいですか?(件数: " +
                parsed.letters.length +
                "件)"
            );
            if (!proceed) {
              evt.target.value = "";
              return;
            }
            var existingIds = {};
            state.letters.forEach(function (l) {
              existingIds[l.id] = true;
            });
            var updatedCount = parsed.letters.filter(function (l) {
              return existingIds[l.id];
            }).length;
            var addedCount = parsed.letters.length - updatedCount;
            state.letters = KP.Backup.mergeLetters(
              state.letters,
              parsed.letters
            );
            state.settings = Object.assign({}, state.settings, parsed.settings);
            persistLetters();
            persistSettings();
            KP.Theme.applyTheme(state.settings.theme);
            renderSettings();
            showToast(
              "読み込みました。(追加 " +
                addedCount +
                "件 / 上書き " +
                updatedCount +
                "件)"
            );
          } catch (err) {
            showToast(err.message || "読み込みに失敗しました。");
          }
          evt.target.value = "";
        };
        reader.onerror = function () {
          showToast("ファイルの読み込みに失敗しました。");
        };
        reader.readAsText(file);
      });
  }

  /* ---------------- 起動 ---------------- */

  function init() {
    state.letters = KP.Storage.loadLetters();
    state.settings = KP.Storage.loadSettings();
    KP.Theme.applyTheme(state.settings.theme);

    buildChips("relationChips", KP.Letters.RELATIONS, onRelationClick);
    buildChips("emotionChips", KP.Letters.EMOTIONS, onEmotionClick);
    buildChips("deliveryChips", KP.Letters.DELIVERY_PRESETS, onDeliveryClick);

    wireStaticEvents();

    navigate("home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
