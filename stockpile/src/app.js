/* そなえ帳 — 画面の描画とイベント処理。利用者の入力は textContent でのみ表示する。 */
(function () {
  "use strict";
  var S = window.Sonae;
  var MAX_IMPORT_BYTES = 1024 * 1024;

  var storageOk = true;
  var loadProblem = "";
  var state = load();

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "className") node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function today() { return S.toDateString(new Date()); }

  function load() {
    var raw;
    try {
      raw = window.localStorage.getItem(S.STORAGE_KEY);
    } catch (e) {
      storageOk = false;
      return S.defaultState();
    }
    if (!raw) return S.defaultState();
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    var r = S.sanitizeState(parsed);
    if (r.ok) return r.state;
    // 壊れた・版の違う保存データは消さずに退避してから、初期状態で始める
    try { window.localStorage.setItem(S.STORAGE_KEY + ".bak", raw); } catch (e) { /* 退避できなくても続ける */ }
    loadProblem = "保存データを読めなかったため、初期状態で始めました（元のデータは端末内に退避しています）。";
    return S.defaultState();
  }

  function save() {
    try {
      window.localStorage.setItem(S.STORAGE_KEY, JSON.stringify(state));
      $("storage-warning").hidden = true;
    } catch (e) {
      storageOk = false;
      $("storage-warning").hidden = false;
    }
  }

  function reqUnit(reqId) {
    for (var i = 0; i < S.REQUIREMENTS.length; i++) {
      if (S.REQUIREMENTS[i].id === reqId) return S.REQUIREMENTS[i].unit;
    }
    return "個";
  }

  // ---- 家族構成 ----
  function renderHousehold() {
    var box = $("household");
    box.textContent = "";
    S.HOUSEHOLD_FIELDS.forEach(function (f) {
      var id = "hh-" + f.key;
      var input = el("input", {
        id: id, type: "number", inputmode: "numeric", min: String(f.min), max: String(f.max), step: "1",
        value: String(state.household[f.key])
      });
      function apply(commit) {
        if (input.value.trim() === "") {
          if (commit) input.value = String(state.household[f.key]);
          return;
        }
        var next = Object.assign({}, state.household);
        next[f.key] = input.value;
        state.household = S.normalizeHousehold(next);
        if (commit) input.value = String(state.household[f.key]);
        save();
        renderResults();
      }
      input.addEventListener("input", function () { apply(false); });
      input.addEventListener("change", function () { apply(true); });
      var suffix = f.key === "days" ? "日" : f.key === "dogs" || f.key === "cats" ? "匹" : "人";
      box.appendChild(el("div", { className: "field" }, [
        el("label", { for: id, text: f.label }),
        el("div", { className: "num" }, [input, el("span", { className: "unit", text: suffix })])
      ]));
    });
  }

  // ---- 品目セレクト ----
  function renderSelect() {
    var sel = $("f-req");
    sel.textContent = "";
    var groups = {};
    S.REQUIREMENTS.forEach(function (r) {
      if (!groups[r.group]) {
        groups[r.group] = el("optgroup", { label: r.group });
        sel.appendChild(groups[r.group]);
      }
      groups[r.group].appendChild(el("option", { value: r.id, text: r.name + "／" + r.unit }));
    });
    sel.appendChild(el("option", { value: "other", text: "その他（集計しない）" }));
    sel.addEventListener("change", updateUnit);
    updateUnit();
  }

  function updateUnit() {
    var id = $("f-req").value;
    $("f-unit").textContent = id === "other" ? "" : "（" + reqUnit(id) + "）";
  }

  // ---- 結果 ----
  function renderResults(focusAfter) {
    var active = document.activeElement;
    var key = focusAfter || (active && active.getAttribute && active.getAttribute("data-focus"));
    var t = today();
    var sum = S.summarize(state.household, state.items, t);
    renderOverview(sum);
    renderRequirements(sum);
    renderAlerts(sum);
    renderInventory(t);
    renderShopping(sum);
    if (key) {
      var target = document.querySelector('[data-focus="' + key + '"]');
      if (target) target.focus();
    }
  }

  function renderOverview(sum) {
    $("ov-coverage").textContent = sum.coverage + "%";
    $("ov-water").textContent = sum.waterDays === null ? "—" : "あと" + S.formatNumber(sum.waterDays) + "日分";
    $("ov-expiry").textContent = sum.alerts.expired.length + "件／" + sum.alerts.soon.length + "件";
    $("live").textContent = "全体の充足率 " + sum.coverage + "%";
  }

  function renderRequirements(sum) {
    var box = $("requirements");
    box.textContent = "";
    if (!sum.rows.length) {
      box.appendChild(el("p", { className: "muted", text: "家族構成に1人以上入れると、必要な量が表示されます。" }));
      return;
    }
    var list = el("ul", { className: "req-list" });
    sum.rows.forEach(function (r) {
      var pct = Math.round(r.ratio * 100);
      var done = r.shortage === 0;
      var bar = el("div", {
        className: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100",
        "aria-valuenow": String(pct), "aria-label": r.name + "の充足率"
      }, [el("span", { className: "bar-fill" + (done ? " done" : "") })]);
      bar.firstChild.style.width = pct + "%";
      list.appendChild(el("li", { className: "req" }, [
        el("div", { className: "req-head" }, [
          el("span", { className: "req-name", text: r.name }),
          el("span", { className: "badge " + (done ? "ok" : "short"), text: done ? "足りている" : "あと" + S.formatNumber(r.shortage) + r.unit })
        ]),
        el("div", { className: "req-nums", text: "必要 " + S.formatNumber(r.required) + r.unit + " ／ ある " + S.formatNumber(r.have) + r.unit + "（" + pct + "%）" }),
        bar,
        el("div", { className: "req-note", text: r.note })
      ]));
    });
    box.appendChild(list);
  }

  function renderAlerts(sum) {
    var box = $("alerts");
    box.textContent = "";
    var sections = [
      { key: "expired", title: "期限切れ（食べられるか確認し、入れ替えを）", cls: "expired" },
      { key: "soon", title: "30日以内に期限", cls: "soon" },
      { key: "rolling", title: "今月食べて、買い足す（60日以内）", cls: "rolling" }
    ];
    var any = false;
    sections.forEach(function (s) {
      var arr = sum.alerts[s.key];
      if (!arr.length) return;
      any = true;
      var ul = el("ul", { className: "alert-list" });
      arr.forEach(function (a) {
        ul.appendChild(el("li", null, [
          el("span", { className: "badge " + s.cls, text: S.expiryLabel(a.days) }),
          el("span", { text: " " + a.name + " " + S.formatNumber(a.qty) + (a.reqId === "other" ? "" : reqUnit(a.reqId)) })
        ]));
      });
      box.appendChild(el("div", { className: "alert-group" }, [el("h3", { text: s.title }), ul]));
    });
    if (!any) box.appendChild(el("p", { className: "muted", text: "60日以内に期限が来る在庫はありません。" }));
  }

  function renderInventory(t) {
    var box = $("inventory");
    box.textContent = "";
    if (!state.items.length) {
      box.appendChild(el("p", { className: "muted", text: "まだ在庫がありません。上のフォームから追加してください。" }));
      return;
    }
    var sorted = state.items.slice().sort(function (a, b) {
      var da = S.daysUntil(a.expiry, t), db = S.daysUntil(b.expiry, t);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
    var ul = el("ul", { className: "inv-list" });
    sorted.forEach(function (it) {
      var days = S.daysUntil(it.expiry, t);
      var status = S.expiryStatus(days);
      var qtyId = "q-" + it.id;
      var qty = el("input", { id: qtyId, "data-focus": "q-" + it.id, type: "number", inputmode: "decimal", min: "0", step: "any", value: String(it.qty) });
      qty.addEventListener("change", function () { updateQty(it.id, qty); });
      var del = el("button", { type: "button", "data-focus": "d-" + it.id, className: "btn small danger", text: "削除", "aria-label": it.name + "を削除" });
      del.addEventListener("click", function () { removeItem(it.id); });
      var unit = it.reqId === "other" ? "" : reqUnit(it.reqId);
      ul.appendChild(el("li", { className: "inv" }, [
        el("div", { className: "inv-main" }, [
          el("span", { className: "inv-name", text: it.name }),
          el("span", { className: "badge " + status, text: S.expiryLabel(days) })
        ]),
        el("div", { className: "inv-ctrl" }, [
          el("label", { for: qtyId, className: "sr-only", text: it.name + "の数量" }),
          qty,
          el("span", { className: "unit", text: unit }),
          del
        ])
      ]));
    });
    box.appendChild(ul);
  }

  function renderShopping(sum) {
    var text = S.shoppingList(sum);
    $("shopping").textContent = text || "足りない物はありません。";
    $("copy-result").textContent = "";
    $("copy-shopping").disabled = !text;
  }

  // ---- 操作 ----
  function addItem(ev) {
    ev.preventDefault();
    var err = $("add-error");
    err.textContent = "";
    if (state.items.length >= S.MAX_ITEMS) {
      err.textContent = "在庫は" + S.MAX_ITEMS + "件まで登録できます。";
      return;
    }
    var r = S.sanitizeItem({
      reqId: $("f-req").value,
      name: $("f-name").value,
      qty: $("f-qty").value,
      expiry: $("f-exp").value
    });
    if (!r.ok) { err.textContent = r.error; return; }
    state.items.push(r.item);
    save();
    $("f-name").value = "";
    $("f-qty").value = "";
    $("f-exp").value = "";
    renderResults();
    $("live").textContent = r.item.name + "を追加しました";
    $("f-qty").focus();
  }

  function updateQty(id, input) {
    var item = state.items.find(function (x) { return x.id === id; });
    if (!item) return;
    var n = Number(input.value);
    if (input.value.trim() === "" || !isFinite(n) || n <= 0) {
      input.value = String(item.qty);
      $("live").textContent = n === 0 ? "数量は0にできません。使い切ったら「削除」を押してください。" : "数量は0より大きい数で入力してください。";
      return;
    }
    var r = S.sanitizeItem(Object.assign({}, item, { qty: n }));
    if (!r.ok) { input.value = String(item.qty); $("live").textContent = r.error; return; }
    item.qty = r.item.qty;
    save();
    renderResults();
  }

  function removeItem(id) {
    var item = state.items.find(function (x) { return x.id === id; });
    var buttons = Array.prototype.slice.call(document.querySelectorAll("#inventory [data-focus^='d-']"));
    var idx = buttons.findIndex(function (b) { return b.getAttribute("data-focus") === "d-" + id; });
    var neighbour = buttons[idx + 1] || buttons[idx - 1];
    state.items = state.items.filter(function (x) { return x.id !== id; });
    save();
    renderResults(neighbour ? neighbour.getAttribute("data-focus") : "add-qty");
    if (item) $("live").textContent = item.name + "を削除しました";
  }

  function copyShopping() {
    var text = S.shoppingList(S.summarize(state.household, state.items, today()));
    var out = $("copy-result");
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { out.textContent = "コピーしました"; },
        function () { out.textContent = "コピーできませんでした。リストを長押しして選択してください。"; });
    } else {
      out.textContent = "この環境ではコピーできません。リストを長押しして選択してください。";
    }
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: "sonae-cho-" + today() + ".json" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    $("data-result").textContent = "書き出しました。";
  }

  function importData(ev) {
    var input = ev.target;
    var file = input.files && input.files[0];
    var out = $("data-result");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      out.textContent = "ファイルが大きすぎます（1MBまで）。";
      input.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) {
        out.textContent = "JSON として読み込めませんでした。書き出したファイルを選んでください。";
        input.value = "";
        return;
      }
      var r = S.sanitizeState(parsed);
      if (!r.ok) { out.textContent = "読み込めませんでした: " + r.errors.join("、"); input.value = ""; return; }
      var total = Array.isArray(parsed.items) ? parsed.items.length : 0;
      var msg = "今のデータを、読み込んだデータ（在庫 " + r.state.items.length + "件）で置き換えます。";
      if (r.errors.length) msg += "\n" + total + "件のうち " + r.errors.length + "件は形式が正しくないため取り込みません。";
      if (!window.confirm(msg + "\nよろしいですか？")) { input.value = ""; return; }
      state = r.state;
      save();
      renderHousehold();
      renderResults();
      out.textContent = "読み込みました（在庫 " + state.items.length + "件）。" +
        (r.errors.length ? "取り込めなかった在庫: " + r.errors.slice(0, 5).join("、") + (r.errors.length > 5 ? " ほか" : "") : "");
      input.value = "";
    };
    reader.onerror = function () { out.textContent = "ファイルを読めませんでした。"; input.value = ""; };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!window.confirm("家族構成と在庫をすべて消去します。元に戻せません。よろしいですか？")) return;
    state = S.defaultState();
    try { window.localStorage.removeItem(S.STORAGE_KEY); } catch (e) { /* 保存できない環境 */ }
    renderHousehold();
    renderResults();
    $("data-result").textContent = "消去しました。";
  }

  // ---- 初期化 ----
  $("storage-warning").hidden = storageOk;
  if (loadProblem) $("data-result").textContent = loadProblem;
  $("f-qty").setAttribute("data-focus", "add-qty");
  // タブを開いたまま日付が変わっても、期限の表示を最新にする
  document.addEventListener("visibilitychange", function () { if (!document.hidden) renderResults(); });
  renderHousehold();
  renderSelect();
  renderResults();
  $("add-form").addEventListener("submit", addItem);
  $("copy-shopping").addEventListener("click", copyShopping);
  $("export").addEventListener("click", exportData);
  $("import").addEventListener("change", importData);
  $("clear").addEventListener("click", clearAll);
})();
