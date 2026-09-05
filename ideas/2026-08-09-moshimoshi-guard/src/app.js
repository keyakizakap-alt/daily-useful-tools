/*!
 * もしもしガード - app.js
 * DOM操作・画面遷移・イベント処理を担当する。
 * ロジック（スコア計算・データ整形・ストレージ読み書き）はすべて core.js の
 * 純粋関数（window.MoshimoshiCore）を呼び出す。
 */
(function () {
  "use strict";

  var core = window.MoshimoshiCore;
  var store = core.getDefaultStore();

  var FONT_SCALE_KEY = "moshimoshiGuard.fontScale";
  var FONT_SCALES = { small: 0.9, normal: 1, large: 1.25 };

  // 進行中のチェックセッション（画面上の作業用状態）
  var currentSession = null;

  // 履歴画面で「今どの履歴が展開表示されているか」を保持（複数同時展開に対応するため id -> true のマップ）
  var expandedHistoryIds = {};
  var editingContactId = null;

  // ---------------------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", function () {
    initFontScale();
    bindNav();
    bindHome();
    bindCheck();
    bindHistory();
    bindSettings();
    updateHeaderHeightVar();
    window.addEventListener("resize", updateHeaderHeightVar);

    // 進行中（未完了・放置され過ぎていない）のチェックセッションが残っていれば、
    // ホーム画面ではなくチェック画面から起動する（誤リロード対策）。
    var restored = core.loadCurrentSession(store);
    var hasActiveSession =
      restored && !restored.finishedAt && !core.isSessionStale(restored);
    showView(hasActiveSession ? "check" : "home");
  });

  // ---------------------------------------------------------------------
  // 共通: 画面切り替え
  // ---------------------------------------------------------------------

  function showView(name) {
    var views = document.querySelectorAll(".view");
    views.forEach(function (v) {
      v.classList.remove("is-active");
    });
    var target = document.getElementById("view-" + name);
    if (target) target.classList.add("is-active");

    // チェック画面以外に遷移する際は、危険度に応じた赤背景などの表示を必ず解除する。
    if (name !== "check") {
      document.getElementById("app-body").dataset.level = "none";
    }

    if (name === "home") renderHome();
    if (name === "history") renderHistory();
    if (name === "settings") renderSettings();
    if (name === "check") enterCheckView();

    window.scrollTo(0, 0);
  }

  // ヘッダーの実高さを計測し、CSS変数 --header-height に反映する。
  // 文字サイズ変更でヘッダーの高さが変わっても、チェック画面のバナーが
  // ヘッダーの下に隠れないようにするため。
  function updateHeaderHeightVar() {
    var header = document.querySelector(".app-header");
    if (!header) return;
    document.documentElement.style.setProperty(
      "--header-height",
      header.offsetHeight + "px"
    );
  }

  function bindNav() {
    document.getElementById("btn-nav-home").addEventListener("click", function () {
      showView("home");
    });
    document.querySelectorAll("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showView(btn.getAttribute("data-nav"));
      });
    });
  }

  // ---------------------------------------------------------------------
  // 文字サイズ設定
  // ---------------------------------------------------------------------

  function initFontScale() {
    var raw = null;
    try {
      raw = store.getItem(FONT_SCALE_KEY);
    } catch (e) {
      raw = null;
    }
    var scale = raw && FONT_SCALES[raw] ? raw : "normal";
    applyFontScale(scale);

    document.getElementById("btn-font-small").addEventListener("click", function () {
      changeFontScale(-1);
    });
    document.getElementById("btn-font-large").addEventListener("click", function () {
      changeFontScale(1);
    });
  }

  function changeFontScale(direction) {
    var order = ["small", "normal", "large"];
    var raw = null;
    try {
      raw = store.getItem(FONT_SCALE_KEY);
    } catch (e) {
      raw = null;
    }
    var current = raw && FONT_SCALES[raw] ? raw : "normal";
    var idx = order.indexOf(current) + direction;
    idx = Math.max(0, Math.min(order.length - 1, idx));
    var next = order[idx];
    applyFontScale(next);
    try {
      store.setItem(FONT_SCALE_KEY, next);
    } catch (e) {
      // 保存に失敗しても致命的ではない
    }
  }

  function applyFontScale(name) {
    document.documentElement.style.setProperty(
      "--font-scale",
      String(FONT_SCALES[name] || 1)
    );
    // 文字サイズが変わるとヘッダーの実高さも変わるため、都度再計測する。
    updateHeaderHeightVar();
  }

  // ---------------------------------------------------------------------
  // ホーム画面
  // ---------------------------------------------------------------------

  function bindHome() {
    document.getElementById("btn-start-check").addEventListener("click", function () {
      showView("check");
    });
  }

  function renderHome() {
    var contacts = core.loadContacts(store);
    var primary = core.pickPrimaryContact(contacts);

    var cardEl = document.getElementById("home-primary-contact");
    var noContactEl = document.getElementById("home-no-contact");

    if (primary) {
      cardEl.hidden = false;
      noContactEl.hidden = true;
      document.getElementById("home-primary-name").textContent =
        primary.name + (primary.relation ? "（" + primary.relation + "）" : "");
      var telText = core.formatPhone(primary.phone);
      var telLink = document.getElementById("home-primary-tel");
      telLink.href = "tel:" + telText.replace(/[^0-9+]/g, "");
      document.getElementById("home-primary-tel-text").textContent = telText;
    } else {
      cardEl.hidden = true;
      noContactEl.hidden = false;
      var messageEl = document.getElementById("home-no-contact-message");
      var subMessageEl = document.getElementById("home-no-contact-submessage");
      var btnEl = document.getElementById("home-no-contact-btn");
      if (contacts.length > 0) {
        // 連絡先自体は登録済みだが、最優先が指定されていないケース
        // （0件のときと同じ案内を出すと「連絡先がない」と誤解されるため区別する）
        messageEl.textContent =
          "連絡先は登録されていますが、最優先の連絡先が指定されていません。";
        subMessageEl.textContent =
          "設定画面で、いずれかの連絡先を「最優先の連絡先にする」に指定してください。";
        btnEl.textContent = "設定画面を開く";
      } else {
        messageEl.textContent = "緊急連絡先がまだ登録されていません。";
        subMessageEl.textContent =
          "もしもの時にすぐ電話できるよう、家族の連絡先を登録しておきましょう。";
        btnEl.textContent = "緊急連絡先を登録する";
      }
    }
  }

  // ---------------------------------------------------------------------
  // チェック画面
  // ---------------------------------------------------------------------

  function bindCheck() {
    var memoFields = [
      ["input-caller-name", "callerName"],
      ["input-caller-phone", "callerPhone"],
      ["input-request-content", "requestContent"],
      ["input-memo", "memo"],
    ];
    memoFields.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      el.addEventListener("input", function () {
        if (!currentSession) return;
        currentSession = core.updateSessionField(currentSession, pair[1], el.value);
        core.saveCurrentSession(currentSession, store);
      });
    });

    document.getElementById("btn-finish-save").addEventListener("click", onFinishSave);
    document.getElementById("btn-finish-discard").addEventListener("click", onFinishDiscard);
    document.getElementById("btn-reset-check").addEventListener("click", onResetCheck);
  }

  function enterCheckView() {
    var restored = core.loadCurrentSession(store);
    if (restored && !restored.finishedAt && !core.isSessionStale(restored)) {
      currentSession = restored;
    } else {
      currentSession = core.createSession({
        id: core.generateId("s"),
        startedAt: new Date().toISOString(),
      });
      core.saveCurrentSession(currentSession, store);
    }
    renderPhraseCategories();
    renderMemoFields();
    renderCheckBanner();
  }

  function renderPhraseCategories() {
    var container = document.getElementById("phrase-categories");
    container.innerHTML = "";
    var grouped = core.getPhrasesByCategory();

    core.CATEGORY_ORDER.forEach(function (catKey) {
      var phrases = grouped[catKey] || [];
      if (phrases.length === 0) return;

      var section = document.createElement("div");
      section.className = "phrase-category";

      var title = document.createElement("p");
      title.className = "phrase-category__title";
      title.textContent = core.CATEGORY_LABELS[catKey] || catKey;
      section.appendChild(title);

      var list = document.createElement("div");
      list.className = "phrase-list";

      phrases.forEach(function (phrase) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "phrase-btn";
        btn.dataset.phraseId = phrase.id;
        if (phrase.critical) btn.classList.add("is-critical-phrase");
        btn.setAttribute("aria-pressed", "false");
        btn.innerHTML =
          '<span class="phrase-btn__check" aria-hidden="true">☐</span><span>' +
          escapeHtml(phrase.text) +
          "</span>";
        btn.addEventListener("click", function () {
          onTogglePhrase(phrase.id);
        });
        list.appendChild(btn);
      });

      section.appendChild(list);
      container.appendChild(section);
    });

    syncPhraseButtonStates();
  }

  function syncPhraseButtonStates() {
    var selected = (currentSession && currentSession.selectedPhraseIds) || [];
    document.querySelectorAll(".phrase-btn").forEach(function (btn) {
      var isSelected = selected.indexOf(btn.dataset.phraseId) !== -1;
      btn.classList.toggle("is-selected", isSelected);
      btn.classList.toggle(
        "is-critical",
        isSelected && btn.classList.contains("is-critical-phrase")
      );
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      var checkEl = btn.querySelector(".phrase-btn__check");
      if (checkEl) checkEl.textContent = isSelected ? "☑" : "☐";
    });
  }

  function renderMemoFields() {
    if (!currentSession) return;
    document.getElementById("input-caller-name").value = currentSession.callerName || "";
    document.getElementById("input-caller-phone").value = currentSession.callerPhone || "";
    document.getElementById("input-request-content").value = currentSession.requestContent || "";
    document.getElementById("input-memo").value = currentSession.memo || "";
  }

  function onTogglePhrase(phraseId) {
    if (!currentSession) return;
    currentSession = core.togglePhrase(currentSession, phraseId);
    core.saveCurrentSession(currentSession, store);
    syncPhraseButtonStates();
    renderCheckBanner();
  }

  function renderCheckBanner() {
    var level = currentSession ? currentSession.level : "low";
    var score = currentSession ? currentSession.score : 0;

    var banner = document.getElementById("check-banner");
    banner.dataset.level = level;
    document.getElementById("check-level-label").textContent =
      "危険度: " + (core.LEVEL_LABELS[level] || level);
    document.getElementById("check-score-value").textContent = String(score);

    var gaugePercent = Math.max(0, Math.min(100, (score / 15) * 100));
    document.getElementById("check-gauge-fill").style.width = gaugePercent + "%";

    document.getElementById("next-action").textContent = core.nextActionMessage(level);

    document.getElementById("app-body").dataset.level = level;

    var emergencyBox = document.getElementById("check-emergency");
    if (level === "high") {
      emergencyBox.hidden = false;
      renderEmergencyContacts();
    } else {
      emergencyBox.hidden = true;
    }
  }

  function renderEmergencyContacts() {
    var container = document.getElementById("check-emergency-contacts");
    container.innerHTML = "";
    var contacts = core.loadContacts(store);
    if (contacts.length === 0) {
      var p = document.createElement("p");
      p.textContent = "緊急連絡先が未登録です。設定画面から登録してください。";
      container.appendChild(p);
      return;
    }
    // 最優先連絡先を先頭に並べる
    var sorted = contacts.slice().sort(function (a, b) {
      return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
    });
    sorted.forEach(function (c) {
      var telText = core.formatPhone(c.phone);
      var a = document.createElement("a");
      a.className = "tel-link tel-link--big";
      a.href = "tel:" + telText.replace(/[^0-9+]/g, "");
      a.textContent =
        "📞 " + c.name + (c.relation ? "（" + c.relation + "）" : "") + " " + telText;
      container.appendChild(a);
    });
  }

  function onFinishSave() {
    if (!currentSession) return;
    var finished = core.finishSession(currentSession, {
      finishedAt: new Date().toISOString(),
    });
    var sessions = core.loadSessions(store);
    sessions.push(finished);
    core.saveSessions(sessions, store);
    core.clearCurrentSession(store);
    currentSession = null;
    showView("home");
  }

  function onFinishDiscard() {
    var ok = window.confirm(
      "このチェック内容を保存せずに終了します。よろしいですか？"
    );
    if (!ok) return;
    core.clearCurrentSession(store);
    currentSession = null;
    showView("home");
  }

  function onResetCheck() {
    var ok = window.confirm(
      "選択したフレーズとメモの内容をすべてリセットします。よろしいですか？"
    );
    if (!ok) return;
    currentSession = core.createSession({
      id: core.generateId("s"),
      startedAt: new Date().toISOString(),
    });
    core.saveCurrentSession(currentSession, store);
    syncPhraseButtonStates();
    renderMemoFields();
    renderCheckBanner();
  }

  // ---------------------------------------------------------------------
  // 履歴画面
  // ---------------------------------------------------------------------

  function bindHistory() {
    document.getElementById("btn-print-history").addEventListener("click", function () {
      // 印刷の際は「1件だけ展開されている」状態だと紙に1件分しか残らないため、
      // 印刷前に全履歴の詳細をまとめて展開してから印刷ダイアログを開く。
      var sessions = core.loadSessions(store);
      sessions.forEach(function (s) {
        expandedHistoryIds[s.id] = true;
      });
      renderHistory();
      window.print();
    });
  }

  function renderHistory() {
    var sessions = core.sortSessionsByDateDesc(core.loadSessions(store));
    var listEl = document.getElementById("history-list");
    var emptyEl = document.getElementById("history-empty");
    listEl.innerHTML = "";

    if (sessions.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    sessions.forEach(function (session) {
      listEl.appendChild(buildHistoryCard(session));
    });
  }

  function buildHistoryCard(session) {
    var card = document.createElement("div");
    card.className = "history-card";
    card.dataset.level = session.level;

    var top = document.createElement("div");
    top.className = "history-card__top";

    var dateEl = document.createElement("p");
    dateEl.className = "history-card__date";
    dateEl.textContent = core.formatDateTimeJa(session.startedAt);
    top.appendChild(dateEl);

    var badge = document.createElement("span");
    badge.className = "level-badge";
    badge.dataset.level = session.level;
    badge.textContent = core.LEVEL_LABELS[session.level] || session.level;
    top.appendChild(badge);

    card.appendChild(top);

    var scoreEl = document.createElement("p");
    scoreEl.className = "history-card__score";
    scoreEl.textContent = "危険度スコア: " + session.score;
    card.appendChild(scoreEl);

    var buttons = document.createElement("div");
    buttons.className = "history-card__buttons";

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn--secondary";
    var isExpanded = !!expandedHistoryIds[session.id];
    toggleBtn.textContent = isExpanded ? "詳細を閉じる" : "詳細を見る";
    toggleBtn.addEventListener("click", function () {
      if (isExpanded) {
        delete expandedHistoryIds[session.id];
      } else {
        expandedHistoryIds[session.id] = true;
      }
      renderHistory();
    });
    buttons.appendChild(toggleBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn--danger";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", function () {
      var ok = window.confirm("この履歴を削除します。よろしいですか？");
      if (!ok) return;
      var sessions = core.loadSessions(store);
      sessions = core.removeSessionById(sessions, session.id);
      core.saveSessions(sessions, store);
      delete expandedHistoryIds[session.id];
      renderHistory();
    });
    buttons.appendChild(deleteBtn);

    card.appendChild(buttons);

    if (isExpanded) {
      card.appendChild(buildHistoryDetail(session));
    }

    return card;
  }

  function buildHistoryDetail(session) {
    var detail = document.createElement("dl");
    detail.className = "history-detail";

    appendDetailRow(detail, "相手が名乗った名前", session.callerName || "（未入力）");
    appendDetailRow(detail, "相手の電話番号", session.callerPhone || "（未入力）");
    appendDetailRow(detail, "要求内容", session.requestContent || "（未入力）");
    appendDetailRow(detail, "その他メモ", session.memo || "（未入力）");

    var dt = document.createElement("dt");
    dt.textContent = "選択したフレーズ";
    detail.appendChild(dt);

    var dd = document.createElement("dd");
    var phrases = (session.selectedPhraseIds || [])
      .map(function (id) {
        return core.getPhraseById(id);
      })
      .filter(Boolean);

    if (phrases.length === 0) {
      dd.textContent = "選択されたフレーズはありません";
    } else {
      var ul = document.createElement("ul");
      phrases.forEach(function (p) {
        var li = document.createElement("li");
        li.textContent = p.text + (p.critical ? "（重大）" : "");
        ul.appendChild(li);
      });
      dd.appendChild(ul);
    }
    detail.appendChild(dd);

    return detail;
  }

  function appendDetailRow(dl, label, value) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  // ---------------------------------------------------------------------
  // 設定画面
  // ---------------------------------------------------------------------

  function bindSettings() {
    document.getElementById("contact-form").addEventListener("submit", function (e) {
      e.preventDefault();
      onSubmitContact();
    });
    document
      .getElementById("btn-contact-cancel-edit")
      .addEventListener("click", function () {
        exitEditMode();
      });
  }

  function renderSettings() {
    var contacts = core.loadContacts(store);
    var listEl = document.getElementById("contact-list");
    var emptyEl = document.getElementById("settings-no-contact");
    listEl.innerHTML = "";

    if (contacts.length === 0) {
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      contacts.forEach(function (contact) {
        listEl.appendChild(buildContactCard(contact));
      });
    }
  }

  function buildContactCard(contact) {
    var card = document.createElement("div");
    card.className = "contact-card" + (contact.isPrimary ? " is-primary" : "");

    var name = document.createElement("p");
    name.className = "contact-card__name";
    name.textContent = contact.name;
    if (contact.isPrimary) {
      var tag = document.createElement("span");
      tag.className = "primary-tag";
      tag.textContent = "最優先";
      name.appendChild(tag);
    }
    card.appendChild(name);

    var meta = document.createElement("p");
    meta.className = "contact-card__meta";
    meta.textContent =
      (contact.relation ? contact.relation + " / " : "") + core.formatPhone(contact.phone);
    card.appendChild(meta);

    var telLink = document.createElement("a");
    telLink.className = "tel-link";
    telLink.href = "tel:" + core.formatPhone(contact.phone).replace(/[^0-9+]/g, "");
    telLink.textContent = "📞 電話をかける";
    card.appendChild(telLink);

    var buttons = document.createElement("div");
    buttons.className = "contact-card__buttons";

    if (!contact.isPrimary) {
      var primaryBtn = document.createElement("button");
      primaryBtn.type = "button";
      primaryBtn.className = "btn btn--secondary";
      primaryBtn.textContent = "最優先にする";
      primaryBtn.addEventListener("click", function () {
        var contacts = core.loadContacts(store);
        contacts = core.setPrimaryContact(contacts, contact.id);
        core.saveContacts(contacts, store);
        renderSettings();
        renderHome();
      });
      buttons.appendChild(primaryBtn);
    }

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--secondary";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", function () {
      enterEditMode(contact);
    });
    buttons.appendChild(editBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn--danger";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", function () {
      var ok = window.confirm(
        "「" + contact.name + "」を連絡先から削除します。よろしいですか？"
      );
      if (!ok) return;
      var contacts = core.loadContacts(store);
      contacts = core.removeContactById(contacts, contact.id);
      // 最優先連絡先を削除した場合、残った連絡先の先頭を自動的に最優先へ昇格させる
      // （そうしないと連絡先が残っているのに「未登録」と紛らわしい表示になるため）。
      contacts = core.ensurePrimaryContact(contacts);
      core.saveContacts(contacts, store);
      if (editingContactId === contact.id) exitEditMode();
      renderSettings();
      renderHome();
    });
    buttons.appendChild(deleteBtn);

    card.appendChild(buttons);
    return card;
  }

  function onSubmitContact() {
    var name = document.getElementById("contact-name").value;
    var relation = document.getElementById("contact-relation").value;
    // 全角数字・全角記号でのIME入力ミスを救済するため、半角に正規化してから扱う。
    var phone = core.normalizePhoneInput(document.getElementById("contact-phone").value);
    var isPrimaryChecked = document.getElementById("contact-primary").checked;

    var candidate = { name: name, phone: phone };
    var validation = core.validateContact(candidate);

    var errorsEl = document.getElementById("contact-form-errors");
    if (!validation.valid) {
      errorsEl.hidden = false;
      errorsEl.innerHTML = "";
      var ul = document.createElement("ul");
      validation.errors.forEach(function (msg) {
        var li = document.createElement("li");
        li.textContent = msg;
        ul.appendChild(li);
      });
      errorsEl.appendChild(ul);
      return;
    }
    errorsEl.hidden = true;

    var contacts = core.loadContacts(store);
    var isNew = !editingContactId;
    var id = editingContactId || core.generateId("c");
    // 最初の1件は、チェックの有無にかかわらず自動的に最優先連絡先にする
    var forcePrimary = isNew && contacts.length === 0;

    if (isNew) {
      contacts.push({
        id: id,
        name: name.trim(),
        relation: relation.trim(),
        phone: core.formatPhone(phone),
        isPrimary: false,
      });
    } else {
      contacts = contacts.map(function (c) {
        if (c.id !== id) return c;
        return {
          id: c.id,
          name: name.trim(),
          relation: relation.trim(),
          phone: core.formatPhone(phone),
          isPrimary: c.isPrimary,
        };
      });
    }

    if (isPrimaryChecked || forcePrimary) {
      // 排他制御: このIDだけをisPrimary:trueにし、他はfalseにする
      contacts = core.setPrimaryContact(contacts, id);
    } else {
      // チェックを外した場合は、このIDのisPrimaryのみfalseにする（他の連絡先には影響しない）
      contacts = contacts.map(function (c) {
        return c.id === id ? assignShallow(c, { isPrimary: false }) : c;
      });
      // ただしその結果、最優先連絡先が誰もいなくなった場合は先頭を自動的に昇格させる
      // （最優先が消えたことに気づかないまま放置されるのを防ぐため）。
      contacts = core.ensurePrimaryContact(contacts);
    }

    core.saveContacts(contacts, store);
    exitEditMode();
    renderSettings();
    renderHome();
  }

  function assignShallow(obj, patch) {
    var result = {};
    Object.keys(obj).forEach(function (k) {
      result[k] = obj[k];
    });
    Object.keys(patch).forEach(function (k) {
      result[k] = patch[k];
    });
    return result;
  }

  function enterEditMode(contact) {
    editingContactId = contact.id;
    document.getElementById("contact-edit-id").value = contact.id;
    document.getElementById("contact-name").value = contact.name || "";
    document.getElementById("contact-relation").value = contact.relation || "";
    document.getElementById("contact-phone").value = contact.phone || "";
    document.getElementById("contact-primary").checked = !!contact.isPrimary;
    document.getElementById("btn-contact-submit").textContent = "更新する";
    document.getElementById("btn-contact-cancel-edit").hidden = false;
    document.getElementById("contact-form-errors").hidden = true;
    document.getElementById("contact-form").scrollIntoView({ behavior: "smooth" });
  }

  function exitEditMode() {
    editingContactId = null;
    document.getElementById("contact-form").reset();
    document.getElementById("contact-edit-id").value = "";
    document.getElementById("btn-contact-submit").textContent = "追加する";
    document.getElementById("btn-contact-cancel-edit").hidden = true;
    document.getElementById("contact-form-errors").hidden = true;
  }

  // ---------------------------------------------------------------------
  // ユーティリティ
  // ---------------------------------------------------------------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
