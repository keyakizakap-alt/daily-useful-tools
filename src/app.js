/* ============================================================
   おくるまえに — DOM 層
   ------------------------------------------------------------
   点検の判定は engine.js が持つ。ここは入出力と描画のみ。
   利用者の入力を HTML として扱う経路は buildSegments →
   escapeHtml の一本に限定する。
   ============================================================ */
(function () {
  'use strict';

  var E = window.OkuruMae;

  var STORAGE = {
    theme: 'okurumae.theme',
    save: 'okurumae.save',
    subject: 'okurumae.subject',
    body: 'okurumae.body',
    audience: 'okurumae.audience'
  };

  var SAMPLE_SUBJECT = 'ご連絡';
  var SAMPLE_BODY = [
    '株式会社あおぞら商事 各位様',
    '',
    'お世話になっております。みどり工業の山田です。',
    '先日の打ち合わせの資料を拝見させていただきました。有難うございます。',
    '',
    'ご依頼の見積書について、こちらの方で再計算しました。至急ご確認して下さい。',
    '前回もお伝えしましたが、承認の期限は今週中です。なるはやでご回答をお願い致します。',
    'なお、社内システムのパスワードはAbcd1234です。ログインは弊社の田中様にお伝え下さい。',
    '添付の資料は約30分程度でお読みになられると思います。',
    '見積の内訳は以下になります。詳細は明日お送りすることができます。'
  ].join('\n');

  var els = {};
  var state = {
    audience: 'external',
    filter: 'all',
    ignored: [],
    currentId: null,
    result: { findings: [], score: 100, stats: { counts: { '高': 0, '中': 0, '低': 0 }, total: 0, chars: 0, lines: 0 } }
  };
  var timer = null;
  var toastTimer = null;

  /* ============================================================
     起動
     ============================================================ */

  function init() {
    [
      'audience', 'subject', 'body', 'counter', 'score', 'score-bar-fill',
      'score-counts', 'summary', 'filters', 'findings', 'preview', 'toast',
      'btn-fix-all', 'btn-copy', 'btn-sample', 'btn-clear', 'opt-save'
    ].forEach(function (id) {
      els[id] = document.getElementById(id);
    });

    restoreTheme();
    restoreDraft();
    bindEvents();
    renderFilters();
    run();
  }

  function bindEvents() {
    els.body.addEventListener('input', schedule);
    els.subject.addEventListener('input', schedule);

    els.audience.addEventListener('change', function () {
      state.audience = els.audience.value;
      persistDraft();
      run();
    });

    els.body.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        run();
      }
    });

    els['btn-fix-all'].addEventListener('click', applyAll);
    els['btn-copy'].addEventListener('click', copyBody);
    els['btn-sample'].addEventListener('click', insertSample);
    els['btn-clear'].addEventListener('click', clearAll);
    els['opt-save'].addEventListener('change', onSaveToggle);

    els.findings.addEventListener('click', onFindingsClick);
    els.preview.addEventListener('click', onPreviewClick);

    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-value]'), function (btn) {
      btn.addEventListener('click', function () { setTheme(btn.getAttribute('data-theme-value')); });
    });
  }

  function schedule() {
    state.currentId = null;
    updateCounter();
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      persistDraft();
      run();
    }, 300);
  }

  /* ============================================================
     点検と描画
     ============================================================ */

  function run() {
    var body = els.body.value;
    state.result = E.check(body, {
      subject: els.subject.value,
      audience: state.audience,
      ignored: state.ignored
    });
    updateCounter();
    renderScore();
    renderSummary();
    renderFindings();
    renderPreview();
    renderFilters();
  }

  function updateCounter() {
    var v = els.body.value;
    els.counter.textContent = v.length + '文字 / ' + v.split('\n').length + '行';
  }

  function renderScore() {
    var s = state.result.stats;
    els.score.textContent = String(state.result.score);
    els['score-bar-fill'].style.width = state.result.score + '%';
    els['score-counts'].textContent = '';
    E.SEVERITIES.forEach(function (sev) {
      var span = document.createElement('span');
      span.textContent = E.SEVERITY_META[sev].mark + ' 重要度' + sev + '：' + s.counts[sev] + '件';
      els['score-counts'].appendChild(span);
    });
  }

  function renderSummary() {
    var s = state.result.stats;
    var el = els.summary;
    if (els.body.value.trim() === '') {
      el.removeAttribute('data-tone');
      el.textContent = '本文を入力すると、ここに指摘が出ます。例文を入れて動きを確かめることもできます。';
      return;
    }
    if (s.counts['高'] > 0) {
      el.setAttribute('data-tone', 'alert');
      el.textContent = '重要度「高」が' + s.counts['高'] + '件あります。送信前に必ず確認してください。';
      return;
    }
    el.removeAttribute('data-tone');
    if (s.total === 0) {
      el.textContent = '指摘はありません。このまま送信して差し支えありません。';
    } else {
      el.textContent = '重要度「高」はありません。残りの' + s.total + '件は、直すとより伝わりやすくなる指摘です。';
    }
  }

  function renderFilters() {
    var counts = {};
    state.result.findings.forEach(function (f) {
      counts[f.category] = (counts[f.category] || 0) + 1;
    });
    var cats = Object.keys(counts);
    els.filters.textContent = '';
    if (cats.length === 0) return;

    appendFilterButton('all', 'すべて（' + state.result.findings.length + '）');
    cats.forEach(function (cat) {
      var meta = E.CATEGORIES[cat];
      appendFilterButton(cat, (meta ? meta.label : cat) + '（' + counts[cat] + '）');
    });
    if (cats.indexOf(state.filter) < 0 && state.filter !== 'all') state.filter = 'all';
  }

  function appendFilterButton(value, label) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-pressed', state.filter === value ? 'true' : 'false');
    btn.addEventListener('click', function () {
      state.filter = value;
      renderFilters();
      renderFindings();
    });
    els.filters.appendChild(btn);
  }

  function visibleFindings() {
    if (state.filter === 'all') return state.result.findings;
    return state.result.findings.filter(function (f) { return f.category === state.filter; });
  }

  function renderFindings() {
    var list = visibleFindings();
    els.findings.textContent = '';
    var fixable = state.result.findings.filter(function (f) {
      return f.start !== null && typeof f.suggestion === 'string';
    }).length;
    els['btn-fix-all'].disabled = fixable === 0;
    els['btn-fix-all'].textContent = fixable === 0
      ? '自動で直せる指摘はありません'
      : '修正候補をまとめて適用（' + fixable + '件）';

    if (list.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = els.body.value.trim() === ''
        ? '本文が空です。'
        : 'この分類の指摘はありません。';
      els.findings.appendChild(p);
      return;
    }

    list.forEach(function (f) { els.findings.appendChild(buildFindingItem(f)); });
  }

  function buildFindingItem(f) {
    var li = document.createElement('li');
    li.className = 'finding';
    li.dataset.findingId = f.id;
    li.dataset.severity = f.severity;
    if (state.currentId === f.id) li.classList.add('is-current');

    var head = document.createElement('div');
    head.className = 'finding-head';

    var sev = document.createElement('span');
    sev.className = 'badge';
    sev.setAttribute('data-severity', f.severity);
    sev.textContent = E.SEVERITY_META[f.severity].mark + ' ' + f.severity;
    sev.title = E.SEVERITY_META[f.severity].note;
    head.appendChild(sev);

    var cat = document.createElement('span');
    cat.className = 'badge-cat';
    cat.textContent = E.CATEGORIES[f.category] ? E.CATEGORIES[f.category].label : f.category;
    head.appendChild(cat);

    var msg = document.createElement('span');
    msg.className = 'finding-message';
    msg.textContent = f.message;
    head.appendChild(msg);
    li.appendChild(head);

    if (f.matched) {
      var quote = document.createElement('p');
      quote.className = 'finding-quote';
      var del = document.createElement('del');
      del.textContent = f.matched;
      quote.appendChild(del);
      if (typeof f.suggestion === 'string') {
        quote.appendChild(document.createTextNode(' → '));
        var ins = document.createElement('ins');
        ins.textContent = f.suggestion === '' ? '（削除）' : f.suggestion;
        quote.appendChild(ins);
      }
      li.appendChild(quote);
    }

    var why = document.createElement('p');
    why.className = 'finding-why';
    why.textContent = f.why;
    li.appendChild(why);

    var actions = document.createElement('div');
    actions.className = 'finding-actions';
    if (f.start !== null && typeof f.suggestion === 'string') {
      actions.appendChild(makeButton('置換', 'apply', 'apply', f.id));
    }
    if (f.start !== null) {
      actions.appendChild(makeButton('本文の該当箇所へ', 'locate', 'locate', f.id));
    }
    actions.appendChild(makeButton('無視', 'ignore', 'ignore', f.id));
    li.appendChild(actions);
    return li;
  }

  function makeButton(label, className, action, findingId) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    b.dataset.action = action;
    b.dataset.findingId = findingId;
    return b;
  }

  function renderPreview() {
    var text = els.body.value;
    var segments = E.buildSegments(text, state.result.findings);
    var html = '';
    segments.forEach(function (seg) {
      var escaped = E.escapeHtml(seg.text);
      if (seg.findingId === null) {
        html += escaped;
      } else {
        html += '<mark data-finding-id="' + E.escapeHtml(seg.findingId) +
          '" data-severity="' + E.escapeHtml(seg.severity) +
          '" title="' + E.escapeHtml('重要度' + seg.severity + 'の指摘') +
          '" tabindex="0">' + escaped + '</mark>';
      }
    });
    els.preview.innerHTML = html;
    if (state.currentId) {
      var current = els.preview.querySelector('[data-finding-id="' + cssEscape(state.currentId) + '"]');
      if (current) current.classList.add('is-current');
    }
  }

  // querySelector に渡す ID（f0, f12 …）のための最小限のエスケープ
  function cssEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  /* ============================================================
     操作
     ============================================================ */

  function findById(id) {
    for (var i = 0; i < state.result.findings.length; i++) {
      if (state.result.findings[i].id === id) return state.result.findings[i];
    }
    return null;
  }

  function onFindingsClick(ev) {
    var btn = ev.target.closest ? ev.target.closest('button[data-action]') : null;
    if (!btn) return;
    var f = findById(btn.dataset.findingId);
    if (!f) return;

    if (btn.dataset.action === 'apply') {
      els.body.value = E.applyFix(els.body.value, f);
      state.currentId = null;
      persistDraft();
      run();
      showToast('1件置換しました');
    } else if (btn.dataset.action === 'ignore') {
      state.ignored.push(f.key);
      run();
      showToast('この指摘を無視しました');
    } else if (btn.dataset.action === 'locate') {
      state.currentId = f.id;
      els.body.focus();
      els.body.setSelectionRange(f.start, f.end);
      renderFindings();
      renderPreview();
    }
  }

  function onPreviewClick(ev) {
    var mark = ev.target.closest ? ev.target.closest('mark[data-finding-id]') : null;
    if (!mark) return;
    state.currentId = mark.dataset.findingId;
    renderFindings();
    renderPreview();
    var li = els.findings.querySelector('[data-finding-id="' + cssEscape(state.currentId) + '"]');
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }

  function applyAll() {
    var before = els.body.value;
    var after = E.applyFixes(before, state.result.findings);
    if (after === before) {
      showToast('自動で直せる指摘はありませんでした');
      return;
    }
    els.body.value = after;
    state.currentId = null;
    persistDraft();
    run();
    showToast('修正候補を適用しました');
  }

  function copyBody() {
    var text = els.body.value;
    if (text === '') {
      showToast('本文が空です');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('本文をコピーしました');
      }, fallbackCopy);
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      els.body.focus();
      els.body.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      showToast(ok ? '本文をコピーしました' : 'コピーできませんでした。手動で選択してください');
    }
  }

  function insertSample() {
    els.subject.value = SAMPLE_SUBJECT;
    els.body.value = SAMPLE_BODY;
    state.ignored = [];
    state.currentId = null;
    persistDraft();
    run();
    showToast('例文を入れました');
  }

  function clearAll() {
    els.subject.value = '';
    els.body.value = '';
    state.ignored = [];
    state.currentId = null;
    state.filter = 'all';
    persistDraft();
    run();
    els.body.focus();
  }

  /* ============================================================
     保存（既定は無効）
     ============================================================ */

  function saveEnabled() {
    return els['opt-save'].checked;
  }

  function onSaveToggle() {
    if (saveEnabled()) {
      safeSet(STORAGE.save, '1');
      persistDraft();
      showToast('この端末に下書きを保存します');
    } else {
      [STORAGE.save, STORAGE.subject, STORAGE.body, STORAGE.audience].forEach(safeRemove);
      showToast('保存を解除し、保存済みの下書きを削除しました');
    }
  }

  function persistDraft() {
    if (!saveEnabled()) return;
    safeSet(STORAGE.subject, els.subject.value);
    safeSet(STORAGE.body, els.body.value);
    safeSet(STORAGE.audience, state.audience);
  }

  function restoreDraft() {
    var enabled = safeGet(STORAGE.save) === '1';
    els['opt-save'].checked = enabled;
    if (!enabled) {
      // 以前のバージョンや別経路で残った下書きを、起動時に残さない
      [STORAGE.subject, STORAGE.body, STORAGE.audience].forEach(safeRemove);
      return;
    }
    els.subject.value = safeGet(STORAGE.subject) || '';
    els.body.value = safeGet(STORAGE.body) || '';
    var audience = safeGet(STORAGE.audience);
    if (audience && E.AUDIENCES[audience]) {
      state.audience = audience;
      els.audience.value = audience;
    }
  }

  /* ============================================================
     テーマ
     ============================================================ */

  function setTheme(value) {
    if (value === 'system') {
      document.documentElement.removeAttribute('data-theme');
      safeRemove(STORAGE.theme);
    } else {
      document.documentElement.setAttribute('data-theme', value);
      safeSet(STORAGE.theme, value);
    }
    markTheme(value);
  }

  function restoreTheme() {
    var saved = safeGet(STORAGE.theme);
    var value = (saved === 'light' || saved === 'dark') ? saved : 'system';
    if (value !== 'system') document.documentElement.setAttribute('data-theme', value);
    markTheme(value);
  }

  function markTheme(value) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-value]'), function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-theme-value') === value ? 'true' : 'false');
    });
  }

  /* ============================================================
     localStorage / トースト
     ============================================================ */

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }

  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* 保存できない環境は無視 */ }
  }

  function safeRemove(key) {
    try { window.localStorage.removeItem(key); } catch { /* 同上 */ }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
