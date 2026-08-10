const test = require('node:test');
const assert = require('node:assert/strict');
const {
  groupByItem,
  computeItemChange,
  computeJibunBukkaIndex,
  computeRanking,
  recordsToCSV,
  csvToRecords,
} = require('../src/js/priceIndex.js');

function rec(id, item, price, date) {
  return { id, item, price, date };
}

test('groupByItem groups records by item and sorts by date ascending', () => {
  const records = [
    rec('1', 'たまご', 298, '2026-07-01'),
    rec('2', 'たまご', 258, '2026-01-01'),
    rec('3', '牛乳', 200, '2026-03-01'),
  ];
  const groups = groupByItem(records);
  assert.deepEqual(Object.keys(groups).sort(), ['たまご', '牛乳']);
  assert.equal(groups['たまご'][0].date, '2026-01-01');
  assert.equal(groups['たまご'][1].date, '2026-07-01');
});

test('computeItemChange returns null when fewer than 2 records', () => {
  const records = [rec('1', 'たまご', 258, '2026-01-01')];
  assert.equal(computeItemChange(records), null);
});

test('computeItemChange computes percent change from first to last by date', () => {
  const records = [
    rec('1', 'たまご', 298, '2026-07-01'),
    rec('2', 'たまご', 258, '2026-01-01'),
  ];
  const change = computeItemChange(records);
  assert.equal(change.first.price, 258);
  assert.equal(change.last.price, 298);
  assert.ok(Math.abs(change.changePercent - 15.503875968992248) < 1e-9);
});

test('computeJibunBukkaIndex returns null when no item has 2+ records', () => {
  const records = [rec('1', 'たまご', 258, '2026-01-01'), rec('2', '牛乳', 200, '2026-01-01')];
  assert.equal(computeJibunBukkaIndex(records), null);
});

test('computeJibunBukkaIndex averages change percent across qualifying items', () => {
  const records = [
    rec('1', 'たまご', 100, '2026-01-01'),
    rec('2', 'たまご', 110, '2026-02-01'), // +10%
    rec('3', '牛乳', 200, '2026-01-01'),
    rec('4', '牛乳', 180, '2026-02-01'), // -10%
    rec('5', 'コーヒー', 500, '2026-01-01'), // only 1 record, excluded
  ];
  const result = computeJibunBukkaIndex(records);
  assert.equal(result.sampleSize, 2);
  assert.ok(Math.abs(result.indexPercent - 0) < 1e-9);
});

test('computeRanking sorts by change percent descending and limits to topN', () => {
  const records = [
    rec('1', 'A', 100, '2026-01-01'),
    rec('2', 'A', 150, '2026-02-01'), // +50%
    rec('3', 'B', 100, '2026-01-01'),
    rec('4', 'B', 105, '2026-02-01'), // +5%
    rec('5', 'C', 100, '2026-01-01'),
    rec('6', 'C', 200, '2026-02-01'), // +100%
  ];
  const ranking = computeRanking(records, 2);
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].item, 'C');
  assert.equal(ranking[1].item, 'A');
});

test('recordsToCSV and csvToRecords round-trip', () => {
  const records = [
    rec('r1', 'たまご(10個)', 258, '2026-01-01'),
    rec('r2', '牛乳, 1L', 200, '2026-02-01'),
  ];
  const csv = recordsToCSV(records);
  const { records: parsed, skipped } = csvToRecords(csv);
  assert.equal(skipped, 0);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].item, 'たまご(10個)');
  assert.equal(parsed[1].item, '牛乳, 1L');
  assert.equal(parsed[1].price, 200);
});

test('csvToRecords skips invalid rows and reports the count', () => {
  const csv = 'id,item,price,date\n' + 'r1,たまご,258,2026-01-01\n' + 'r2,,,2026-01-02\n' + 'r3,牛乳,-5,2026-01-03\n';
  const { records, skipped } = csvToRecords(csv);
  assert.equal(records.length, 1);
  assert.equal(skipped, 2);
});
