// じぶん物価 — コアロジック（DOM非依存の純粋関数群）
// Node (CommonJS) とブラウザ (<script>) の両方から利用できるようにする。
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.JibunBukka = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * records: { id, item, price, date }[]
   * date は 'YYYY-MM-DD' 形式の文字列を想定
   */

  function groupByItem(records) {
    const groups = {};
    for (const r of records) {
      if (!groups[r.item]) groups[r.item] = [];
      groups[r.item].push(r);
    }
    for (const item of Object.keys(groups)) {
      groups[item] = groups[item].slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    return groups;
  }

  function computeItemChange(records) {
    const sorted = records.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (sorted.length < 2) return null;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const changePercent = ((last.price - first.price) / first.price) * 100;
    return {
      item: sorted[0].item,
      first,
      last,
      changePercent,
      count: sorted.length,
    };
  }

  function computeJibunBukkaIndex(records) {
    const groups = groupByItem(records);
    const changes = Object.values(groups)
      .map(computeItemChange)
      .filter((c) => c !== null);
    if (changes.length === 0) return null;
    const sum = changes.reduce((acc, c) => acc + c.changePercent, 0);
    return {
      indexPercent: sum / changes.length,
      sampleSize: changes.length,
    };
  }

  function computeRanking(records, topN) {
    const n = typeof topN === 'number' ? topN : 5;
    const groups = groupByItem(records);
    const changes = Object.values(groups)
      .map(computeItemChange)
      .filter((c) => c !== null);
    return changes.sort((a, b) => b.changePercent - a.changePercent).slice(0, n);
  }

  function csvEscape(value) {
    const s = String(value);
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function recordsToCSV(records) {
    const header = 'id,item,price,date';
    const lines = records.map((r) => [r.id, r.item, r.price, r.date].map(csvEscape).join(','));
    return [header, ...lines].join('\n');
  }

  function parseCSVLine(line) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  }

  function csvToRecords(csvText) {
    const lines = csvText.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
    if (lines.length === 0) return { records: [], skipped: 0 };
    const [headerLine, ...rest] = lines;
    const header = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());
    const idx = {
      id: header.indexOf('id'),
      item: header.indexOf('item'),
      price: header.indexOf('price'),
      date: header.indexOf('date'),
    };
    const records = [];
    let skipped = 0;
    for (const line of rest) {
      const fields = parseCSVLine(line);
      const item = idx.item >= 0 && fields[idx.item] ? fields[idx.item].trim() : undefined;
      const priceRaw = idx.price >= 0 ? fields[idx.price] : undefined;
      const date = idx.date >= 0 ? fields[idx.date] : undefined;
      const price = Number(priceRaw);
      if (!item || !date || !priceRaw || Number.isNaN(price) || price <= 0) {
        skipped++;
        continue;
      }
      const id = idx.id >= 0 && fields[idx.id] ? fields[idx.id] : generateId();
      records.push({ id, item, price, date });
    }
    return { records, skipped };
  }

  function generateId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  return {
    groupByItem,
    computeItemChange,
    computeJibunBukkaIndex,
    computeRanking,
    recordsToCSV,
    csvToRecords,
    generateId,
  };
});
