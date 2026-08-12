(function () {
  'use strict';

  const data = window.NoshiData;
  const logic = window.NoshiLogic;

  const occasionSelect = document.getElementById('occasion-select');
  const relationSelect = document.getElementById('relation-select');
  const relationLabel = document.getElementById('relation-label');
  const relationStep = document.getElementById('relation-step');
  const amountInput = document.getElementById('amount-input');
  const resultCard = document.getElementById('result-card');

  function populateOccasionOptions() {
    data.occasions.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      occasionSelect.appendChild(opt);
    });
  }

  function populateRelationOptions(occasion) {
    relationSelect.innerHTML = '';
    const isAgeMode = occasion && occasion.relationMode === 'age';
    relationLabel.textContent = isAgeMode ? '2. お子さんの年齢層を選ぶ' : '2. 関係性を選ぶ';
    const list = isAgeMode ? data.ageGroups : data.relations;
    list.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label;
      relationSelect.appendChild(opt);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderResult() {
    const occasion = logic.findOccasion(data, occasionSelect.value);
    if (!occasion) {
      resultCard.innerHTML = '<p class="placeholder">行事を選ぶと結果が表示されます。</p>';
      return;
    }

    const relationOrAge = relationSelect.value;
    const soubaText = logic.getSoubaText(occasion, relationOrAge);

    const omotegakiHtml = occasion.omotegaki
      .map(
        (o) =>
          `<li><span class="omotegaki-text">${escapeHtml(o.text)}</span><span class="omotegaki-note">${escapeHtml(
            o.note
          )}</span></li>`
      )
      .join('');

    let amountHtml = '';
    const amountValue = amountInput.value;
    if (amountValue !== '') {
      const amount = Number(amountValue);
      if (Number.isInteger(amount) && amount >= 0 && amount <= 99999999) {
        const daijiText = logic.formatMoney(amount);
        amountHtml = `<div class="result-block">
          <h3>金額の書き方</h3>
          <p class="daiji">${escapeHtml(daijiText)}</p>
          <button type="button" class="copy-btn" data-copy-text="${escapeHtml(daijiText)}">📋 コピー</button>
        </div>`;

        if (soubaText) {
          const within = logic.isWithinRange(amount, soubaText);
          if (within === false) {
            amountHtml += `<p class="warning">入力した金額は、一般的な相場（${escapeHtml(
              soubaText
            )}）から外れている可能性があります。関係性や地域の慣習に応じてご確認ください。</p>`;
          }
        }
      } else {
        amountHtml = '<p class="warning">金額は0円〜99,999,999円の範囲で入力してください。</p>';
      }
    }

    resultCard.innerHTML = `
      <div class="result-block">
        <h3>表書き</h3>
        <ul class="omotegaki-list">${omotegakiHtml}</ul>
      </div>
      <div class="result-block">
        <h3>水引</h3>
        <p><strong>種類:</strong> ${escapeHtml(occasion.mizuhiki.type)}</p>
        <p><strong>色:</strong> ${escapeHtml(occasion.mizuhiki.color)}</p>
        <p><strong>本数の目安:</strong> ${escapeHtml(occasion.mizuhiki.knotCount)}</p>
        <p class="note">${escapeHtml(occasion.mizuhiki.note)}</p>
      </div>
      <div class="result-block">
        <h3>金額の相場</h3>
        <p>${soubaText ? escapeHtml(soubaText) : '選択した組み合わせの相場データがありません。'}</p>
      </div>
      ${amountHtml}
      <div class="result-block">
        <h3>名前の書き方</h3>
        <p>${escapeHtml(occasion.naming)}</p>
      </div>
    `;
  }

  function onOccasionChange() {
    const occasion = logic.findOccasion(data, occasionSelect.value);
    populateRelationOptions(occasion);
    renderResult();
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      // コピーに失敗しても致命的ではないため無視する
    }
    document.body.removeChild(ta);
  }

  function showCopyFeedback(btn) {
    const original = btn.textContent;
    btn.textContent = 'コピーしました';
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  }

  function onResultCardClick(event) {
    const btn = event.target.closest('.copy-btn');
    if (!btn) return;
    const text = btn.dataset.copyText || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showCopyFeedback(btn),
        () => {
          fallbackCopy(text);
          showCopyFeedback(btn);
        }
      );
    } else {
      fallbackCopy(text);
      showCopyFeedback(btn);
    }
  }

  populateOccasionOptions();
  onOccasionChange();

  occasionSelect.addEventListener('change', onOccasionChange);
  relationSelect.addEventListener('change', renderResult);
  amountInput.addEventListener('input', renderResult);
  resultCard.addEventListener('click', onResultCardClick);
})();
