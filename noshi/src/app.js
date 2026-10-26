/* ============================================================
   のしるべ — 画面の制御
   ------------------------------------------------------------
   入力を読み、engine.js（グローバル Noshi）で計算して描画する。
   DOM への挿入は textContent / createElement のみ（innerHTML 不使用）。
   通信・保存は一切行わない。
   ============================================================ */
(function () {
  'use strict';

  var N = window.Noshi;
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    form: $('form'),
    scene: $('scene'),
    relation: $('relation'),
    relationField: $('relation-field'),
    age: $('age'),
    ageField: $('age-field'),
    religion: $('religion'),
    religionField: $('religion-field'),
    childAge: $('childAge'),
    childField: $('child-field'),
    received: $('received'),
    receivedField: $('received-field'),
    receivedError: $('received-error'),
    amount: $('amount'),
    amountError: $('amount-error'),
    name: $('name'),
    amountMain: $('amount-main'),
    amountBasis: $('amount-basis'),
    checkCard: $('check-card'),
    checks: $('checks'),
    specs: $('specs'),
    envelope: $('envelope'),
    envOmote: $('env-omote'),
    envName: $('env-name'),
    envCaption: $('env-caption'),
    nakaCard: $('naka-card'),
    daiji: $('daiji'),
    copyDaiji: $('copy-daiji'),
    copyStatus: $('copy-status'),
    bills: $('bills'),
    notes: $('notes')
  };

  /* ---------- 小さな DOM ヘルパー ---------- */

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function fillSelect(select, items, selected) {
    clear(select);
    items.forEach(function (item) {
      var option = make('option', '', item.label);
      option.value = item.id;
      if (item.id === selected) option.selected = true;
      select.appendChild(option);
    });
  }

  /* ---------- 選択肢の初期化 ---------- */

  function buildSceneSelect() {
    var groups = {};
    var order = [];
    N.SCENES.forEach(function (s) {
      if (!groups[s.group]) {
        groups[s.group] = make('optgroup');
        groups[s.group].label = s.group;
        order.push(s.group);
      }
      var option = make('option', '', s.label);
      option.value = s.id;
      groups[s.group].appendChild(option);
    });
    order.forEach(function (g) { el.scene.appendChild(groups[g]); });
  }

  function buildAgeChips() {
    N.AGES.forEach(function (a, i) {
      var label = make('label', 'chip');
      var input = make('input');
      input.type = 'radio';
      input.name = 'age';
      input.value = a.id;
      if (i === 0) input.checked = true;
      label.appendChild(input);
      label.appendChild(make('span', '', a.label));
      el.age.appendChild(label);
    });
  }

  function currentScene() {
    for (var i = 0; i < N.SCENES.length; i++) if (N.SCENES[i].id === el.scene.value) return N.SCENES[i];
    return N.SCENES[0];
  }

  // 場面に合わせて、関係の選択肢と表示する入力欄を切り替える
  function syncFields() {
    var scene = currentScene();
    var relations = N.relationsFor(scene.id);
    var keep = el.relation.value;
    var hasKeep = relations.some(function (r) { return r.id === keep; });
    fillSelect(el.relation, relations, hasKeep ? keep : relations.length ? relations[0].id : '');

    var byRelation = scene.amountMode === 'relation';
    el.relationField.hidden = !byRelation;
    el.ageField.hidden = !byRelation;
    el.religionField.hidden = !scene.usesReligion;
    el.childField.hidden = scene.amountMode !== 'child';
    el.receivedField.hidden = scene.amountMode !== 'return';
  }

  /* ---------- 入力の読み取り ---------- */

  function readYen(input, errorNode) {
    var text = input.value.trim();
    errorNode.hidden = true;
    errorNode.textContent = '';
    input.removeAttribute('aria-invalid');
    if (text === '') return null;
    var parsed = N.parseYen(text);
    if (!parsed.ok) {
      errorNode.textContent = parsed.reason;
      errorNode.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return null;
    }
    return parsed.yen;
  }

  function readForm() {
    var ageInput = el.form.querySelector('input[name="age"]:checked');
    var scene = currentScene();
    return {
      scene: scene,
      opts: {
        relation: el.relation.value,
        age: ageInput ? ageInput.value : '20',
        religion: el.religion.value,
        childAge: el.childAge.value,
        receivedYen: scene.amountMode === 'return' ? readYen(el.received, el.receivedError) : null
      },
      yen: readYen(el.amount, el.amountError),
      name: el.name.value.trim().slice(0, 20)
    };
  }

  /* ---------- 描画 ---------- */

  function renderAmount(scene, guide) {
    if (guide.amount) {
      var text = N.formatRange(guide.amount.min, guide.amount.max);
      el.amountMain.textContent = (guide.amount.approx ? '約 ' : '') + text;
      el.amountBasis.textContent = guide.amount.basis + (scene.amountMode === 'return' ? '（品物で返すのが一般的です）' : '');
    } else if (scene.amountMode === 'return') {
      el.amountMain.textContent = '—';
      el.amountBasis.textContent = '「いただいた金額」を入れると、お返しの目安（1/3〜1/2）を表示します';
    } else {
      el.amountMain.textContent = '—';
      el.amountBasis.textContent = 'この組み合わせの目安はありません';
    }
  }

  function renderChecks(scene, guide, yen) {
    clear(el.checks);
    if (yen === null) {
      el.checkCard.hidden = true;
      return;
    }
    el.checkCard.hidden = false;
    var labels = { warn: '注意', info: '参考', ok: 'OK' };
    N.checkAmount(scene.id, yen, guide).forEach(function (c) {
      var li = make('li', 'check check-' + c.level);
      li.appendChild(make('span', 'badge', labels[c.level]));
      li.appendChild(make('span', '', c.message));
      el.checks.appendChild(li);
    });
  }

  function renderSpecs(guide) {
    clear(el.specs);
    var rows = [
      ['表書き', guide.omote.join('／')],
      ['水引', guide.mizuhiki.label + '・' + guide.mizuhiki.color],
      ['水引の意味', guide.mizuhiki.meaning],
      ['のし', guide.noshi ? '付ける' : '付けない'],
      ['墨', guide.ink],
      ['名前', guide.nameNote],
      ['お札', guide.newBill],
      ['入れる向き', guide.billFace],
      ['袱紗（ふくさ）', guide.fukusa],
      ['裏の折り返し', guide.fold]
    ];
    rows.forEach(function (row) {
      el.specs.appendChild(make('dt', '', row[0]));
      el.specs.appendChild(make('dd', '', row[1]));
    });
  }

  // 縦書きは writing-mode に頼らず、1文字ずつ縦に積む。
  // 縦書き用の字幅を持たないフォントでも文字が重ならないようにするため
  function setVertical(node, text) {
    clear(node);
    Array.from(text).forEach(function (ch) {
      node.appendChild(make('span', /\s/.test(ch) ? 'gap' : 'ch', /\s/.test(ch) ? '' : ch));
    });
    node.setAttribute('aria-label', text);
  }

  function renderEnvelope(guide, name) {
    el.envelope.setAttribute('data-kind', guide.kind);
    el.envelope.setAttribute('data-mizuhiki', guide.mizuhiki.key);
    el.envelope.setAttribute('data-noshi', guide.noshi ? 'yes' : 'no');
    // 縦書きの枠に収まるよう、文字数で大きさを切り替える（styles.css の data-len）
    setVertical(el.envOmote, guide.omote[0]);
    el.envOmote.setAttribute('data-len', String(Math.min(guide.omote[0].length, 5)));
    setVertical(el.envName, name || 'お名前');
    el.envName.setAttribute('data-len', String(Math.min((name || 'お名前').length, 10)));
    el.envName.classList.toggle('placeholder', !name);
    el.envCaption.textContent = '水引: ' + guide.mizuhiki.color + (guide.noshi ? '／右上にのし' : '');
  }

  function renderNaka(scene, yen) {
    clear(el.bills);
    el.copyStatus.textContent = '';
    if (yen === null) {
      el.nakaCard.hidden = true;
      return;
    }
    el.nakaCard.hidden = false;
    el.daiji.textContent = N.toDaiji(yen);
    N.billPlan(yen, scene.id).forEach(function (p) {
      var name = p.bill === 1 ? '硬貨・端数' : N.formatYen(p.bill) + '札';
      el.bills.appendChild(make('li', '', name + ' × ' + p.count + (p.bill === 1 ? '円' : '枚')));
    });
  }

  function renderNotes(guide) {
    clear(el.notes);
    guide.notes.forEach(function (n) { el.notes.appendChild(make('li', '', n)); });
  }

  function render() {
    var input = readForm();
    var guide = N.getGuide(input.scene.id, input.opts);
    if (!guide) return;
    renderAmount(input.scene, guide);
    renderChecks(input.scene, guide, input.yen);
    renderSpecs(guide);
    renderEnvelope(guide, input.name);
    renderNaka(input.scene, input.yen);
    renderNotes(guide);
  }

  /* ---------- イベント ---------- */

  function copyDaiji() {
    var text = el.daiji.textContent;
    if (!text) return;
    var done = function () { el.copyStatus.textContent = 'コピーしました'; };
    var fail = function () { el.copyStatus.textContent = 'コピーできませんでした。文字を長押し・選択してコピーしてください'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  function init() {
    buildSceneSelect();
    buildAgeChips();
    fillSelect(el.religion, N.RELIGIONS, 'unknown');
    fillSelect(el.childAge, N.CHILD_AGES, 'lowerElem');
    syncFields();
    render();

    el.form.addEventListener('submit', function (e) { e.preventDefault(); });
    el.scene.addEventListener('change', function () { syncFields(); render(); });
    el.form.addEventListener('change', render);
    el.form.addEventListener('input', render);
    el.copyDaiji.addEventListener('click', copyDaiji);
  }

  init();
})();
