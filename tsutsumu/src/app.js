/* つつむ — 画面の描画とイベント処理。DOM には textContent / createElement だけで書き込む。 */
(function () {
  "use strict";
  const T = window.Tsutsumu;
  const STORE_KEY = "tsutsumu.records.v1";
  const MAX_IMPORT_BYTES = 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  const state = { occasion: "wedding", relation: "coworker", age: "30s", religion: "unknown" };

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "text") n.textContent = attrs[k];
        else if (k === "class") n.className = attrs[k];
        else n.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => c && n.appendChild(c));
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function chips(container, name, items, selected, onChange) {
    clear(container);
    items.forEach((it) => {
      const id = name + "-" + it.key;
      const input = el("input", { type: "radio", name, id, value: it.key });
      input.checked = it.key === selected;
      input.addEventListener("change", () => onChange(it.key));
      container.appendChild(el("label", { class: "chip", for: id }, [input, el("span", { text: it.label })]));
    });
  }

  function intValue(input) {
    const v = input.value.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : NaN;
  }

  const fmt = T.formatYen;

  // 場面のボタン群は最初に1回だけ作る（作り直すとキーボードのフォーカスが失われるため）
  function renderOccasions() {
    const occs = Object.keys(T.OCCASIONS).map((k) => ({ key: k, label: T.OCCASIONS[k].label }));
    chips($("occasions"), "occasion", occs, state.occasion, (k) => {
      state.occasion = k;
      const rels = T.relationsFor(k);
      if (!rels.some((r) => r.key === state.relation)) state.relation = rels[0].key;
      $("custom-amount").value = "";
      renderInputs();
      update();
    });
  }

  function renderInputs() {
    const isOtoshidama = state.occasion === "otoshidama";
    $("relation-legend").textContent = isOtoshidama ? "子どもの年齢" : "相手との関係";
    chips($("relations"), "relation", T.relationsFor(state.occasion), state.relation, (k) => { state.relation = k; update(); });
    $("age-field").hidden = isOtoshidama;
    if (!$("ages").firstChild) chips($("ages"), "age", Object.keys(T.AGES).map((k) => ({ key: k, label: T.AGES[k] })), state.age, (k) => { state.age = k; update(); });
    const needsReligion = T.OCCASIONS[state.occasion].kind === "condolence";
    $("religion-field").hidden = !needsReligion;
    if (!$("religions").firstChild) chips($("religions"), "religion", Object.keys(T.RELIGIONS).map((k) => ({ key: k, label: T.RELIGIONS[k] })), state.religion, (k) => { state.religion = k; update(); });
    $("people-row").hidden = isOtoshidama;
    $("name-label").textContent = isOtoshidama ? "子どもの名前（見本の表示用）" : "名前（見本の表示用）";
    $("rec-occasion").textContent = T.OCCASIONS[state.occasion].label;
  }

  function readInput() {
    const people = intValue($("people"));
    const per = intValue($("per-person"));
    const custom = intValue($("custom-amount"));
    return {
      occasion: state.occasion,
      relation: state.relation,
      age: state.age,
      religion: state.religion,
      // 検査は engine.plan() に任せる（範囲外の値は inputErrors として返る）
      people: people === null ? 1 : people,
      perPerson: per === null ? undefined : per,
      amount: custom === null ? undefined : custom,
    };
  }

  const LEVEL = { ng: "避ける", caution: "注意", info: "参考" };

  function update() {
    try {
      render(readInput());
    } catch (e) {
      // 想定外の入力でも画面を止めない
      const checks = $("r-checks");
      clear(checks);
      checks.appendChild(el("li", { class: "check ng" }, [el("strong", { text: "エラー" }), el("span", { text: "表示できませんでした。入力を見直してください。" })]));
    }
  }

  function render(input) {
    const p = T.plan(input);
    document.body.dataset.group = p.group;

    const multi = p.joint !== null;
    $("per-row").hidden = !(multi && !p.joint.fixed);
    if (multi && !$("per-person").value) $("per-person").placeholder = String(T.DEFAULT_PER_PERSON[p.kind]);

    // 概要
    $("r-occasion").textContent = T.OCCASIONS[p.occasion].label + "（" +
      (p.occasion === "otoshidama" ? T.CHILD_AGES[input.relation] : T.RELATIONS[input.relation]) + "）";
    $("r-amount").textContent = fmt(p.amount);
    const r = p.suggestion.range;
    $("r-range").textContent = multi
      ? p.people + "人の連名での合計（1人あたり " + fmt(p.joint.share) + "）"
      : "1人分の目安 " + (r[0] === r[1] ? fmt(r[0]) : fmt(r[0]) + "〜" + fmt(r[1])) +
        (p.amount !== p.suggestion.recommended ? "／おすすめ " + fmt(p.suggestion.recommended) : "");

    const alts = $("r-alts");
    clear(alts);
    const custom = $("custom-amount").value.trim() !== "";
    const altValues = p.safeAlternatives.length ? p.safeAlternatives : (custom || multi ? [] : p.suggestion.alternatives);
    if (altValues.length) {
      alts.appendChild(el("span", { class: "alts-label", text: p.safeAlternatives.length ? "代わりの金額:" : "ほかの候補:" }));
      altValues.forEach((v) => {
        const b = el("button", { type: "button", class: "alt", text: fmt(v) });
        b.addEventListener("click", () => { $("custom-amount").value = String(v); $("more").open = true; update(); });
        alts.appendChild(b);
      });
    }
    if (custom) {
      const reset = el("button", { type: "button", class: "alt ghost", text: "おすすめに戻す" });
      reset.addEventListener("click", () => { $("custom-amount").value = ""; update(); });
      alts.appendChild(reset);
    }

    const checks = $("r-checks");
    clear(checks);
    p.inputErrors.forEach((m) => {
      checks.appendChild(el("li", { class: "check ng" }, [el("strong", { text: "入力" }), el("span", { text: m })]));
    });
    if (!p.checks.length && !p.inputErrors.length) {
      checks.appendChild(el("li", { class: "check ok" }, [el("strong", { text: "OK" }), el("span", { text: "避けたほうがよい点は見つかりませんでした。" })]));
    }
    p.checks.forEach((c) => {
      checks.appendChild(el("li", { class: "check " + c.level }, [el("strong", { text: LEVEL[c.level] }), el("span", { text: c.message })]));
    });

    // 袋の見本
    const name = $("name").value.trim().slice(0, 20);
    $("pv-omote").textContent = p.omotegaki.main;
    $("pv-omote").dataset.len = String(Math.min(5, Math.max(3, p.omotegaki.main.length)));
    // 縦書きの見本では空白を詰める（折り返して文字が重ならないように）
    const shown = (p.occasion === "otoshidama" ? (name || "〇〇") + "ちゃんへ" : (multi && p.people >= 4 ? "〇〇一同" : name || "山田太郎")).replace(/\s+/g, "");
    $("pv-name").textContent = shown;
    $("pv-name").dataset.len = shown.length > 6 ? "long" : "short";
    $("preview").dataset.ink = p.omotegaki.inkLevel;
    $("preview").dataset.kind = p.kind;

    const env = $("r-envelope");
    clear(env);
    const facts = [
      ["袋", p.envelope.type],
      ["水引", p.envelope.mizuhiki + "・" + p.envelope.color],
      ["のし", p.envelope.noshi ? "付ける" : "付けない"],
      ["袋の格", p.envelope.grade],
    ];
    facts.forEach(([k, v]) => { env.appendChild(el("dt", { text: k })); env.appendChild(el("dd", { text: v })); });
    env.appendChild(el("dd", { class: "why", text: p.envelope.mizuhikiWhy + (p.envelope.noshiWhy ? " " + p.envelope.noshiWhy : "") }));

    // お札
    const bills = $("r-bills");
    clear(bills);
    bills.appendChild(el("p", { class: "big", text: p.bills.bills.map((b) => (b.value >= 1000 ? fmt(b.value) + "札" : fmt(b.value) + "玉") + "×" + b.count).join(" ＋ ") || "—" }));
    bills.appendChild(el("p", { text: p.bills.newBillText }));
    bills.appendChild(el("p", { text: p.bills.direction }));
    p.bills.notes.forEach((n) => bills.appendChild(el("p", { class: "note", text: n })));

    // 表書き
    const om = $("r-omote");
    clear(om);
    om.appendChild(el("p", { class: "big", text: "「" + p.omotegaki.main + "」" }));
    if (p.omotegaki.alternatives.length) om.appendChild(el("p", { text: "ほかに: " + p.omotegaki.alternatives.map((a) => "「" + a + "」").join(" ") }));
    om.appendChild(el("p", { text: "墨: " + p.omotegaki.ink }));
    if (p.omotegaki.note) om.appendChild(el("p", { class: "note", text: p.omotegaki.note }));

    // 名前
    const nm = $("r-names");
    clear(nm);
    nm.appendChild(el("ul", null, p.names.map((t) => el("li", { text: t }))));

    // 中袋
    const nk = $("r-naka");
    clear(nk);
    if (p.occasion === "otoshidama") {
      nk.appendChild(el("p", { text: "ポチ袋に中袋はありません。金額を書く必要もありません。" }));
    } else {
      nk.appendChild(el("p", { class: "big daiji", text: p.daiji }));
      nk.appendChild(el("p", { text: "表の中央に金額を縦書きで、裏の左下に住所と名前を書きます。漢数字は書き換えを防ぐため、壱・弐・参・萬などの大字（だいじ）を使います。" }));
      if (p.kind === "condolence") nk.appendChild(el("p", { class: "note", text: "中袋は薄墨でなくても構いません（読みやすさを優先）。" }));
    }

    // お返し
    const rt = $("r-return");
    clear(rt);
    const g = p.returnGift;
    if (g.needed && g.range) {
      rt.appendChild(el("p", { class: "big", text: g.name + " " + fmt(g.range[0]) + "〜" + fmt(g.range[1]) }));
      rt.appendChild(el("p", { text: "時期: " + g.timing }));
    } else {
      rt.appendChild(el("p", { class: "big", text: g.name ? g.name + "（" + g.timing + "）" : "基本は不要" }));
    }
    rt.appendChild(el("p", { class: "note", text: g.note }));

    // 連名
    $("joint-card").hidden = !multi;
    const jt = $("r-joint");
    clear(jt);
    if (multi) {
      const j = p.joint;
      jt.appendChild(el("p", { class: "big", text: "合計 " + fmt(j.total) + "／1人 " + fmt(j.share) }));
      jt.appendChild(el("p", { text: j.fixed
        ? "指定した " + fmt(j.total) + " を " + j.people + "人で分けた額です。"
        : j.people + "人 × " + fmt(j.perPerson) + " ＝ " + fmt(j.raw) + (j.total !== j.raw ? "。避けたい金額にならないよう、合計を " + fmt(j.total) + " にしています。" : "。") }));
      if (j.surplus > 0) jt.appendChild(el("p", { class: "note", text: "1人 " + fmt(j.share) + " ずつ集めると " + fmt(j.surplus) + " 余ります。代表者が調整しましょう。" }));
    }

    if (!$("rec-amount").dataset.touched) $("rec-amount").value = String(p.amount);
  }

  // ---- 記録 ----
  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  const BACKUP_KEY = "tsutsumu.records.backup";

  // 保存データに読めない行があれば、上書きで消える前に元の文字列を退避する
  function loadRecords() {
    const s = storage();
    if (!s) return [];
    try {
      const raw = s.getItem(STORE_KEY);
      if (!raw) return [];
      const res = T.parseRecords(raw);
      if ((res.error || res.skipped > 0) && s.getItem(BACKUP_KEY) !== raw) {
        s.setItem(BACKUP_KEY, raw);
        storageWarning = "保存データの一部（" + (res.error ? "全体" : res.skipped + "件") + "）を読めなかったため、元のデータをこのブラウザ内に退避しました（" + BACKUP_KEY + "）。";
      }
      return res.records;
    } catch (e) { return []; }
  }
  let storageWarning = "";

  function saveRecords(list) {
    const s = storage();
    if (!s) return false;
    try { s.setItem(STORE_KEY, JSON.stringify({ version: 1, records: list })); return true; } catch (e) { return false; }
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const a = new Uint8Array(16);
    window.crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function setMsg(text, isError) {
    const m = $("rec-msg");
    m.textContent = text;
    m.classList.toggle("error", !!isError);
  }

  function renderRecords() {
    const list = loadRecords().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const body = $("rec-body");
    clear(body);
    $("rec-empty").hidden = list.length > 0;
    list.forEach((r) => {
      const g = r.direction === "received" && r.amount > 0 ? T.returnGift(r.occasion, r.amount) : null;
      const ret = g && g.needed && g.range ? fmt(g.range[0]) + "〜" + fmt(g.range[1]) : "—";
      const del = el("button", { type: "button", class: "btn small", text: "削除", "aria-label": r.person + " の記録を削除" });
      del.addEventListener("click", () => {
        if (!window.confirm("「" + r.person + "」の記録を削除しますか？")) return;
        const ok = saveRecords(loadRecords().filter((x) => x.id !== r.id));
        renderRecords();
        setMsg(ok ? "削除しました。" : "削除を保存できませんでした。", !ok);
      });
      const tr = el("tr", null, [
        el("td", { text: r.date }),
        el("td", { text: r.direction === "gave" ? "贈った" : "いただいた" }),
        el("td", { class: "person" }, [el("span", { text: r.person }), r.note ? el("small", { text: r.note }) : null]),
        el("td", { text: T.OCCASIONS[r.occasion].label }),
        el("td", { class: "num", text: r.amount ? fmt(r.amount) : "品物" }),
        el("td", { class: "num", text: ret }),
        el("td", null, [del]),
      ]);
      body.appendChild(tr);
    });
  }

  function onRecordSubmit(e) {
    e.preventDefault();
    const dir = document.querySelector('input[name="direction"]:checked');
    const amount = intValue($("rec-amount"));
    const raw = {
      id: newId(),
      direction: dir ? dir.value : "",
      date: $("rec-date").value,
      person: $("rec-person").value,
      occasion: state.occasion,
      amount: amount === null ? NaN : amount,
      note: $("rec-note").value,
    };
    const v = T.validateRecord(raw);
    if (!v.ok) { setMsg(v.errors.join(" "), true); return; }
    const list = loadRecords();
    if (list.length >= T.RECORD_LIMITS.maxRecords) { setMsg("記録は" + T.RECORD_LIMITS.maxRecords + "件までです。古い記録を削除してください。", true); return; }
    list.push(v.value);
    if (!saveRecords(list)) { setMsg("保存できませんでした（ブラウザの設定で保存が無効になっている可能性があります）。", true); return; }
    $("rec-person").value = "";
    $("rec-note").value = "";
    delete $("rec-amount").dataset.touched;
    renderRecords();
    setMsg("記録しました（この端末にだけ保存）。");
  }

  function onExport() {
    const list = loadRecords();
    if (!list.length) { setMsg("書き出す記録がありません。", true); return; }
    const blob = new Blob([JSON.stringify({ version: 1, app: "tsutsumu", records: list }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "tsutsumu-records.json" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(list.length + "件を書き出しました。ファイルには相手の名前と金額が含まれるため、取り扱いに注意してください。");
  }

  function onImport(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setMsg("ファイルが大きすぎます（1MBまで）。", true); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const res = T.parseRecords(String(reader.result));
      if (res.error) { setMsg(res.error, true); return; }
      const current = loadRecords();
      const ids = new Set(current.map((r) => r.id));
      const added = res.records.filter((r) => !ids.has(r.id));
      const merged = current.concat(added).slice(0, T.RECORD_LIMITS.maxRecords);
      const dropped = current.length + added.length - merged.length;
      if (!saveRecords(merged)) { setMsg("保存できませんでした。", true); return; }
      renderRecords();
      setMsg(added.length + "件を読み込みました。" + (res.skipped ? "形式が正しくない" + res.skipped + "件は読み飛ばしました。" : "") +
        (added.length < res.records.length ? "重複した" + (res.records.length - added.length) + "件は除きました。" : "") +
        (dropped > 0 ? "上限を超えた" + dropped + "件は読み込んでいません。" : ""));
    };
    reader.onerror = () => setMsg("ファイルを読み込めませんでした。", true);
    reader.readAsText(file);
  }

  function onClear() {
    if (!loadRecords().length) { setMsg("削除する記録がありません。"); return; }
    if (!window.confirm("保存したすべての記録を削除します。元に戻せません。よろしいですか？")) return;
    const s = storage();
    try { if (s) s.removeItem(STORE_KEY); } catch (e) { /* 何もしない */ }
    renderRecords();
    setMsg("すべての記録を削除しました。");
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function init() {
    renderOccasions();
    renderInputs();
    ["people", "per-person", "custom-amount", "name"].forEach((id) => $(id).addEventListener("input", update));
    $("form").addEventListener("submit", (e) => e.preventDefault());
    $("rec-amount").addEventListener("input", () => { $("rec-amount").dataset.touched = "1"; });
    $("rec-date").value = todayISO();
    $("record-form").addEventListener("submit", onRecordSubmit);
    $("rec-export").addEventListener("click", onExport);
    $("rec-import").addEventListener("change", onImport);
    $("rec-clear").addEventListener("click", onClear);
    update();
    renderRecords();
    if (storageWarning) setMsg(storageWarning, true);
  }

  init();
})();
