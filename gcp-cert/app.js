/* ============================================================
   くもみち — Google Cloud 認定 全冠ナビ
   依存ライブラリなし。状態は localStorage（キー: kumomichi.v1）のみに保存。
   ============================================================ */
(function () {
  "use strict";

  const GC = window.GC;
  const CERTS = GC.certs;
  const BY_ID = Object.fromEntries(CERTS.map(c => [c.id, c]));
  const Q = GC.q;
  const Q_BY_ID = Object.fromEntries(Q.map(q => [q.id, q]));
  const NOTES = GC.notes || [];
  const CAT = {
    basic:    { ja: "基礎", cls: "acc",  desc: "用語・仕組み・前提知識" },
    advanced: { ja: "応用", cls: "warn", desc: "設計判断・組み合わせ・シナリオ" },
    frequent: { ja: "頻出", cls: "ng",   desc: "よく問われる「この要件ならこれ」" }
  };
  const Q_BY_CERT = {};
  CERTS.forEach(c => { Q_BY_CERT[c.id] = Q.filter(q => q.c === c.id); });

  /* 合格ラインは非公開。本アプリの模試では目安として 70% を使う */
  const PASS_MARK = 0.7;
  const MOCK_MAX = 50;
  /* 間隔反復（Leitner 方式）の箱ごとの復習間隔（日） */
  const BOX_DAYS = [0, 1, 3, 7, 16, 35];
  const STATUS = {
    none:      { ja: "未着手", cls: "" },
    studying:  { ja: "学習中", cls: "acc" },
    scheduled: { ja: "受験予定", cls: "warn" },
    passed:    { ja: "合格", cls: "ok" }
  };

  /* ---------------- storage ---------------- */
  const KEY = "kumomichi.v1";
  const blank = () => ({ certs: {}, ans: {}, mocks: [], known: {}, plan: { hpw: 8, level: "std", start: "" }, theme: "auto" });
  let st = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) st = Object.assign(blank(), JSON.parse(raw));
  } catch (_) { /* 読めなければ初期状態で動かす */ }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) { toast("この環境では進捗を保存できません"); }
  }
  const cs = id => (st.certs[id] = st.certs[id] || { status: "none", examDate: "", passedAt: "" });

  /* ---------------- helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const app = $("#app");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  /* 解説中の `code` をインラインコードとして表示（エスケープ後に置換） */
  const rich = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const pct = x => Math.round(x * 100);
  const todayStr = () => ymd(new Date());
  function ymd(d) { const z = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
  function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function addYears(s, n) { const d = parseYmd(s); d.setFullYear(d.getFullYear() + n); return ymd(d); }
  function daysUntil(s) { return Math.round((parseYmd(s) - parseYmd(todayStr())) / 86400000); }
  function jpDate(s) { if (!s) return "—"; const d = parseYmd(s); return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"; }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400); }
  const levelJa = c => GC.levels[c.level].ja;

  /* ---------------- learning stats ---------------- */
  function record(qid, ok) {
    const a = st.ans[qid] || { n: 0, ok: 0, box: 0, due: "", last: null };
    a.n++; if (ok) a.ok++;
    a.last = ok;
    a.box = ok ? Math.min(a.box + 1, BOX_DAYS.length - 1) : 0;
    a.due = addDays(todayStr(), BOX_DAYS[a.box]);
    st.ans[qid] = a;
  }
  function certStats(id) {
    const qs = Q_BY_CERT[id];
    const c = BY_ID[id];
    let answered = 0, lastOk = 0, mastered = 0;
    const dom = c.domains.map(() => ({ n: 0, ok: 0, total: 0 }));
    qs.forEach(q => {
      const a = st.ans[q.id];
      dom[q.d].total++;
      if (!a) return;
      answered++;
      if (a.last) lastOk++;
      if (a.box >= 2) mastered++;
      dom[q.d].n++; if (a.last) dom[q.d].ok++;
    });
    const mocks = st.mocks.filter(m => m.c === id);
    const best = mocks.length ? Math.max(...mocks.map(m => m.score / m.total)) : null;
    return { total: qs.length, answered, acc: answered ? lastOk / answered : null, mastery: qs.length ? mastered / qs.length : 0, dom, best, mocks };
  }
  function dueList(certId) {
    const t = todayStr();
    return Q.filter(q => (!certId || q.c === certId) && st.ans[q.id] && st.ans[q.id].due <= t);
  }
  /* 準備度: 定着率 60% + 模試ベスト 40%（模試未受験なら正答率で代替）。あくまで本アプリ内の目安 */
  function readiness(id) {
    const s = certStats(id);
    const b = s.best != null ? s.best : (s.acc || 0) * (s.answered / Math.max(s.total, 1));
    return Math.round((s.mastery * 0.6 + b * 0.4) * 100);
  }
  function expiry(c) {
    const x = cs(c.id);
    if (x.status !== "passed" || !x.passedAt) return null;
    const exp = addYears(x.passedAt, c.validity);
    const winDays = c.level === "professional" ? 60 : 180;
    return { exp, window: addDays(exp, -winDays), left: daysUntil(exp) };
  }

  /* ---------------- theme ---------------- */
  function applyTheme() { document.documentElement.setAttribute("data-theme", st.theme || "auto"); }
  applyTheme();
  $("#themeBtn").addEventListener("click", () => {
    const dark = st.theme === "dark" || (st.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    st.theme = dark ? "light" : "dark"; applyTheme(); save();
  });

  /* ---------------- router ---------------- */
  let session = null;   // 進行中の演習
  let timerId = null;
  function route() {
    clearInterval(timerId);
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean);
    document.querySelectorAll(".nav a").forEach(a => {
      const target = a.getAttribute("href").slice(1);
      a.toggleAttribute("aria-current", target === "/" ? parts.length === 0 : path.startsWith(target));
      if (a.hasAttribute("aria-current")) a.setAttribute("aria-current", "page");
    });
    if (parts[0] === "cert" && BY_ID[parts[1]]) viewCert(BY_ID[parts[1]]);
    else if (parts[0] === "quiz") viewQuizStart(params);
    else if (parts[0] === "learn" && parts[1] === "flash") viewFlash(params);
    else if (parts[0] === "learn") viewLearn(params);
    else if (parts[0] === "review") viewReview();
    else if (parts[0] === "plan") viewPlan();
    else if (parts[0] === "updates") viewUpdates();
    else if (parts[0] === "settings") viewSettings();
    else viewHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ============================================================
     HOME
     ============================================================ */
  function ring(frac, big, sub) {
    const r = 70, C = 2 * Math.PI * r;
    return `<div class="ring" role="img" aria-label="${esc(big + " " + sub)}">
      <svg viewBox="0 0 168 168"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8cf7"/><stop offset="1" stop-color="#9a5cf0"/></linearGradient></defs>
      <circle cx="84" cy="84" r="${r}" fill="none" stroke="var(--surface-sunk)" stroke-width="14"/>
      <circle cx="84" cy="84" r="${r}" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
      <div class="lbl"><b class="tnum">${esc(big)}</b><span>${esc(sub)}</span></div></div>`;
  }
  function certCard(c) {
    const x = cs(c.id), s = certStats(c.id), S = STATUS[x.status];
    const r = readiness(c.id);
    const exp = expiry(c);
    let meta = `<span>${c.hours}h目安・$${c.fee}</span><span class="tnum">準備度 ${r}%</span>`;
    if (exp) meta = `<span>有効期限 ${esc(exp.exp)}</span><span class="${exp.left < 90 ? "chip warn" : ""}">${exp.left >= 0 ? "残り" + exp.left + "日" : "失効"}</span>`;
    else if (x.examDate) meta = `<span>受験予定 ${esc(x.examDate)}</span><span class="tnum">準備度 ${r}%</span>`;
    return `<a class="cc ${x.status === "passed" ? "passed" : ""}" href="#/cert/${c.id}" style="--c:${c.color}">
      <div class="cc-top"><span class="cc-abbr">${esc(c.abbr)} · ${esc(levelJa(c))}${c.beta ? " · β" : ""}</span><span class="chip ${S.cls}">${S.ja}</span></div>
      <div class="cc-name">${esc(c.name)}</div>
      <div class="bar" aria-hidden="true"><i style="width:${pct(s.mastery)}%;background:${c.color}"></i></div>
      <div class="cc-meta">${meta}</div></a>`;
  }
  function viewHome() {
    const passed = CERTS.filter(c => cs(c.id).status === "passed");
    const remainFee = CERTS.filter(c => cs(c.id).status !== "passed").reduce((a, c) => a + c.fee, 0);
    const answered = Object.keys(st.ans).filter(k => Q_BY_ID[k]);
    const okCount = answered.filter(k => st.ans[k].last).length;
    const due = dueList().length;
    const next = GC.phases.flatMap(p => p.ids).map(id => BY_ID[id]).find(c => cs(c.id).status === "studying" || cs(c.id).status === "scheduled")
      || GC.phases.flatMap(p => p.ids).map(id => BY_ID[id]).find(c => cs(c.id).status !== "passed");
    const renew = CERTS.map(c => ({ c, e: expiry(c) })).filter(o => o.e && o.e.left <= 200).sort((a, b) => a.e.left - b.e.left)[0];
    const hoursLeft = CERTS.filter(c => cs(c.id).status !== "passed").reduce((a, c) => a + c.hours, 0);

    app.innerHTML = `
      <section class="card pad hero">
        ${ring(passed.length / CERTS.length, passed.length + " / " + CERTS.length, "全冠まで")}
        <div>
          <div class="eyebrow">Google Cloud Certification · ${CERTS.length} exams</div>
          <h1>${passed.length === CERTS.length ? "全冠達成、おめでとうございます。" : "全冠まで、あと " + (CERTS.length - passed.length) + " 資格。"}</h1>
          <p>現行の Google Cloud 認定 ${CERTS.length} 種（ベータ含む）の出題範囲・最新の変更点・演習・模試・学習計画をひとつに。情報は ${esc(GC.meta.checkedAt)} 時点。</p>
          <div class="stats">
            <div class="stat"><span>合格済み</span><b class="tnum">${passed.length}<small>/ ${CERTS.length}</small></b></div>
            <div class="stat"><span>残りの受験料（定価）</span><b class="tnum">$${remainFee.toLocaleString()}</b></div>
            <div class="stat"><span>残り学習時間の目安</span><b class="tnum">${hoursLeft}<small>h</small></b></div>
            <div class="stat"><span>演習の正答率</span><b class="tnum">${answered.length ? pct(okCount / answered.length) + "<small>%</small>" : "—"}</b></div>
          </div>
        </div>
      </section>

      <h2 class="section-title">今日やること</h2>
      <div class="today">
        <div class="card pad"><h3>復習（間隔反復）</h3><div class="big tnum">${due}<small class="muted small"> 問</small></div>
          <p class="small muted" style="margin:0">前回間違えた問題・復習時期が来た問題。</p>
          <a class="btn ${due ? "primary" : ""} sm" href="#/quiz?mode=review">${due ? "復習をはじめる" : "復習はありません"}</a></div>
        <div class="card pad"><h3>次に取り組む資格</h3>
          ${next ? `<div class="big" style="font-size:19px">${esc(next.name)}</div>
          <p class="small muted" style="margin:0">${esc(next.abbr)} · 準備度 ${readiness(next.id)}% · 演習 ${Q_BY_CERT[next.id].length} 問</p>
          <a class="btn primary sm" href="#/quiz?c=${next.id}&mode=practice">10問だけ解く</a>` : `<div class="big" style="font-size:19px">全資格 合格済み</div><p class="small muted" style="margin:0">更新期限を確認しましょう。</p>`}</div>
        <div class="card pad"><h3>更新（Renewal）</h3>
          ${renew ? `<div class="big" style="font-size:19px">${esc(renew.c.abbr)}：残り ${renew.e.left} 日</div>
          <p class="small muted" style="margin:0">有効期限 ${esc(jpDate(renew.e.exp))}。更新受験は ${esc(jpDate(renew.e.window))} ごろから（目安）。</p>
          <a class="btn sm" href="#/cert/${renew.c.id}">詳細を見る</a>` : `<div class="big" style="font-size:19px">期限が近い資格なし</div><p class="small muted" style="margin:0">合格日を登録すると有効期限と更新時期を表示します。</p>`}</div>
      </div>

      <h2 class="section-title">全冠ロードマップ <small>重なりの大きい順に積み上げる推奨順（本アプリの提案）</small></h2>
      <div class="card pad">
        ${GC.phases.map(p => `<div class="phase">
          <div><div class="phase-n">PHASE ${p.n}</div><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p></div>
          <div class="certs">${p.ids.map(id => certCard(BY_ID[id])).join("")}</div></div>`).join("")}
      </div>

      <h2 class="section-title">出題範囲の重なり <small>先に取った資格の知識が次に効く組み合わせ</small></h2>
      <div class="card pad scroll-x">
        <table class="tbl"><thead><tr><th>資格</th><th>→ 次の資格</th><th>共通する論点</th></tr></thead><tbody>
        ${GC.overlaps.map(o => `<tr><td><a href="#/cert/${o.a}">${esc(BY_ID[o.a].abbr)}</a></td><td><a href="#/cert/${o.b}">${esc(BY_ID[o.b].abbr)}</a></td><td>${esc(o.why)}</td></tr>`).join("")}
        </tbody></table>
      </div>
      ${footer()}`;
  }

  function footer() {
    return `<p class="foot">本アプリは Google の公式サービスではありません。演習問題は公開されている出題範囲をもとに作成したオリジナル問題で、実際の試験問題ではありません。
      試験情報は <a href="${GC.meta.hub}" target="_blank" rel="noopener">公式の認定資格ページ</a> を ${esc(GC.meta.checkedAt)} に確認した内容です。受験前に必ず公式の試験ガイドを確認してください。</p>`;
  }

  /* ============================================================
     CERT DETAIL
     ============================================================ */
  function weightBadge(c) {
    if (c.weightSrc === "official-html") return `<span class="chip ok">配点: 公式HTML</span>`;
    if (c.weightSrc === "secondary") return `<span class="chip warn">配点: 二次情報</span>`;
    return `<span class="chip">配点: 未確認</span>`;
  }
  function viewCert(c) {
    const x = cs(c.id), s = certStats(c.id), exp = expiry(c);
    const url = `https://cloud.google.com/learn/certification/${c.slug}`;
    const wrongN = Q_BY_CERT[c.id].filter(q => st.ans[q.id] && st.ans[q.id].last === false).length;
    const dueN = dueList(c.id).length;
    app.innerHTML = `
      <div class="page-head">
        <div class="eyebrow"><a href="#/" style="text-decoration:none">ホーム</a> / ${esc(levelJa(c))}</div>
        <div class="cert-head">
          <div class="badge" style="--c:${c.color}">${esc(c.abbr)}</div>
          <div><h1>${esc(c.name)}${c.beta ? ' <span class="chip warn" style="vertical-align:middle">Beta</span>' : ""}</h1>
          <p>${esc(GC.levels[c.level].label)} · ${c.length}分 · ${esc(c.questions)}${/^[\d-]+$/.test(c.questions) ? " 問" : ""} · $${c.fee}${c.feeNote ? "（" + esc(c.feeNote) + "）" : ""}</p></div>
        </div>
      </div>
      <div class="detail">
        <div class="grid">
          <section class="card pad">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
              <h2 style="margin:0;font-size:17px">出題範囲（ドメイン）</h2>${weightBadge(c)}</div>
            <p class="note" style="margin:0 0 16px">${esc(c.weightNote)}。ドメイン名は公式ページで確認済み。箇条書きは本アプリの学習メモ（公式ガイドの転載ではありません）。</p>
            ${c.domains.map((d, i) => {
              const ds = s.dom[i];
              const acc = ds.n ? ds.ok / ds.n : null;
              return `<div class="dom">
                <div class="dom-h"><b>${i + 1}. ${esc(d.t)}</b><span class="w tnum">${d.w != null ? "~" + d.w + "%" : "—"}</span></div>
                <div class="en">${esc(d.en)}</div>
                ${d.w != null ? `<div class="bar" style="height:5px;max-width:320px"><i style="width:${Math.min(d.w * 2.5, 100)}%;background:${c.color}"></i></div>` : ""}
                <ul>${d.topics.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
                <div class="acc-row"><span>演習 ${ds.n}/${ds.total}</span><div class="bar"><i style="width:${acc == null ? 0 : pct(acc)}%;background:${acc != null && acc < .6 ? "var(--ng)" : "var(--ok)"}"></i></div>
                  <span class="tnum">${acc == null ? "未回答" : "正答率 " + pct(acc) + "%"}</span>
                  <a class="btn sm ghost" href="#/learn?c=${c.id}&d=${i}">ノート ${NOTES.filter(n => n.c === c.id && n.d === i).length}</a>
                  <a class="btn sm ghost" href="#/quiz?c=${c.id}&mode=practice&d=${i}">このドメインを解く</a></div>
              </div>`;
            }).join("")}
          </section>
          <section class="card pad">
            <h2 style="margin:0 0 10px;font-size:17px">試験情報</h2>
            <table class="kv">
              <tr><th>試験時間</th><td>${c.length}分</td></tr>
              <tr><th>形式・問題数</th><td>${esc(c.questions)}（多肢選択・複数選択）</td></tr>
              <tr><th>受験料</th><td>$${c.fee}（税別）${c.feeNote ? "<br><span class='small muted'>" + esc(c.feeNote) + "</span>" : ""}</td></tr>
              <tr><th>言語</th><td>${c.languages.map(esc).join("・")}</td></tr>
              <tr><th>有効期間</th><td>${c.validity}年</td></tr>
              <tr><th>推奨経験</th><td>${esc(c.experience)}</td></tr>
              <tr><th>受験方法</th><td>オンライン監督またはテストセンター（Pearson VUE）</td></tr>
              <tr><th>最新の変更</th><td>${esc(c.update)}</td></tr>
              <tr><th>公式リンク</th><td><a href="${url}" target="_blank" rel="noopener">資格ページ</a> · <a href="${esc(c.guide)}" target="_blank" rel="noopener">試験ガイド（PDF）</a></td></tr>
            </table>
          </section>
        </div>
        <aside class="side">
          <section class="card pad">
            <h2 style="margin:0 0 12px;font-size:16px">演習する</h2>
            <div class="grid" style="gap:8px">
              <a class="btn primary" href="#/quiz?c=${c.id}&mode=practice">ランダム10問（解説つき）</a>
              <a class="btn" href="#/quiz?c=${c.id}&mode=mock">模擬試験（${Math.min(Q_BY_CERT[c.id].length, MOCK_MAX)}問・時間制限）</a>
              <a class="btn ${dueN ? "" : ""}" href="#/quiz?c=${c.id}&mode=review" ${dueN ? "" : "aria-disabled='true' disabled"}>復習 ${dueN}問</a>
              <a class="btn" href="#/quiz?c=${c.id}&mode=wrong" ${wrongN ? "" : "aria-disabled='true' disabled"}>前回まちがえた ${wrongN}問</a>
            </div>
            <div style="margin-top:14px" class="small">
              <div style="display:flex;justify-content:space-between"><span class="muted">定着率</span><b class="tnum">${pct(s.mastery)}%</b></div>
              <div class="bar" style="margin:4px 0 10px"><i style="width:${pct(s.mastery)}%;background:${c.color}"></i></div>
              <div style="display:flex;justify-content:space-between"><span class="muted">回答済み</span><span class="tnum">${s.answered} / ${s.total}</span></div>
              <div style="display:flex;justify-content:space-between"><span class="muted">模試ベスト</span><span class="tnum">${s.best == null ? "—" : pct(s.best) + "%"}</span></div>
              <div style="display:flex;justify-content:space-between"><span class="muted">準備度（目安）</span><b class="tnum">${readiness(c.id)}%</b></div>
            </div>
          </section>
          <section class="card pad">
            <h2 style="margin:0 0 4px;font-size:16px">学習ノート</h2>
            <p class="small muted" style="margin:0 0 10px">覚えた ${notesFor(c.id).filter(n => st.known[n.id]).length} / ${notesFor(c.id).length}（共通ノート含む）</p>
            <div class="grid" style="gap:8px">
              ${Object.entries(CAT).map(([k, v]) => `<a class="btn sm" style="justify-content:space-between" href="#/learn?c=${c.id}&cat=${k}"><span><span class="chip ${v.cls}">${v.ja}</span> ${esc(v.desc)}</span><span class="tnum">${notesFor(c.id).filter(n => n.cat === k).length}</span></a>`).join("")}
              <a class="btn primary sm" href="#/learn/flash?c=${c.id}">フラッシュカード（${pairsFor(notesFor(c.id)).length}枚）</a>
            </div>
          </section>
          <section class="card pad">
            <h2 style="margin:0 0 12px;font-size:16px">わたしの状況</h2>
            <div class="field"><label for="f-status">ステータス</label>
              <select id="f-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${x.status === k ? "selected" : ""}>${v.ja}</option>`).join("")}</select></div>
            <div class="field"><label for="f-exam">受験予定日</label><input type="date" id="f-exam" value="${esc(x.examDate)}"></div>
            <div class="field"><label for="f-pass">合格日</label><input type="date" id="f-pass" value="${esc(x.passedAt)}"></div>
            ${exp ? `<p class="small" style="margin:6px 0 0">有効期限 <b>${esc(jpDate(exp.exp))}</b>（${exp.left >= 0 ? "残り" + exp.left + "日" : "失効"}）<br><span class="muted">更新受験は ${esc(jpDate(exp.window))} ごろから可能（目安・要公式確認）</span></p>` : ""}
          </section>
        </aside>
      </div>
      ${footer()}`;
    const upd = () => {
      x.status = $("#f-status").value; x.examDate = $("#f-exam").value; x.passedAt = $("#f-pass").value;
      if (x.passedAt && x.status !== "passed") { x.status = "passed"; }
      save(); toast("保存しました"); viewCert(c);
    };
    ["#f-status", "#f-exam", "#f-pass"].forEach(s => $(s).addEventListener("change", upd));
  }

  /* ============================================================
     QUIZ
     ============================================================ */
  function pickMock(c) {
    /* 配点が分かるドメインは比率どおり、不明なら均等に出題数を割り当てる */
    const pool = Q_BY_CERT[c.id];
    const n = Math.min(pool.length, MOCK_MAX);
    const useW = c.weightSrc && c.domains.every(d => d.w != null);
    const ws = c.domains.map(d => (useW ? d.w : 1));
    const sum = ws.reduce((a, b) => a + b, 0);
    const byDom = c.domains.map((_, i) => shuffle(pool.filter(q => q.d === i)));
    const quota = ws.map(w => Math.floor(n * w / sum));
    let picked = [];
    byDom.forEach((qs, i) => { picked.push(...qs.splice(0, quota[i])); });
    const rest = shuffle(byDom.flat());
    while (picked.length < n && rest.length) picked.push(rest.pop());
    return shuffle(picked);
  }
  function viewQuizStart(p) {
    const mode = p.get("mode") || "practice";
    const c = BY_ID[p.get("c")];
    let qs = [];
    let title = "";
    if (mode === "review") { qs = shuffle(dueList(c && c.id)).slice(0, 30); title = (c ? c.abbr + " の" : "全資格の") + "復習"; }
    else if (mode === "wrong" && c) { qs = shuffle(Q_BY_CERT[c.id].filter(q => st.ans[q.id] && st.ans[q.id].last === false)); title = c.abbr + " まちがえた問題"; }
    else if (mode === "mock" && c) { qs = pickMock(c); title = c.abbr + " 模擬試験"; }
    else if (c) {
      const d = p.has("d") ? Number(p.get("d")) : null;
      const pool = Q_BY_CERT[c.id].filter(q => d == null || q.d === d);
      /* 未回答・苦手を優先して10問 */
      const score = q => { const a = st.ans[q.id]; return !a ? 0 : a.last === false ? 1 : 2 + a.box; };
      qs = shuffle(pool).sort((a, b) => score(a) - score(b)).slice(0, 10);
      title = c.abbr + (d != null ? " / " + c.domains[d].t : " ランダム演習");
    }
    if (!qs.length) {
      app.innerHTML = `<div class="quiz card pad"><h1 style="font-size:20px;margin-top:0">出題できる問題がありません</h1>
        <p class="muted">復習の時期が来た問題や、まちがえた問題はまだありません。</p><a class="btn" href="${c ? "#/cert/" + c.id : "#/"}">戻る</a></div>`;
      return;
    }
    const isMock = mode === "mock";
    session = {
      mode, isMock, title, cert: c, back: c ? "#/cert/" + c.id : "#/review",
      items: qs.map(q => ({ q, order: shuffle(q.o.map((_, i) => i)), sel: [], done: false, flag: false })),
      i: 0,
      endAt: isMock ? Date.now() + Math.round(c.length * 60000 * qs.length / (c.id === "pde" ? 45 : c.id === "paa" ? 80 : 55)) : null
    };
    renderQ();
  }
  function renderQ() {
    const S = session, it = S.items[S.i], q = it.q, c = BY_ID[q.c];
    const multi = q.a.length > 1;
    const answered = S.items.filter(x => x.done || (S.isMock && x.sel.length)).length;
    const showFb = !S.isMock && it.done;
    const keys = "ABCDEF";
    app.innerHTML = `
      <div class="quiz">
        <div class="qbar">
          <a class="btn sm ghost" href="${S.back}" aria-label="演習をやめる">✕ やめる</a>
          <b style="font-size:14px">${esc(S.title)}</b>
          <div class="bar" aria-hidden="true"><i style="width:${pct(answered / S.items.length)}%"></i></div>
          <span class="small tnum">${S.i + 1} / ${S.items.length}</span>
          ${S.isMock ? `<span class="timer tnum" id="timer">--:--</span>` : ""}
        </div>
        <section class="card pad">
          <div class="qdom">${esc(c.abbr)} · ドメイン${q.d + 1}「${esc(c.domains[q.d].t)}」${multi ? ` · <b>${q.a.length}つ選択</b>` : ""}</div>
          <p class="qtext">${esc(q.q)}</p>
          <ul class="opts" role="${multi ? "group" : "radiogroup"}" aria-label="選択肢">
            ${it.order.map((oi, k) => {
              let cls = it.sel.includes(oi) ? "sel" : "";
              if (showFb) cls = q.a.includes(oi) ? "right" : it.sel.includes(oi) ? "wrong" : "";
              return `<li><button type="button" class="opt ${cls}" data-oi="${oi}" role="${multi ? "checkbox" : "radio"}" aria-checked="${it.sel.includes(oi)}" ${showFb ? "disabled" : ""}>
                <span class="k">${keys[k]}</span><span>${esc(q.o[oi])}</span></button></li>`;
            }).join("")}
          </ul>
          ${showFb ? (() => { const ok = sameSet(it.sel, q.a); return `<div class="explain" role="status"><b class="${ok ? "v-ok" : "v-ng"}">${ok ? "正解" : "不正解"}</b>　正解: ${q.a.map(a => keys[it.order.indexOf(a)]).join("・")}<p style="margin:6px 0 0">${rich(q.e)}</p></div>`; })() : ""}
          <div class="qfoot">
            <div class="btn-row">
              ${S.i > 0 && S.isMock ? `<button class="btn sm" id="prev" type="button">← 前へ</button>` : ""}
              ${S.isMock ? `<button class="btn sm ghost" id="flag" type="button">${it.flag ? "★ 見直し中" : "☆ 見直しに印"}</button>` : ""}
            </div>
            <div class="btn-row">
              ${S.isMock
                ? (S.i < S.items.length - 1 ? `<button class="btn primary" id="next" type="button">次へ →</button>` : "") + `<button class="btn ${S.i === S.items.length - 1 ? "primary" : ""}" id="finish" type="button">採点する</button>`
                : it.done
                  ? `<button class="btn primary" id="next" type="button">${S.i < S.items.length - 1 ? "次の問題 →" : "結果を見る"}</button>`
                  : `<button class="btn primary" id="submit" type="button" ${it.sel.length ? "" : "disabled"}>回答する</button>`}
            </div>
          </div>
          <p class="kbd" style="margin:10px 0 0">キーボード: A〜${keys[q.o.length - 1]} または 1〜${q.o.length} で選択、Enter で${S.isMock ? "次へ" : "回答 / 次へ"}</p>
        </section>
        ${S.isMock ? `<section class="card pad" style="margin-top:12px"><div class="small muted">問題一覧（★ = 見直し）</div>
          <div class="navgrid">${S.items.map((x, k) => `<button type="button" data-jump="${k}" class="${x.sel.length ? "done" : ""} ${x.flag ? "flag" : ""} ${k === S.i ? "cur" : ""}" aria-label="問題${k + 1}">${k + 1}</button>`).join("")}</div></section>` : ""}
      </div>`;

    app.querySelectorAll(".opt").forEach(b => b.addEventListener("click", () => choose(Number(b.dataset.oi))));
    const on = (id, fn) => { const el = $("#" + id); if (el) el.addEventListener("click", fn); };
    on("submit", submit); on("next", next); on("prev", () => { S.i--; renderQ(); });
    on("flag", () => { it.flag = !it.flag; renderQ(); });
    on("finish", () => {
      const blank = S.items.filter(x => !x.sel.length).length;
      if (blank && !confirm(`未回答が ${blank} 問あります。採点しますか？`)) return;
      finish();
    });
    app.querySelectorAll("[data-jump]").forEach(b => b.addEventListener("click", () => { S.i = Number(b.dataset.jump); renderQ(); }));
    if (S.isMock) tick();
  }
  function choose(oi) {
    const it = session.items[session.i], multi = it.q.a.length > 1;
    if (it.done) return;
    if (multi) it.sel = it.sel.includes(oi) ? it.sel.filter(x => x !== oi) : it.sel.concat(oi);
    else it.sel = [oi];
    renderQ();
  }
  function submit() {
    const it = session.items[session.i];
    if (!it.sel.length || it.done) return;
    it.done = true;
    record(it.q.id, sameSet(it.sel, it.q.a)); save();
    renderQ();
  }
  function next() {
    const S = session;
    if (S.i < S.items.length - 1) { S.i++; renderQ(); } else if (!S.isMock) finish();
  }
  function tick() {
    const el = $("#timer");
    const upd = () => {
      const left = Math.max(0, session.endAt - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      if (el) { el.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); el.classList.toggle("low", left < 5 * 60000); }
      if (!left) { clearInterval(timerId); toast("時間切れです。採点します"); finish(); }
    };
    clearInterval(timerId); upd(); timerId = setInterval(upd, 1000);
  }
  function finish() {
    clearInterval(timerId);
    const S = session;
    if (S.isMock) S.items.forEach(it => { if (!it.done) { it.done = true; record(it.q.id, sameSet(it.sel, it.q.a)); } });
    const done = S.items.filter(it => it.done);
    const ok = done.filter(it => sameSet(it.sel, it.q.a)).length;
    if (S.isMock) st.mocks.push({ c: S.cert.id, date: todayStr(), score: ok, total: S.items.length });
    save();
    const byDom = {};
    done.forEach(it => {
      const k = it.q.c + ":" + it.q.d;
      byDom[k] = byDom[k] || { c: BY_ID[it.q.c], d: it.q.d, n: 0, ok: 0 };
      byDom[k].n++; if (sameSet(it.sel, it.q.a)) byDom[k].ok++;
    });
    const rate = done.length ? ok / done.length : 0;
    app.innerHTML = `
      <div class="quiz grid">
        <section class="card pad" style="text-align:center">
          <div class="eyebrow">${esc(S.title)} · 結果</div>
          <div class="result-score tnum" style="color:${S.isMock ? (rate >= PASS_MARK ? "var(--ok)" : "var(--ng)") : "var(--text)"}">${pct(rate)}%</div>
          <p style="margin:8px 0 4px">${ok} / ${done.length} 問正解</p>
          ${S.isMock ? `<p class="small muted" style="margin:0">${rate >= PASS_MARK ? "目安ライン（70%）を超えました。" : "目安ライン（70%）に届きませんでした。苦手ドメインを復習しましょう。"}<br>※ 公式の合格点は非公開です。本アプリの目安であり合否を保証しません。</p>` : ""}
          <div class="btn-row" style="justify-content:center;margin-top:14px">
            <a class="btn primary" href="${S.back}">戻る</a>
            ${S.cert ? `<a class="btn" href="#/quiz?c=${S.cert.id}&mode=${S.mode}&r=${Date.now()}">もう一度</a>` : ""}
          </div>
        </section>
        <section class="card pad"><h2 style="margin:0 0 10px;font-size:16px">ドメイン別</h2>
          ${Object.values(byDom).map(b => `<div style="display:grid;grid-template-columns:1fr 90px;gap:10px;align-items:center;margin:8px 0;font-size:13.5px">
            <div>${esc(b.c.abbr)} · ${esc(b.c.domains[b.d].t)}<div class="bar" style="margin-top:4px"><i style="width:${pct(b.ok / b.n)}%;background:${b.ok / b.n < .6 ? "var(--ng)" : "var(--ok)"}"></i></div></div>
            <span class="tnum" style="text-align:right">${b.ok}/${b.n}</span></div>`).join("")}
        </section>
        <section class="card pad"><h2 style="margin:0 0 4px;font-size:16px">解答と解説</h2>
          ${S.items.map((it, k) => {
            const good = sameSet(it.sel, it.q.a);
            return `<div class="review-item"><div style="display:flex;gap:8px;align-items:baseline"><span class="chip ${good ? "ok" : "ng"}">${good ? "正解" : "不正解"}</span><b>問${k + 1}</b></div>
              <p style="margin:6px 0">${esc(it.q.q)}</p>
              <p class="small" style="margin:0">あなたの回答: ${it.sel.length ? it.sel.map(a => esc(it.q.o[a])).join(" / ") : "未回答"}<br>正解: <b>${it.q.a.map(a => esc(it.q.o[a])).join(" / ")}</b></p>
              <p class="small muted" style="margin:6px 0 0">${rich(it.q.e)}</p></div>`;
          }).join("")}
        </section>
      </div>`;
  }
  document.addEventListener("keydown", e => {
    if (!session || !app.querySelector(".opts") || e.target.closest("input,select,textarea")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const it = session.items[session.i];
    let k = -1;
    if (/^[1-6]$/.test(e.key)) k = Number(e.key) - 1;
    else if (/^[a-fA-F]$/.test(e.key)) k = e.key.toUpperCase().charCodeAt(0) - 65;
    if (k >= 0 && k < it.order.length) { e.preventDefault(); choose(it.order[k]); return; }
    if (e.key === "Enter" && !e.target.closest("a,button")) {
      e.preventDefault();
      if (session.isMock) { if (session.i < session.items.length - 1) next(); }
      else if (!it.done) submit(); else next();
    }
  });

  /* ============================================================
     LEARN（学習ノート）
     ============================================================ */
  /* 資格IDを指定すると、その資格のノート＋関連する共通ノートを返す */
  function notesFor(cid) {
    if (!cid) return NOTES;
    if (cid === "common") return NOTES.filter(n => n.c === "common");
    return NOTES.filter(n => n.c === cid || (n.c === "common" && (n.rel || []).includes(cid)));
  }
  function pairsFor(ns) { return ns.flatMap(n => (n.pairs || []).map(p => ({ cue: p[0], ans: p[1], n }))); }
  const certLabel = n => n.c === "common" ? "共通" : BY_ID[n.c].abbr;
  function noteCard(n, open) {
    const known = !!st.known[n.id];
    const c = BY_ID[n.c];
    const dom = c && n.d != null ? c.domains[n.d] : null;
    return `<article class="card note-card ${known ? "known" : ""}" id="note-${esc(n.id)}"><details ${open ? "open" : ""}><summary>
      <div class="note-head"><span class="chip ${CAT[n.cat].cls}">${CAT[n.cat].ja}</span>
        ${c ? `<a class="chip" href="#/cert/${c.id}" style="text-decoration:none">${esc(c.abbr)}</a>` : `<span class="chip">共通</span>`}
        ${dom ? `<span class="small muted">ドメイン${n.d + 1}「${esc(dom.t)}」</span>` : ""}
        ${known ? `<span class="chip ok">覚えた</span>` : ""}</div>
      <h3>${esc(n.t)}</h3>
      <p class="sum">${rich(n.s)}</p></summary>
      ${n.b ? `<ul>${n.b.map(x => `<li>${rich(x)}</li>`).join("")}</ul>` : ""}
      ${n.tbl ? `<div class="scroll-x"><table class="tbl"><thead><tr>${n.tbl.h.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${n.tbl.r.map(r => `<tr>${r.map(x => `<td>${rich(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${n.pairs ? `<div class="pairs">${n.pairs.map(p => `<div class="pair"><span>${esc(p[0])}</span><span class="arrow" aria-hidden="true">→</span><b>${esc(p[1])}</b></div>`).join("")}</div>` : ""}
      ${n.tip ? `<p class="tipbox"><b>試験のコツ</b>　${rich(n.tip)}</p>` : ""}
      <div class="note-foot">
        <div class="btn-row">${c && n.d != null ? `<a class="btn sm" href="#/quiz?c=${c.id}&mode=practice&d=${n.d}">このドメインの問題を解く</a>` : ""}
          ${!c && n.rel ? n.rel.map(r => `<a class="btn sm ghost" href="#/cert/${r}">${esc(BY_ID[r].abbr)}</a>`).join("") : ""}</div>
        <button class="btn sm ${known ? "" : "primary"}" type="button" data-known="${esc(n.id)}" aria-pressed="${known}">${known ? "✓ 覚えた（取り消す）" : "覚えた"}</button>
      </div></details></article>`;
  }
  function viewLearn(p) {
    const f = { c: p.get("c") || "", cat: p.get("cat") || "", d: p.has("d") ? Number(p.get("d")) : null, q: p.get("q") || "", unread: p.get("unread") === "1", expand: false };
    const cc = BY_ID[f.c];
    const base = notesFor(f.c);
    const counts = { "": base.length };
    Object.keys(CAT).forEach(k => { counts[k] = base.filter(n => n.cat === k).length; });
    const knownAll = NOTES.filter(n => st.known[n.id]).length;
    app.innerHTML = `
      <div class="page-head"><div class="eyebrow">Knowledge cards · ${NOTES.length} notes</div><h1>学ぶ</h1>
        <p>問題を解く前のインプット用ノート。<b>基礎</b>（用語・仕組み）→ <b>応用</b>（設計判断）→ <b>頻出</b>（「この要件ならこれ」）の順がおすすめ。</p></div>
      <section class="card pad">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
          <div class="seg" role="group" aria-label="カテゴリ">
            ${[["", "すべて"]].concat(Object.entries(CAT).map(([k, v]) => [k, v.ja])).map(([k, ja]) => `<button type="button" data-cat="${k}" aria-pressed="${f.cat === k}">${ja}<small class="tnum">${counts[k]}</small></button>`).join("")}
          </div>
          <div class="small muted tnum">覚えた ${knownAll} / ${NOTES.length}</div>
        </div>
        <div class="filters">
          <select id="l-cert" aria-label="資格で絞り込む">
            <option value="">すべての資格</option><option value="common" ${f.c === "common" ? "selected" : ""}>共通（全資格の土台）</option>
            ${GC.phases.flatMap(ph => ph.ids).map(id => `<option value="${id}" ${f.c === id ? "selected" : ""}>${esc(BY_ID[id].abbr)} — ${esc(BY_ID[id].name)}</option>`).join("")}
          </select>
          ${cc ? `<select id="l-dom" aria-label="ドメインで絞り込む"><option value="">すべてのドメイン</option>${cc.domains.map((d, i) => `<option value="${i}" ${f.d === i ? "selected" : ""}>${i + 1}. ${esc(d.t)}</option>`).join("")}</select>` : ""}
          <input type="search" id="l-q" placeholder="キーワードで検索（例: Spanner、SLO、VPC）" value="${esc(f.q)}" aria-label="キーワードで検索">
          <label class="chk"><input type="checkbox" id="l-unread" ${f.unread ? "checked" : ""}> 未習得のみ</label>
        </div>
        <div class="btn-row" id="l-actions"></div>
      </section>
      <div class="notes" id="l-list"></div>
      ${footer()}`;
    const setParam = () => {
      const q = new URLSearchParams();
      if (f.c) q.set("c", f.c); if (f.cat) q.set("cat", f.cat); if (cc && f.d != null) q.set("d", f.d); if (f.q) q.set("q", f.q); if (f.unread) q.set("unread", "1");
      history.replaceState(null, "", "#/learn" + (q.toString() ? "?" + q : ""));
    };
    const renderList = () => {
      const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = notesFor(f.c).filter(n => (!f.cat || n.cat === f.cat) && (!cc || f.d == null || (n.c === cc.id && n.d === f.d)) && (!f.unread || !st.known[n.id]) &&
        words.every(w => JSON.stringify([n.t, n.s, n.b, n.tbl, n.pairs, n.tip]).toLowerCase().includes(w)));
      const order = { basic: 0, advanced: 1, frequent: 2 };
      list.sort((a, b) => (a.c === "common" ? 0 : 1) - (b.c === "common" ? 0 : 1) || order[a.cat] - order[b.cat]);
      const pairs = pairsFor(list);
      $("#l-actions").innerHTML = `<span class="small muted" style="align-self:center">${list.length} 件表示</span>
        <button class="btn sm ghost" type="button" id="l-expand">${f.expand ? "すべて閉じる" : "すべて開く"}</button>
        ${pairs.length ? `<a class="btn sm primary" href="#/learn/flash?${new URLSearchParams(Object.assign({}, f.c && { c: f.c }, f.cat && { cat: f.cat }, cc && f.d != null && { d: f.d }))}">この条件でフラッシュカード（${pairs.length}枚）</a>` : ""}`;
      /* 件数が少ないとき・検索中は開いた状態、多いときは見出しだけ */
      const openAll = list.length <= 4 || words.length > 0 || f.expand;
      $("#l-list").innerHTML = list.length ? list.map(n => noteCard(n, openAll)).join("") : `<section class="card pad"><p class="muted" style="margin:0">条件に合うノートがありません。</p></section>`;
      $("#l-expand").addEventListener("click", () => { f.expand = !f.expand; renderList(); });
    };
    /* 「覚えた」は委譲で受け、開閉状態を保ったままそのカードだけ差し替える */
    $("#l-list").addEventListener("click", e => {
      const b = e.target.closest("[data-known]"); if (!b) return;
      const id = b.dataset.known; if (st.known[id]) delete st.known[id]; else st.known[id] = todayStr();
      save();
      const art = b.closest("article"), wasOpen = art.querySelector("details").open;
      const tmp = document.createElement("div"); tmp.innerHTML = noteCard(NOTES.find(n => n.id === id), wasOpen);
      art.replaceWith(tmp.firstElementChild);
    });
    app.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { f.cat = b.dataset.cat; setParam(); viewLearn(new URLSearchParams(location.hash.split("?")[1] || "")); }));
    $("#l-cert").addEventListener("change", e => { f.c = e.target.value; f.d = null; setParam(); viewLearn(new URLSearchParams(location.hash.split("?")[1] || "")); });
    if (cc) $("#l-dom").addEventListener("change", e => { f.d = e.target.value === "" ? null : Number(e.target.value); setParam(); renderList(); });
    $("#l-q").addEventListener("input", e => { f.q = e.target.value; setParam(); renderList(); });
    $("#l-unread").addEventListener("change", e => { f.unread = e.target.checked; setParam(); renderList(); });
    renderList();
  }

  /* フラッシュカード: 頻出ノートの「キーワード → 答え」を1枚ずつ。まだの札は後ろに回す */
  let flash = null;
  function viewFlash(p) {
    const c = p.get("c") || "", cat = p.get("cat") || "", d = BY_ID[c] && p.has("d") ? Number(p.get("d")) : null;
    const deck = shuffle(pairsFor(notesFor(c).filter(n => (!cat || n.cat === cat) && (d == null || (n.c === c && n.d === d)))));
    const back = "#/learn" + (c || cat ? "?" + new URLSearchParams(Object.assign({}, c && { c }, cat && { cat }, d != null && { d })) : "");
    flash = { deck, total: deck.length, ok: 0, again: 0, open: false, back };
    renderFlash();
  }
  function renderFlash() {
    const F = flash;
    if (!F.deck.length) {
      app.innerHTML = `<div class="flash"><section class="card pad" style="text-align:center">
        <div class="eyebrow">Flashcards</div><h1 style="font-size:22px;margin:4px 0">${F.total ? "全部めくりました" : "カードがありません"}</h1>
        ${F.total ? `<p class="muted">${F.total} 枚 · 「もう一度」${F.again} 回</p>` : ""}
        <div class="btn-row" style="justify-content:center"><a class="btn primary" href="${F.back}">ノートに戻る</a></div></section></div>`;
      return;
    }
    const card = F.deck[0];
    const src = card.n.c === "common" ? "共通" : BY_ID[card.n.c].abbr;
    app.innerHTML = `<div class="flash">
      <div class="qbar"><a class="btn sm ghost" href="${F.back}">✕ やめる</a><b style="font-size:14px">フラッシュカード</b>
        <div class="bar" aria-hidden="true"><i style="width:${pct(F.ok / F.total)}%"></i></div><span class="small tnum">${F.ok} / ${F.total}</span></div>
      <section class="card flash-card" aria-live="polite">
        <div class="src">${esc(src)} · ${esc(card.n.t)}</div>
        <div class="cue">${esc(card.cue)}</div>
        ${F.open ? `<div class="ans">${esc(card.ans)}</div>` : `<div class="muted small">答えを思い浮かべてからめくる</div>`}
      </section>
      <div class="btn-row" style="justify-content:center;margin-top:14px">
        ${F.open ? `<button class="btn" id="f-again" type="button">もう一度（1）</button><button class="btn primary" id="f-ok" type="button">覚えた（2）</button>`
                 : `<button class="btn primary" id="f-open" type="button">答えを見る（Space）</button>`}
      </div></div>`;
    const on = (id, fn) => { const el = $("#" + id); if (el) el.addEventListener("click", fn); };
    on("f-open", () => { F.open = true; renderFlash(); });
    on("f-ok", () => { F.deck.shift(); F.ok++; F.open = false; renderFlash(); });
    on("f-again", () => { F.deck.push(F.deck.shift()); F.again++; F.open = false; renderFlash(); });
  }
  document.addEventListener("keydown", e => {
    if (!flash || !app.querySelector(".flash-card") || e.target.closest("input,select,textarea")) return;
    if (!flash.open && (e.key === " " || e.key === "Enter")) { e.preventDefault(); $("#f-open").click(); }
    else if (flash.open && e.key === "1") $("#f-again").click();
    else if (flash.open && (e.key === "2" || e.key === "Enter")) { e.preventDefault(); $("#f-ok").click(); }
  });

  /* ============================================================
     REVIEW
     ============================================================ */
  function viewReview() {
    const due = dueList();
    const weak = [];
    CERTS.forEach(c => certStats(c.id).dom.forEach((d, i) => { if (d.n >= 2 && d.ok / d.n < 0.6) weak.push({ c, i, d }); }));
    weak.sort((a, b) => a.d.ok / a.d.n - b.d.ok / b.d.n);
    app.innerHTML = `
      <div class="page-head"><div class="eyebrow">Spaced repetition</div><h1>復習</h1>
        <p>正解した問題は 1 → 3 → 7 → 16 → 35 日と間隔をあけて再出題、まちがえた問題は当日に戻ります（Leitner 方式）。</p></div>
      <section class="card pad">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div><div class="muted small">今日の復習</div><div style="font-size:30px;font-weight:700" class="tnum">${due.length} 問</div></div>
          <a class="btn primary" href="#/quiz?mode=review" ${due.length ? "" : "aria-disabled='true' disabled"}>全資格まとめて復習（最大30問）</a>
        </div>
        <div class="scroll-x" style="margin-top:14px"><table class="tbl"><thead><tr><th>資格</th><th>復習</th><th>定着率</th><th></th></tr></thead><tbody>
          ${CERTS.map(c => { const n = dueList(c.id).length, s = certStats(c.id); return `<tr><td><a href="#/cert/${c.id}">${esc(c.abbr)}</a> <span class="muted small">${esc(c.name)}</span></td>
            <td class="tnum">${n}</td><td class="tnum">${pct(s.mastery)}%</td>
            <td>${n ? `<a class="btn sm" href="#/quiz?c=${c.id}&mode=review">復習</a>` : ""}</td></tr>`; }).join("")}
        </tbody></table></div>
      </section>
      <h2 class="section-title">苦手なドメイン <small>2問以上回答し正答率60%未満</small></h2>
      <section class="card pad">
        ${weak.length ? weak.slice(0, 12).map(w => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border)">
          <span><b>${esc(w.c.abbr)}</b> ${esc(w.c.domains[w.i].t)} <span class="chip ng tnum">${pct(w.d.ok / w.d.n)}%</span></span>
          <a class="btn sm" href="#/quiz?c=${w.c.id}&mode=practice&d=${w.i}">解き直す</a></div>`).join("") : `<p class="muted" style="margin:0">まだ苦手ドメインはありません。演習を進めると表示されます。</p>`}
      </section>
      ${footer()}`;
  }

  /* ============================================================
     PLAN
     ============================================================ */
  const LEVEL_MULT = { beginner: 1.4, std: 1.0, exp: 0.65 };
  function buildPlan() {
    const p = st.plan;
    const start = p.start || todayStr();
    const hpw = Math.max(1, Number(p.hpw) || 8);
    const mult = LEVEL_MULT[p.level] || 1;
    let cur = start;
    const rows = [];
    GC.phases.flatMap(ph => ph.ids).forEach(id => {
      const c = BY_ID[id];
      if (cs(id).status === "passed") return;
      const h = Math.round(c.hours * mult);
      const days = Math.max(7, Math.ceil(h / hpw * 7));
      const end = addDays(cur, days);
      rows.push({ c, h, from: cur, to: end });
      cur = addDays(end, 1);
    });
    return { rows, start, end: rows.length ? rows[rows.length - 1].to : start, hpw };
  }
  function viewPlan() {
    const p = st.plan;
    const plan = buildPlan();
    const span = Math.max(1, (parseYmd(plan.end) - parseYmd(plan.start)) / 86400000);
    const totalH = plan.rows.reduce((a, r) => a + r.h, 0);
    const fee = plan.rows.reduce((a, r) => a + r.c.fee, 0);
    app.innerHTML = `
      <div class="page-head"><div class="eyebrow">Study plan</div><h1>学習計画</h1>
        <p>未合格の資格をロードマップ順に並べ、週あたりの学習時間から受験目安日を割り出します。</p></div>
      <section class="card pad">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
          <div class="field"><label for="p-start">開始日</label><input type="date" id="p-start" value="${esc(p.start || todayStr())}"></div>
          <div class="field"><label for="p-hpw">週あたりの学習時間</label><input type="number" id="p-hpw" min="1" max="60" value="${esc(p.hpw)}"></div>
          <div class="field"><label for="p-level">Google Cloud の経験</label><select id="p-level">
            <option value="beginner" ${p.level === "beginner" ? "selected" : ""}>ほぼ初めて（×1.4）</option>
            <option value="std" ${p.level === "std" ? "selected" : ""}>ひととおり触ったことがある（×1.0）</option>
            <option value="exp" ${p.level === "exp" ? "selected" : ""}>実務で日常的に使う（×0.65）</option></select></div>
        </div>
        <div class="stats" style="margin-top:6px">
          <div class="stat"><span>残り資格</span><b class="tnum">${plan.rows.length}</b></div>
          <div class="stat"><span>学習時間の目安</span><b class="tnum">${totalH}<small>h</small></b></div>
          <div class="stat"><span>全冠の目安日</span><b class="tnum" style="font-size:16px">${plan.rows.length ? esc(plan.end) : "達成済み"}</b></div>
          <div class="stat"><span>受験料の合計（定価）</span><b class="tnum">$${fee.toLocaleString()}</b></div>
        </div>
        <p class="note" style="margin:14px 0 0">学習時間は本アプリ独自の目安です（公式の推奨値ではありません）。各資格は最低1週間を確保し、フェーズ順に1資格ずつ進める前提で計算しています。</p>
      </section>
      <h2 class="section-title">スケジュール</h2>
      <section class="card pad">
        ${plan.rows.length ? `<div class="gantt">${plan.rows.map(r => {
          const l = (parseYmd(r.from) - parseYmd(plan.start)) / 86400000 / span * 100;
          const w = Math.max(1.5, (parseYmd(r.to) - parseYmd(r.from)) / 86400000 / span * 100);
          return `<div class="g-row"><a href="#/cert/${r.c.id}"><b>${esc(r.c.abbr)}</b></a>
            <div class="g-track"><div class="g-seg" style="--c:${r.c.color};left:${l}%;width:${w}%" title="${esc(r.c.name)}"></div></div>
            <span class="g-date tnum">${esc(r.to.slice(5))} 受験 · ${r.h}h</span></div>`;
        }).join("")}</div>
        <div class="btn-row" style="margin-top:16px"><button class="btn primary" id="apply" type="button">受験目安日を各資格の「受験予定日」に反映</button></div>`
        : `<p class="muted" style="margin:0">全資格が合格済みです。</p>`}
      </section>
      ${footer()}`;
    const upd = () => { st.plan = { start: $("#p-start").value, hpw: Number($("#p-hpw").value) || 8, level: $("#p-level").value }; save(); viewPlan(); };
    ["#p-start", "#p-hpw", "#p-level"].forEach(s => $(s).addEventListener("change", upd));
    const ap = $("#apply");
    if (ap) ap.addEventListener("click", () => {
      plan.rows.forEach(r => { const x = cs(r.c.id); x.examDate = r.to; if (x.status === "none") x.status = "scheduled"; });
      save(); toast("受験予定日を反映しました");
    });
  }

  /* ============================================================
     UPDATES
     ============================================================ */
  function viewUpdates() {
    const m = GC.meta;
    app.innerHTML = `
      <div class="page-head"><div class="eyebrow">What's new · ${esc(m.checkedAt)} 時点</div><h1>最新情報と出典</h1>
        <p>試験に影響する変更点と、本アプリのデータの確からしさ。</p></div>
      <div class="upd">${m.notes.map(n => `<section class="card pad"><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>
        <div class="small muted">出典: ${esc(n.src)} · <a href="${esc(n.url)}" target="_blank" rel="noopener">リンク</a></div></section>`).join("")}</div>
      <h2 class="section-title">製品名の変更 <small>試験ガイドの表記に合わせて新旧どちらも覚える</small></h2>
      <section class="card pad scroll-x"><table class="tbl"><thead><tr><th>旧名称</th><th>新名称</th><th>時期</th><th>確度</th></tr></thead><tbody>
        ${m.renames.map(r => `<tr><td>${esc(r.from)}</td><td><b>${esc(r.to)}</b></td><td class="tnum">${esc(r.when)}</td><td class="small">${esc(r.sure)}</td></tr>`).join("")}
      </tbody></table></section>
      <h2 class="section-title">資格ごとのデータの確からしさ</h2>
      <section class="card pad scroll-x"><table class="tbl"><thead><tr><th>資格</th><th>試験情報・ドメイン</th><th>配点</th><th>メモ</th></tr></thead><tbody>
        ${CERTS.map(c => `<tr><td><a href="#/cert/${c.id}">${esc(c.abbr)}</a></td><td><span class="chip ok">公式ページ</span></td><td>${weightBadge(c)}</td><td class="small">${esc(c.weightNote)}</td></tr>`).join("")}
      </tbody></table>
      <p class="note" style="margin:14px 0 0">公式の試験ガイド PDF（services.google.com）は本アプリ作成環境のネットワーク制限で直接取得できなかったため、配点の一部は二次情報です。受験前に必ず各資格ページから最新の試験ガイドを確認してください。</p></section>
      <h2 class="section-title">提供終了した資格</h2>
      <section class="card pad">${m.retired.map(r => `<p style="margin:0"><b>${esc(r.name)}</b> — ${esc(r.when)}（${esc(r.note)}）</p>`).join("")}</section>
      ${footer()}`;
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function viewSettings() {
    const n = Object.keys(st.ans).length;
    app.innerHTML = `
      <div class="page-head"><div class="eyebrow">Settings</div><h1>設定</h1>
        <p>進捗はこのブラウザの localStorage にだけ保存され、外部には送信されません。</p></div>
      <div class="grid">
        <section class="card pad"><h2 style="margin:0 0 10px;font-size:16px">表示</h2>
          <div class="field" style="max-width:280px"><label for="s-theme">テーマ</label><select id="s-theme">
            <option value="auto" ${st.theme === "auto" ? "selected" : ""}>OS の設定に合わせる</option>
            <option value="light" ${st.theme === "light" ? "selected" : ""}>ライト</option>
            <option value="dark" ${st.theme === "dark" ? "selected" : ""}>ダーク</option></select></div></section>
        <section class="card pad"><h2 style="margin:0 0 6px;font-size:16px">バックアップ</h2>
          <p class="small muted" style="margin:0 0 12px">回答履歴 ${n} 件・模試 ${st.mocks.length} 回。別の端末へ移すときは書き出して読み込みます。</p>
          <div class="btn-row"><button class="btn" id="exp" type="button">JSON を書き出す</button>
            <label class="btn" for="imp">JSON を読み込む</label><input type="file" id="imp" accept="application/json,.json" class="sr"></div></section>
        <section class="card pad"><h2 style="margin:0 0 6px;font-size:16px">リセット</h2>
          <p class="small muted" style="margin:0 0 12px">すべての進捗（回答履歴・模試・ステータス・計画）を削除します。元に戻せません。</p>
          <button class="btn" id="reset" type="button" style="color:var(--ng);border-color:var(--ng)">すべての進捗を削除</button></section>
        <section class="card pad"><h2 style="margin:0 0 6px;font-size:16px">収録データ</h2>
          <p class="small" style="margin:0">資格 ${CERTS.length} 種・学習ノート ${NOTES.length} 件・オリジナル演習問題 ${Q.length} 問（${CERTS.map(c => c.abbr + " " + Q_BY_CERT[c.id].length).join(" / ")}）</p></section>
      </div>
      ${footer()}`;
    $("#s-theme").addEventListener("change", e => { st.theme = e.target.value; applyTheme(); save(); });
    $("#exp").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(st, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "kumomichi-backup-" + todayStr() + ".json";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $("#imp").addEventListener("change", e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => {
        const d = JSON.parse(t);
        if (!d || typeof d !== "object" || !d.ans || !d.certs) throw new Error("形式が違います");
        if (!confirm("現在の進捗を、読み込んだ内容で置き換えます。よろしいですか？")) return;
        st = Object.assign(blank(), d); save(); applyTheme(); toast("読み込みました"); viewSettings();
      }).catch(err => toast("読み込めませんでした: " + err.message));
    });
    $("#reset").addEventListener("click", () => {
      if (!confirm("すべての進捗を削除します。元に戻せません。よろしいですか？")) return;
      st = blank(); save(); applyTheme(); toast("削除しました"); viewSettings();
    });
  }

  route();
})();
