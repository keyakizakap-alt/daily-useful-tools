/* ============================================================
   つつみかた — DOM 層
   ------------------------------------------------------------
   判定は engine.js が持つ。ここは入力の受け取りと描画のみ。
   入力値は textContent でしか DOM に出さない（innerHTML 不使用）。
   何も保存しない（localStorage / Cookie 不使用）。
   ============================================================ */
(function () {
  'use strict';

  var E = window.Tsutsumi;

  var LEVEL_LABEL = { error: '入力エラー', warn: '注意', info: '確認', ok: '問題なし' };

  var MANNER_ROWS = [
    ['omote', '表書き'],
    ['mizuhiki', '水引'],
    ['bills', 'お札'],
    ['ink', '墨'],
    ['fukusa', '袱紗の色'],
    ['timing', '渡す時期']
  ];

  var state = {
    eventId: E.EVENTS[0].id,
    relationId: null,
    // 年代と進学先は意味が違うので、場面を切り替えても値を混ぜない
    modifiers: { age: 'mid', school: 'mid' },
    religion: 'unknown',
    recommended: null,
    // ② の金額が連名の合計から入ったものか（1人分の相場と比べないため）
    amountFromGroup: false
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var els = {};
  var initialized = false;

  /* ============================================================
     DOM ヘルパ
     ============================================================ */

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fillSelect(select, options, selectedId) {
    clear(select);
    options.forEach(function (o) {
      var opt = el('option', null, o.label);
      opt.value = o.id;
      if (o.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function summaryOf(results) {
    var level = E.worstLevel(results);
    if (level === 'ok') return '問題なし';
    var n = results.filter(function (r) { return r.level === level; }).length;
    return LEVEL_LABEL[level] + ' ' + n + '件';
  }

  function renderChecks(list, results) {
    clear(list);
    results.forEach(function (r) {
      var li = el('li', 'check');
      li.setAttribute('data-level', r.level);
      li.appendChild(el('span', 'check-label', LEVEL_LABEL[r.level]));
      li.appendChild(el('span', 'check-message', r.message));
      list.appendChild(li);
    });
  }

  /* ============================================================
     ① 目安
     ============================================================ */

  function currentEvent() { return E.getEvent(state.eventId); }

  function currentModifier() { return state.modifiers[currentEvent().modifier]; }

  // 読み上げ用の1行。結果領域全体をライブ領域にすると、操作のたびに長文が読まれるため
  function announce(text) {
    els.status.textContent = text;
  }

  function renderEventChips() {
    clear(els.eventList);
    E.EVENTS.forEach(function (ev) {
      var id = 'ev-' + ev.id;
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'event';
      input.id = id;
      input.value = ev.id;
      input.checked = ev.id === state.eventId;
      input.addEventListener('change', function () {
        if (!input.checked) return;
        state.eventId = ev.id;
        state.relationId = null;
        renderGuideControls();
        renderAll();
      });
      var label = el('label', 'chip ' + ev.kind, ev.label);
      label.htmlFor = id;
      els.eventList.appendChild(input);
      els.eventList.appendChild(label);
    });
  }

  function renderGuideControls() {
    var ev = currentEvent();
    if (!state.relationId || !E.getRelation(ev, state.relationId)) state.relationId = ev.relations[0].id;
    els.relationLabel.textContent = ev.relationPrompt;
    fillSelect(els.relation, ev.relations, state.relationId);

    var mod = E.MODIFIERS[ev.modifier];
    els.modifierLabel.textContent = mod.label;
    fillSelect(els.modifier, mod.options, currentModifier());

    els.religionField.hidden = !ev.religious;
    fillSelect(els.religion, E.RELIGIONS, state.religion);
  }

  function renderGuide() {
    var ev = currentEvent();
    var rec = E.recommend(state.eventId, state.relationId, currentModifier());
    state.recommended = rec && rec.amount ? rec.amount : null;

    els.recAmount.textContent = state.recommended ? E.formatYenShort(state.recommended) : '—';
    if (initialized) announce('目安 ' + els.recAmount.textContent + (rec && rec.rangeText ? '（幅 ' + rec.rangeText + '）' : ''));
    els.recRange.textContent = rec && rec.rangeText ? '目安の幅: ' + rec.rangeText : '';
    els.recNote.textContent = rec && rec.note ? rec.note : '';
    els.recNote.hidden = !(rec && rec.note);
    els.btnUse.disabled = !state.recommended;

    var manners = E.getManners(state.eventId, state.religion);
    clear(els.manners);
    MANNER_ROWS.forEach(function (row) {
      var value = manners[row[0]];
      var wrap = el('div', 'manner');
      wrap.appendChild(el('dt', null, row[1]));
      wrap.appendChild(el('dd', null, Array.isArray(value) ? value.join('／') : value));
      els.manners.appendChild(wrap);
    });
    clear(els.mannerNotes);
    manners.notes.forEach(function (n) { els.mannerNotes.appendChild(el('li', null, n)); });
    els.guideResult.setAttribute('data-kind', ev.kind);
  }

  function premiseText() {
    var ev = currentEvent();
    var rel = E.getRelation(ev, state.relationId);
    if (state.amountFromGroup) return '判定の前提: ' + ev.label + '（連名の合計として。1人分の目安とは比べません）';
    return '判定の前提: ' + ev.label + '・' + ev.relationPrompt.replace(/は、あなたの$/, '') + 'が「' + (rel ? rel.label : '—') + '」';
  }

  /* ============================================================
     ② 金額の判定・お札
     ============================================================ */

  function renderCheck() {
    var raw = els.amount.value.trim();
    els.premise.textContent = premiseText();
    if (raw === '') {
      clear(els.checks);
      els.billsWrap.hidden = true;
      return;
    }
    var results = E.checkAmount(raw, state.eventId, state.amountFromGroup ? null : state.relationId);
    renderChecks(els.checks, results);
    els.premise.textContent = premiseText();

    var list = E.bills(raw, state.eventId);
    els.billsWrap.hidden = !list;
    clear(els.bills);
    if (list) {
      list.forEach(function (b) {
        var li = el('li', 'bill');
        li.appendChild(el('span', 'bill-value', E.formatYenShort(b.value) + '札'));
        li.appendChild(el('span', 'bill-count', '× ' + b.count + '枚'));
        els.bills.appendChild(li);
      });
      var count = list.reduce(function (s, b) { return s + b.count; }, 0);
      els.billsHint.textContent = '合計 ' + count + '枚。' +
        (list.length > 1 ? '向きをそろえ、金額の大きいお札を手前（表側）に重ねます。' : '向きをそろえて入れます。');
    }
  }

  /* ============================================================
     ③ 中袋
     ============================================================ */

  function renderEnvelope() {
    var raw = els.amount.value.trim();
    var text = raw ? E.envelopeText(raw) : null;
    var amount = E.parseAmount(raw);
    // 端数のある額は見本にしない（千円単位で包むのが前提のため）
    if (text && amount % 1000 !== 0) text = null;

    els.envAmount.textContent = text ? text.formal : '金額を入力してください';
    els.envAmount.classList.toggle('placeholder', !text);

    clear(els.envText);
    if (text) {
      [
        ['大字（正式）', text.formal],
        ['「也」をつける場合', text.formalNari],
        ['「円」で書く場合', text.modern],
        ['漢数字で書く場合', text.kansuji]
      ].forEach(function (row) {
        var wrap = el('div', 'env-row');
        wrap.appendChild(el('dt', null, row[0]));
        wrap.appendChild(el('dd', null, row[1]));
        els.envText.appendChild(wrap);
      });
      var tip = el('div', 'env-row tip');
      tip.appendChild(el('dt', null, '書き方のこつ'));
      tip.appendChild(el('dd', null, '大字（壱・弐・参・萬・圓）は、あとから書き足されないための正式な書き方です。どれを使っても失礼にはなりません。'));
      els.envText.appendChild(tip);
    }

    var zip = E.addressToVertical(els.zip.value.trim());
    els.envZip.textContent = zip ? '〒' + zip : '';
    els.envAddress.textContent = E.addressToVertical(els.address.value.trim());
    els.envName.textContent = els.name.value.trim();
    var empty = !zip && !els.address.value.trim() && !els.name.value.trim();
    els.envBack.classList.toggle('is-empty', empty);
  }

  /* ============================================================
     ④ 連名
     ============================================================ */

  function renderGroup() {
    var box = els.groupResult;
    clear(box);
    var per = els.perPerson.value.trim();
    var people = els.people.value.trim();
    if (!per || !people) return;

    var r = E.groupGift(per, people, state.eventId);
    if (r.error) {
      var err = el('ul', 'checks');
      renderChecks(err, [{ level: 'error', message: r.error }]);
      box.appendChild(err);
      return;
    }

    var total = el('p', 'group-total');
    total.appendChild(el('span', 'group-total-label', '合計'));
    total.appendChild(el('span', 'group-total-amount', E.formatYen(r.total)));
    box.appendChild(total);

    var list = el('ul', 'checks');
    renderChecks(list, r.checks);
    box.appendChild(list);
    announce('連名の合計 ' + E.formatYen(r.total) + '、' + summaryOf(r.checks));

    if (r.suggestions.length) {
      box.appendChild(el('h3', null, '近い合計にするなら'));
      var ul = el('ul', 'suggestions');
      r.suggestions.forEach(function (s) {
        var text = E.formatYen(s.total) + '（1人 ' + E.formatYen(s.perPerson) +
          (s.remainder ? '、代表者が' + E.formatYen(s.remainder) + '多く' : '') + '）';
        var li = el('li');
        var btn = el('button', 'btn btn-small', text);
        btn.type = 'button';
        btn.addEventListener('click', function () {
          els.amount.value = String(s.total);
          state.amountFromGroup = true;
          renderCheck();
          renderEnvelope();
          els.amount.focus();
          announce('② の金額に連名の合計 ' + E.formatYen(s.total) + ' を入れました');
        });
        li.appendChild(btn);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      box.appendChild(el('p', 'hint', '押すと、② と ③ の金額欄に合計が入ります。1人あたりは100円単位にそろえ、差額は代表者が持つ形にしています。'));
    }
    box.appendChild(el('p', 'hint', r.nameNote));
  }

  /* ============================================================
     起動
     ============================================================ */

  function renderAll() {
    renderGuide();
    renderCheck();
    renderEnvelope();
    renderGroup();
  }

  function init() {
    [
      'event-list', 'relation', 'relation-label', 'modifier', 'modifier-label', 'religion', 'religion-field',
      'guide-result', 'rec-amount', 'rec-range', 'rec-note', 'btn-use', 'manners', 'manner-notes',
      'amount', 'checks', 'bills-wrap', 'bills', 'bills-hint',
      'name', 'zip', 'address', 'env-amount', 'env-back', 'env-zip', 'env-address', 'env-name', 'env-text',
      'per-person', 'people', 'group-result', 'premise', 'status'
    ].forEach(function (id) {
      els[id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = $(id);
    });

    renderEventChips();
    renderGuideControls();

    els.relation.addEventListener('change', function () { state.relationId = els.relation.value; renderAll(); });
    els.modifier.addEventListener('change', function () {
      state.modifiers[currentEvent().modifier] = els.modifier.value;
      renderAll();
    });
    els.religion.addEventListener('change', function () { state.religion = els.religion.value; renderAll(); });

    els.btnUse.addEventListener('click', function () {
      if (!state.recommended) return;
      els.amount.value = String(state.recommended);
      state.amountFromGroup = false;
      renderCheck();
      renderEnvelope();
      els.amount.focus({ preventScroll: true });
      $('h-check').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      announce('② と ③ の金額欄に ' + E.formatYen(state.recommended) + ' を入れました。判定: ' +
        summaryOf(E.checkAmount(state.recommended, state.eventId, state.relationId)));
    });

    els.amount.addEventListener('input', function () {
      state.amountFromGroup = false;
      renderCheck();
      renderEnvelope();
    });
    els.amount.addEventListener('change', function () {
      if (els.amount.value.trim()) {
        announce('判定: ' + summaryOf(E.checkAmount(els.amount.value.trim(), state.eventId, state.relationId)));
      }
    });
    [els.name, els.zip, els.address].forEach(function (input) {
      input.addEventListener('input', renderEnvelope);
    });
    [els.perPerson, els.people].forEach(function (input) {
      input.addEventListener('input', renderGroup);
    });

    renderAll();
    initialized = true;
  }

  init();
})();
