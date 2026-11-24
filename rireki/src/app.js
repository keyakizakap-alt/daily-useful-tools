/* ============================================================
   としめくり — DOM 層
   入力を読み、engine.js（Toshimekuri）で計算し、textContent で描画する。
   入力内容は保存しない。保存するのは表示テーマだけ。
   ============================================================ */
(function () {
  'use strict';
  var T = window.Toshimekuri;
  var THEME_KEY = 'toshimekuri-theme';
  var $ = function (id) { return document.getElementById(id); };

  var state = { mode: 'wareki', rows: [] };

  function todayIso() {
    var now = new Date();
    return T.formatIso({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- テーマ ---------- */
  function readTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
  }
  function applyTheme(value) {
    if (value !== 'light' && value !== 'dark') value = 'system';
    if (value === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
    var buttons = document.querySelectorAll('[data-theme-value]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-theme-value') === value));
    }
    try { localStorage.setItem(THEME_KEY, value); } catch (e) { /* 保存できない環境でも表示は切り替わる */ }
  }

  /* ---------- 入力 ---------- */
  function readInput() {
    return {
      birth: $('birth').value,
      refDate: $('ref-date').value,
      path: $('path').value,
      vocationalYears: Number($('voc-years').value),
      roninYears: Number($('ronin').value),
      extend: { high: Number($('ext-high').value), post: Number($('ext-post').value), grad: Number($('ext-grad').value) },
      includeElementary: $('include-elementary').checked,
      schools: {
        elementary: $('school-elementary').value,
        juniorHigh: $('school-juniorHigh').value,
        high: $('school-high').value,
        post: $('school-post').value,
        master: $('school-master').value,
        doctor: $('school-doctor').value,
      },
    };
  }

  /** 選んだ学歴で使わない入力欄を隠す。 */
  function updateVisibility(path) {
    var hasHigh = path !== 'juniorHigh';
    var hasPost = ['junior', 'vocational', 'univ4', 'univ6', 'master', 'doctor'].indexOf(path) >= 0;
    var hasGrad = path === 'master' || path === 'doctor';
    $('field-voc').hidden = path !== 'vocational';
    $('ext-high').closest('.field').hidden = !hasHigh;
    $('ronin').closest('.field').hidden = !hasPost;
    $('field-ext-post').hidden = !hasPost;
    $('field-ext-grad').hidden = !hasGrad;
    $('field-school-elementary').hidden = !$('include-elementary').checked;
    $('field-school-high').hidden = !hasHigh;
    $('field-school-post').hidden = !hasPost;
    $('field-school-master').hidden = !hasGrad;
    $('field-school-doctor').hidden = path !== 'doctor';
  }

  function showBirthWareki() {
    var out = $('birth-wareki');
    var b = T.parseDate($('birth').value);
    if (!b) { out.textContent = '西暦で入力します（例: 2003-05-10）'; return; }
    try {
      var w = T.toWareki(b.y, b.m, b.d);
      out.textContent = w.label + b.m + '月' + b.d + '日生まれ' + (T.isHayaumare(b) ? '（早生まれ）' : '');
    } catch (e) {
      out.textContent = e.message;
    }
  }

  /* ---------- 描画 ---------- */
  var BIRTH_EMPTY = '生年月日を入力してください。';

  /**
   * メッセージ一覧を box に描く。前回と同じ内容なら DOM に触らない
   * （aria-live の領域を作り直すと、同じ文が入力のたびに読み上げられるため）。
   */
  function renderMessages(box, messages) {
    var key = messages.join('\n');
    if (box.getAttribute('data-key') === key) return;
    box.setAttribute('data-key', key);
    clearChildren(box);
    for (var i = 0; i < messages.length; i++) box.appendChild(el('p', '', messages[i]));
    box.hidden = messages.length === 0;
  }

  function renderErrors(errors) {
    // 最初から赤字にしないため、「生年月日の未入力」だけは出さない（他のエラーは出す）
    var shown = errors.filter(function (m) { return m !== BIRTH_EMPTY; });
    renderMessages($('errors'), shown);
    $('birth').setAttribute('aria-invalid', String(shown.some(function (m) { return m.indexOf('生年月日') === 0; })));
    $('ref-date').setAttribute('aria-invalid', String(shown.some(function (m) { return m.indexOf('記入日') === 0; })));
  }

  function renderTable() {
    var table = $('timeline');
    var tbody = table.querySelector('tbody');
    clearChildren(tbody);
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      var tr = el('tr', (r.status === 'expected' ? 'expected' : '') + (r.placeholder ? ' placeholder' : ''));
      tr.appendChild(el('td', 'year', T.yearLabel(r.y, r.m, state.mode)));
      tr.appendChild(el('td', 'month', r.m + '月'));
      tr.appendChild(el('td', 'event', r.text));
      tbody.appendChild(tr);
    }
    table.hidden = state.rows.length === 0;
    $('copy').disabled = state.rows.length === 0;
  }

  function setSummaryText(p, text) {
    if (p.getAttribute('data-key') === text) return;
    p.setAttribute('data-key', text);
    p.textContent = text;
  }

  function renderSummary(result, input) {
    var p = $('summary');
    if (result.errors.length) {
      var onlyEmpty = result.errors.length === 1 && result.errors[0] === BIRTH_EMPTY;
      setSummaryText(p, onlyEmpty ? '生年月日を入力すると、ここに学歴欄が出ます。' : '入力内容を確認してください（上の赤字）。');
      return;
    }
    var ref = T.parseDate(input.refDate);
    var refLabel;
    try {
      var w = T.toWareki(ref.y, ref.m, ref.d);
      refLabel = state.mode === 'seireki'
        ? ref.y + '年' + ref.m + '月' + ref.d + '日'
        : w.label + ref.m + '月' + ref.d + '日';
    } catch (e) {
      refLabel = input.refDate;
    }
    var expected = result.rows.some(function (r) { return r.status === 'expected'; });
    var key = [refLabel, result.age, result.hayaumare, expected].join('|');
    if (p.getAttribute('data-key') === key) return;
    p.setAttribute('data-key', key);
    clearChildren(p);
    p.appendChild(document.createTextNode(refLabel + '現在 '));
    p.appendChild(el('strong', '', '満' + result.age + '歳'));
    if (result.hayaumare) p.appendChild(el('span', 'badge', '早生まれ'));
    if (expected) p.appendChild(document.createTextNode(' ・ 青字は記入日より後の予定です'));
  }

  function update() {
    var input = readInput();
    updateVisibility(input.path);
    showBirthWareki();
    var result = T.buildTimeline(input);
    state.rows = result.rows;
    renderErrors(result.errors);
    renderSummary(result, input);
    renderMessages($('warnings'), result.warnings);
    renderTable();
    $('copy-status').textContent = '';
  }

  /* ---------- コピー ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  function onCopy() {
    var status = $('copy-status');
    copyText(T.formatTimelineText(state.rows, state.mode)).then(
      function () { status.textContent = 'コピーしました。'; $('copy').focus(); },
      function () { status.textContent = 'コピーできませんでした。表を選択して手動でコピーしてください。'; $('copy').focus(); }
    );
  }

  /* ---------- 和暦⇔西暦 ---------- */
  function convSeireki() {
    var out = $('conv-seireki-out');
    out.classList.remove('error');
    var raw = $('conv-seireki').value;
    if (!raw) { out.textContent = '—'; return; }
    var d = T.parseDate(raw);
    if (!d) { out.textContent = '正しい日付ではありません。'; out.classList.add('error'); return; }
    try {
      out.textContent = T.toWareki(d.y, d.m, d.d).label + d.m + '月' + d.d + '日';
    } catch (e) {
      out.textContent = e.message;
      out.classList.add('error');
    }
  }

  function convWareki() {
    var out = $('conv-wareki-out');
    out.classList.remove('error');
    var raw = $('conv-year').value;
    if (raw === '') { out.textContent = '—'; return; }
    var era = $('conv-era').value;
    try {
      var y = T.toSeireki(era, Number(raw));
      var labels = T.eraLabelsOfYear(y);
      // 改元の年は2つの元号が同じ西暦年にあたる（例: 昭和64年と平成元年は1989年）
      out.textContent = labels.length > 1 ? y + '年（' + labels.join('・') + 'は同じ年）' : y + '年';
    } catch (e) {
      out.textContent = e.message;
      out.classList.add('error');
    }
  }

  /* ---------- 初期化 ---------- */
  function init() {
    var pathSel = $('path');
    T.PATHS.forEach(function (p) {
      var o = el('option', '', p.label);
      o.value = p.id;
      if (p.id === 'univ4') o.selected = true;
      pathSel.appendChild(o);
    });
    var eraSel = $('conv-era');
    T.ERAS.forEach(function (e) {
      var o = el('option', '', e.name);
      o.value = e.name;
      eraSel.appendChild(o);
    });

    var today = todayIso();
    $('ref-date').value = today;
    $('birth').max = today;
    // 開いたまま日付が変わった／戻るボタンやフォーム復元で戻ってきたときも最新にする
    window.addEventListener('pageshow', function () {
      $('birth').max = todayIso();
      update();
    });

    var ids = ['birth', 'path', 'ref-date', 'ronin', 'voc-years', 'ext-high', 'ext-post', 'ext-grad', 'include-elementary',
      'school-elementary', 'school-juniorHigh', 'school-high', 'school-post', 'school-master', 'school-doctor'];
    ids.forEach(function (id) {
      $(id).addEventListener('input', update);
      $(id).addEventListener('change', update);
    });

    var modeButtons = document.querySelectorAll('[data-mode]');
    for (var i = 0; i < modeButtons.length; i++) {
      modeButtons[i].addEventListener('click', function (ev) {
        state.mode = ev.currentTarget.getAttribute('data-mode');
        for (var j = 0; j < modeButtons.length; j++) {
          modeButtons[j].setAttribute('aria-pressed', String(modeButtons[j] === ev.currentTarget));
        }
        update();
      });
    }

    var themeButtons = document.querySelectorAll('[data-theme-value]');
    for (var k = 0; k < themeButtons.length; k++) {
      themeButtons[k].addEventListener('click', function (ev) {
        applyTheme(ev.currentTarget.getAttribute('data-theme-value'));
      });
    }
    applyTheme(readTheme());

    $('copy').addEventListener('click', onCopy);
    $('conv-seireki').addEventListener('input', convSeireki);
    $('conv-era').addEventListener('change', convWareki);
    $('conv-year').addEventListener('input', convWareki);

    update();
  }

  init();
})();
