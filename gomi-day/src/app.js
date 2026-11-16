/* あしたのごみ — 画面の処理。ロジックは rules.js（window.GomiRules）にある。 */
(function () {
  "use strict";

  var R = window.GomiRules;
  var STORAGE_KEY = "gomi-day:v1";
  var CORRUPT_KEY = "gomi-day:v1:corrupt";
  var SHARE_PREFIX = "#s=";

  var PALETTE = {
    "燃やすごみ": "#d9534f",
    "可燃ごみ": "#d9534f",
    "燃やさないごみ": "#6c757d",
    "不燃ごみ": "#6c757d",
    "資源ごみ": "#2f7fd6",
    "プラスチック": "#e0a100",
    "ペットボトル": "#17a2b8",
    "びん・缶": "#8e5bd6",
    "古紙・古布": "#a0703c",
    "有害ごみ": "#c2185b",
  };
  var FALLBACK = ["#2f7a4a", "#2f7fd6", "#e0a100", "#8e5bd6", "#17a2b8", "#a0703c", "#c2185b", "#d9534f"];

  var SAMPLE = {
    version: 1,
    rules: [
      { name: "燃やすごみ", type: "weekly", weekdays: [1, 4] },
      { name: "資源ごみ", type: "nth", weekdays: [3], nths: [2, 4] },
      { name: "燃やさないごみ", type: "nth", weekdays: [5], nths: [1, 3] },
    ],
    breaks: [],
  };

  var state = R.emptyConfig();
  var storageOk = true;
  var pendingShare = null;
  var beforeImport = null;
  var noticeTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function colorFor(name) {
    if (Object.prototype.hasOwnProperty.call(PALETTE, name)) return PALETTE[name];
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return FALLBACK[h % FALLBACK.length];
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function chip(name) {
    var c = el("span", "chip");
    c.setAttribute("aria-hidden", "true");
    c.style.setProperty("--chip", colorFor(name));
    return c;
  }

  // ---------- 保存 ----------

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      setStorageWarning("この端末では設定を保存できません。ページを閉じると内容は消えます。");
      storageOk = false;
      return R.emptyConfig();
    }
    if (!raw) return R.emptyConfig();
    try {
      return R.sanitizeConfig(JSON.parse(raw));
    } catch (e) {
      // 壊れた保存データは消さずに別のキーへ退避する（上書きで失われないように）
      try {
        window.localStorage.setItem(CORRUPT_KEY, raw);
      } catch (e2) {
        /* 退避できなくても起動は続ける */
      }
      setStorageWarning("保存されていた設定を読み込めなかったため、空の状態で始めました。元のデータは「" + CORRUPT_KEY + "」として残してあります。");
      return R.emptyConfig();
    }
  }

  /** 保存に関する警告は、操作結果の通知とは別の場所に出し続ける（上書きされて見落とさないように）。 */
  function setStorageWarning(message) {
    var w = $("storage-warn");
    w.textContent = message;
    w.hidden = false;
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
      setStorageWarning("この端末では設定を保存できません。ページを閉じると内容は消えます。");
    }
  }

  /** 新しい設定を検査してから反映する。不正なら例外をそのまま投げる。 */
  function commit(next) {
    state = R.sanitizeConfig(next);
    save();
    render();
  }

  /** 操作結果を画面下部に表示する（どこまでスクロールしていても見える）。 */
  function notify(message, warn) {
    var n = $("notice");
    n.textContent = message;
    n.classList.toggle("warn", !!warn);
    n.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { n.hidden = true; }, warn ? 10000 : 6000);
  }

  // ---------- 描画 ----------

  function renderDay(listId, dateId, date) {
    $(dateId).textContent = R.formatJapanese(date);
    var list = $(listId);
    list.replaceChildren();
    var items = R.itemsOn(state, date);
    if (items.length === 0) {
      var li = el("li", "none", R.isOnBreak(state, date) ? "お休み期間です" : "出すごみはありません");
      list.appendChild(li);
      return;
    }
    items.forEach(function (name) {
      var li = el("li", "item");
      li.appendChild(chip(name));
      li.appendChild(el("span", "", name));
      list.appendChild(li);
    });
  }

  function renderUpcoming(today) {
    var list = $("upcoming");
    list.replaceChildren();
    R.upcoming(state, today, 14).forEach(function (day) {
      var li = el("li");
      var d = R.parseDate(day.date);
      var dateCls = "date" + (d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : "");
      li.appendChild(el("span", dateCls, day.label));
      var names = el("span", "names");
      if (day.items.length === 0) {
        names.appendChild(el("span", "none", day.onBreak ? "お休み" : "なし"));
      } else {
        day.items.forEach(function (name) {
          var n = el("span", "name");
          n.appendChild(chip(name));
          n.appendChild(el("span", "", name));
          names.appendChild(n);
        });
      }
      li.appendChild(names);
      list.appendChild(li);
    });
  }

  function renderRules() {
    var list = $("rule-list");
    list.replaceChildren();
    if (state.rules.length === 0) {
      list.appendChild(el("li", "empty", "規則はまだありません。"));
      return;
    }
    state.rules.forEach(function (rule, index) {
      var li = el("li");
      var text = el("span", "rule-text");
      var name = el("span", "rule-name");
      name.appendChild(chip(rule.name));
      name.appendChild(el("span", "", rule.name));
      text.appendChild(name);
      var desc = R.describeRule(rule);
      text.appendChild(el("span", "rule-desc", desc));
      li.appendChild(text);
      var btn = el("button", "btn small", "削除");
      btn.type = "button";
      btn.setAttribute("aria-label", rule.name + "（" + desc + "）を削除");
      btn.addEventListener("click", function () {
        var next = { version: 1, rules: state.rules.filter(function (_, i) { return i !== index; }), breaks: state.breaks };
        commit(next);
        $("h-rules").focus();
        notify(rule.name + "（" + desc + "）を削除しました。");
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderBreaks() {
    var list = $("break-list");
    list.replaceChildren();
    if (state.breaks.length === 0) {
      list.appendChild(el("li", "empty", "お休み期間はまだありません。"));
      return;
    }
    state.breaks.forEach(function (b, index) {
      var li = el("li");
      var label = R.formatJapanese(R.parseDate(b.from)) + " 〜 " + R.formatJapanese(R.parseDate(b.to));
      li.appendChild(el("span", "rule-desc", label));
      var btn = el("button", "btn small", "削除");
      btn.type = "button";
      btn.setAttribute("aria-label", label + " のお休み期間を削除");
      btn.addEventListener("click", function () {
        commit({ version: 1, rules: state.rules, breaks: state.breaks.filter(function (_, i) { return i !== index; }) });
        $("h-breaks").focus();
        notify(label + " のお休み期間を削除しました。");
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function render() {
    var today = new Date();
    renderDay("today-items", "today-date", today);
    renderDay("tomorrow-items", "tomorrow-date", R.addDays(today, 1));
    $("empty-guide").hidden = state.rules.length > 0;
    renderUpcoming(today);
    renderRules();
    renderBreaks();
  }

  // ---------- 規則の追加フォーム ----------

  function buildChoices() {
    var wd = $("weekday-choices");
    // 月曜から並べる（日本の分別表の並びに合わせる）
    [1, 2, 3, 4, 5, 6, 0].forEach(function (w) {
      var label = el("label", "choice");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.name = "weekday";
      input.value = String(w);
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + R.WEEKDAY_LABELS[w]));
      wd.appendChild(label);
    });
    var nth = $("nth-choices");
    [1, 2, 3, 4, 5].forEach(function (n) {
      var label = el("label", "choice");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.name = "nth";
      input.value = String(n);
      label.appendChild(input);
      label.appendChild(document.createTextNode(" 第" + n));
      nth.appendChild(label);
    });
  }

  function selectedType() {
    var checked = document.querySelector('input[name="type"]:checked');
    return checked ? checked.value : "weekly";
  }

  function checkedNumbers(name) {
    return Array.prototype.map.call(
      document.querySelectorAll('input[name="' + name + '"]:checked'),
      function (i) { return Number(i.value); }
    );
  }

  function updateTypeFields() {
    var type = selectedType();
    $("nth-field").hidden = type !== "nth";
    $("anchor-field").hidden = type !== "biweekly";
  }

  function onRuleSubmit(e) {
    e.preventDefault();
    var error = $("rule-error");
    error.textContent = "";
    var type = selectedType();
    var raw = { name: $("rule-name").value, type: type, weekdays: checkedNumbers("weekday") };
    if (type === "nth") raw.nths = checkedNumbers("nth");
    if (type === "biweekly") raw.anchor = $("rule-anchor").value;
    try {
      commit({ version: 1, rules: state.rules.concat([raw]), breaks: state.breaks });
    } catch (err) {
      error.textContent = err.message;
      return;
    }
    var added = state.rules[state.rules.length - 1];
    notify(added.name + "（" + R.describeRule(added) + "）を追加しました。");
    $("rule-form").reset();
    updateTypeFields();
    $("rule-name").focus();
  }

  function onBreakSubmit(e) {
    e.preventDefault();
    var error = $("break-error");
    error.textContent = "";
    var from = $("break-from").value;
    var to = $("break-to").value;
    if (!from || !to) {
      error.textContent = "開始日と終了日を入力してください。";
      return;
    }
    try {
      commit({ version: 1, rules: state.rules, breaks: state.breaks.concat([{ from: from, to: to }]) });
    } catch (err) {
      error.textContent = err.message;
      return;
    }
    notify("お休み期間を追加しました。");
    $("break-form").reset();
  }

  // ---------- 共有 ----------

  function shareUrl() {
    return location.origin + location.pathname + location.search + SHARE_PREFIX + R.encodeShare(state);
  }

  function onShareCopy() {
    if (state.rules.length === 0) {
      notify("共有する規則がありません。先に規則を追加してください。", true);
      return;
    }
    var url;
    try {
      url = shareUrl();
    } catch (err) {
      notify(err.message, true);
      return;
    }
    var field = $("share-output");
    field.value = url;
    $("share-output-field").hidden = false;
    var done = function () { notify("共有リンクをコピーしました。メッセージアプリに貼り付けて送ってください。"); };
    var fallback = function () {
      field.focus();
      field.select();
      notify("自動でコピーできませんでした。下の共有リンクを長押し（または選択）してコピーしてください。", true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  function clearHash() {
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {
      location.hash = "";
    }
  }

  function checkShareHash() {
    if (location.hash.indexOf(SHARE_PREFIX) !== 0) return;
    if (isFramed()) {
      // 他のサイトに埋め込まれた状態では、気づかないうちに読み込ませられないよう受け付けない
      clearHash();
      notify("埋め込まれたページでは共有リンクを読み込めません。リンクを直接開いてください。", true);
      return;
    }
    var encoded = location.hash.slice(SHARE_PREFIX.length);
    try {
      pendingShare = R.decodeShare(encoded);
    } catch (err) {
      pendingShare = null;
      clearHash();
      notify("共有リンクを読み込めませんでした。" + err.message, true);
      return;
    }
    var text = "共有された規則が" + pendingShare.rules.length + "件、お休み期間が" + pendingShare.breaks.length + "件あります。内容を確かめてから読み込んでください。";
    if (state.rules.length > 0 || state.breaks.length > 0) {
      text += "今この端末にある設定は置き換わります（読み込んだ後に元に戻せます）。";
    }
    $("share-banner-text").textContent = text;
    var list = $("share-preview");
    list.replaceChildren();
    pendingShare.rules.forEach(function (rule) {
      var li = el("li");
      li.appendChild(chip(rule.name));
      li.appendChild(el("span", "", rule.name + "：" + R.describeRule(rule)));
      list.appendChild(li);
    });
    pendingShare.breaks.forEach(function (b) {
      list.appendChild(el("li", "", "お休み：" + R.formatJapanese(R.parseDate(b.from)) + " 〜 " + R.formatJapanese(R.parseDate(b.to))));
    });
    $("share-ask").hidden = false;
    $("share-done").hidden = true;
    var banner = $("share-banner");
    banner.hidden = false;
    banner.focus();
  }

  function closeShareBanner() {
    pendingShare = null;
    $("share-banner").hidden = true;
    clearHash();
  }

  function isFramed() {
    try {
      return window.top !== window.self;
    } catch (e) {
      return true;
    }
  }

  // ---------- カレンダー ----------

  function onIcsDownload() {
    if (state.rules.length === 0) {
      notify("書き出す規則がありません。先に規則を追加してください。", true);
      return;
    }
    var ics = R.toICS(state, new Date(), 366, { alarm: $("ics-alarm").checked });
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "gomi-day.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    notify("カレンダー用ファイル（gomi-day.ics）を保存しました。開くとカレンダーアプリに取り込めます。");
  }

  // ---------- 起動 ----------

  function init() {
    if (!R) return;
    state = load();
    buildChoices();
    updateTypeFields();
    document.querySelectorAll('input[name="type"]').forEach(function (i) {
      i.addEventListener("change", updateTypeFields);
    });
    $("rule-form").addEventListener("submit", onRuleSubmit);
    $("break-form").addEventListener("submit", onBreakSubmit);
    $("share-copy").addEventListener("click", onShareCopy);
    $("ics-download").addEventListener("click", onIcsDownload);
    $("load-sample").addEventListener("click", function () {
      commit(SAMPLE);
      notify("よくある例を入れました。お住まいの地域の分別表に合わせて、規則を削除・追加してください。");
    });
    $("clear-all").addEventListener("click", function () {
      if (!window.confirm("この端末の規則とお休み期間をすべて消します。よろしいですか？")) return;
      commit(R.emptyConfig());
      notify("すべて消しました。");
    });
    $("share-accept").addEventListener("click", function () {
      if (!pendingShare) return;
      beforeImport = { version: 1, rules: state.rules, breaks: state.breaks };
      commit(pendingShare);
      pendingShare = null;
      clearHash();
      $("share-ask").hidden = true;
      $("share-done").hidden = false;
      $("share-undo").focus();
    });
    $("share-undo").addEventListener("click", function () {
      if (beforeImport) commit(beforeImport);
      beforeImport = null;
      closeShareBanner();
      notify("読み込む前の設定に戻しました。");
    });
    $("share-close").addEventListener("click", function () {
      beforeImport = null;
      closeShareBanner();
    });
    $("share-reject").addEventListener("click", function () {
      closeShareBanner();
      notify("共有された規則は読み込みませんでした。");
    });
    window.addEventListener("hashchange", checkShareHash);
    // 日付をまたいで開いたままでも表示を新しくする
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") render();
    });
    render();
    scheduleMidnight();
    checkShareHash();
  }

  /** 開いたまま日付が変わったら「今日」「あした」を更新する。 */
  function scheduleMidnight() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(function () {
      render();
      scheduleMidnight();
    }, Math.min(next - now, 2147483647));
  }

  init();
})();
