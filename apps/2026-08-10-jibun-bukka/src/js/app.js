// じぶん物価 — UI層（DOM操作・イベントハンドリング）
(function () {
  'use strict';

  const { groupByItem, computeItemChange, computeJibunBukkaIndex, computeRanking, recordsToCSV, csvToRecords, generateId } =
    window.JibunBukka;
  const { loadRecords, saveRecords } = window.JibunBukkaStorage;

  let records = loadRecords();

  const el = {
    form: document.getElementById('record-form'),
    itemInput: document.getElementById('item-input'),
    priceInput: document.getElementById('price-input'),
    dateInput: document.getElementById('date-input'),
    itemList: document.getElementById('item-list'),
    formMessage: document.getElementById('form-message'),
    summary: document.getElementById('summary'),
    rankingList: document.getElementById('ranking-list'),
    itemSelect: document.getElementById('item-select'),
    itemChange: document.getElementById('item-change'),
    graphContainer: document.getElementById('graph-container'),
    recordsTbody: document.getElementById('records-tbody'),
    exportBtn: document.getElementById('export-btn'),
    importInput: document.getElementById('import-input'),
    importLabel: document.getElementById('import-label'),
    dataMessage: document.getElementById('data-message'),
  };

  function formatYen(price) {
    return `${price.toLocaleString('ja-JP')}円`;
  }

  function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function formatPercent(p) {
    const sign = p > 0 ? '+' : '';
    return `${sign}${p.toFixed(1)}%`;
  }

  function persist() {
    return saveRecords(records);
  }

  function render() {
    renderItemList();
    renderSummary();
    renderRanking();
    renderItemSelect();
    renderGraph();
    renderTable();
  }

  function renderItemList() {
    const items = Array.from(new Set(records.map((r) => r.item))).sort();
    el.itemList.innerHTML = items.map((i) => `<option value="${escapeHtml(i)}"></option>`).join('');
  }

  function renderSummary() {
    const result = computeJibunBukkaIndex(records);
    if (!result) {
      el.summary.innerHTML = '<p class="empty-state">まだデータが足りません。同じ品目を2回以上記録すると指数が表示されます。</p>';
      return;
    }
    const cls = result.indexPercent > 0 ? 'up' : result.indexPercent < 0 ? 'down' : '';
    el.summary.innerHTML = `
      <div class="index-value ${cls}">${formatPercent(result.indexPercent)}</div>
      <p class="index-meta">${result.sampleSize}品目の平均変化率から算出</p>
    `;
  }

  function renderRanking() {
    const ranking = computeRanking(records, 5);
    if (ranking.length === 0) {
      el.rankingList.innerHTML = '<li class="empty-state">まだランキングを表示できるデータがありません。</li>';
      return;
    }
    el.rankingList.innerHTML = ranking
      .map((c, i) => {
        const cls = c.changePercent > 0 ? 'up' : c.changePercent < 0 ? 'down' : '';
        return `
          <li class="ranking-item">
            <span><span class="rank">${i + 1}位</span>${escapeHtml(c.item)}</span>
            <span class="change ${cls}">${formatPercent(c.changePercent)}</span>
          </li>
        `;
      })
      .join('');
  }

  function renderItemSelect() {
    const items = Array.from(new Set(records.map((r) => r.item))).sort();
    const prev = el.itemSelect.value;
    el.itemSelect.innerHTML =
      '<option value="">品目を選んでください</option>' +
      items.map((i) => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');
    if (items.includes(prev)) el.itemSelect.value = prev;
  }

  function renderGraph() {
    const item = el.itemSelect.value;
    if (!item) {
      el.itemChange.textContent = '';
      el.graphContainer.innerHTML = '<p class="empty-state">品目を選択するとグラフが表示されます。</p>';
      return;
    }
    const groups = groupByItem(records);
    const itemRecords = groups[item] || [];
    const change = computeItemChange(itemRecords);

    if (itemRecords.length < 2) {
      el.itemChange.textContent = 'この品目はまだ1件しか記録がありません。もう1件記録すると推移がわかります。';
      el.graphContainer.innerHTML = '<p class="empty-state">グラフを表示するにはあと1件記録が必要です。</p>';
      return;
    }

    const cls = change.changePercent > 0 ? 'up' : change.changePercent < 0 ? 'down' : '';
    el.itemChange.innerHTML = `初回 ${formatYen(change.first.price)}（${change.first.date}） → 最新 ${formatYen(change.last.price)}（${change.last.date}） <span class="change ${cls}">${formatPercent(change.changePercent)}</span>`;

    el.graphContainer.innerHTML = buildSvgLineChart(itemRecords);
  }

  function buildSvgLineChart(itemRecords) {
    const width = 600;
    const height = 200;
    const padding = 32;
    const prices = itemRecords.map((r) => r.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    const points = itemRecords.map((r, i) => {
      const x = padding + (i / (itemRecords.length - 1)) * (width - padding * 2);
      const y = height - padding - ((r.price - minP) / range) * (height - padding * 2);
      return { x, y, r };
    });

    const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const circles = points
      .map(
        (p) =>
          `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#c0512b"><title>${escapeHtml(p.r.date)}: ${p.r.price}円</title></circle>`
      )
      .join('');
    const labels = points
      .map((p, i) => (i === 0 || i === points.length - 1 ? `<text x="${p.x.toFixed(1)}" y="${height - 6}" font-size="10" text-anchor="middle" fill="#767267">${escapeHtml(p.r.date)}</text>` : ''))
      .join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="価格推移グラフ">
        <polyline points="${polyline}" fill="none" stroke="#c0512b" stroke-width="2" />
        ${circles}
        ${labels}
      </svg>
    `;
  }

  function renderTable() {
    if (records.length === 0) {
      el.recordsTbody.innerHTML = '<tr><td colspan="4" class="empty-state">記録がありません</td></tr>';
      return;
    }
    const sorted = records.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    el.recordsTbody.innerHTML = sorted
      .map(
        (r) => `
        <tr data-id="${escapeHtml(r.id)}">
          <td>${escapeHtml(r.date)}</td>
          <td>${escapeHtml(r.item)}</td>
          <td>${formatYen(r.price)}</td>
          <td><button class="delete-btn" type="button" data-id="${escapeHtml(r.id)}">削除</button></td>
        </tr>
      `
      )
      .join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const item = el.itemInput.value.trim();
    const price = Number(el.priceInput.value);
    const date = el.dateInput.value;

    if (!item || !date || !Number.isFinite(price) || price <= 0) {
      el.formMessage.textContent = '品目名・価格（1円以上）・購入日を正しく入力してください。';
      return;
    }

    const newRecord = { id: generateId(), item, price, date };
    records.push(newRecord);
    if (!persist()) {
      records.pop();
      el.formMessage.textContent = '保存に失敗しました。ブラウザのストレージ容量やプライベートブラウジング設定をご確認ください。';
      return;
    }
    el.formMessage.textContent = `「${item}」を記録しました。`;
    el.itemInput.value = '';
    el.priceInput.value = '';
    el.dateInput.value = todayStr();
    render();
  });

  el.recordsTbody.addEventListener('click', (e) => {
    const target = e.target.closest('.delete-btn');
    if (!target) return;
    const id = target.getAttribute('data-id');
    const before = records;
    records = records.filter((r) => r.id !== id);
    if (!persist()) {
      records = before;
      el.formMessage.textContent = '削除の保存に失敗しました。もう一度お試しください。';
      return;
    }
    render();
  });

  el.itemSelect.addEventListener('change', renderGraph);

  el.exportBtn.addEventListener('click', () => {
    if (records.length === 0) {
      el.dataMessage.textContent = 'エクスポートする記録がありません。';
      return;
    }
    const csv = recordsToCSV(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jibun-bukka-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    el.dataMessage.textContent = `${records.length}件をエクスポートしました。`;
  });

  el.importLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.importInput.click();
    }
  });

  el.importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { records: imported, skipped } = csvToRecords(String(reader.result));
      const existingIds = new Set(records.map((r) => r.id));
      const duplicates = imported.filter((r) => existingIds.has(r.id)).length;
      const toAdd = imported.filter((r) => !existingIds.has(r.id));
      const before = records;
      records = records.concat(toAdd);
      if (!persist()) {
        records = before;
        el.dataMessage.textContent = '保存に失敗したため、インポートを取り消しました。';
        return;
      }
      render();
      const notes = [];
      if (skipped > 0) notes.push(`${skipped}件は不正な形式のためスキップ`);
      if (duplicates > 0) notes.push(`${duplicates}件は既存データと重複のためスキップ`);
      el.dataMessage.textContent = `${toAdd.length}件を読み込みました${notes.length > 0 ? `（${notes.join('、')}）` : ''}。`;
    };
    reader.onerror = () => {
      el.dataMessage.textContent = 'ファイルの読み込みに失敗しました。';
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  el.dateInput.value = todayStr();
  render();
})();
