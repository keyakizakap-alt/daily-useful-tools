// 保存値は「書き換えられうる外部入力」として扱う。壊れた値でも例外を投げず既定値へ倒すこと。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITS,
  STORAGE_KEY,
  defaultSettings,
  normalizeSettings,
  normalizeClosures,
  normalizePicks,
  normalizeLabel,
  loadSettings,
  saveSettings,
  clearSettings,
} from '../src/lib/settings.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test('既定値', () => {
  const settings = defaultSettings(2026);
  assert.equal(settings.year, 2026);
  assert.equal(settings.budget, 5);
  assert.deepEqual(settings.weeklyOff, [true, false, false, false, false, false, true]);
  assert.equal(settings.useHolidays, true);
  assert.equal(settings.picksTouched, false);
});

test('対象外の年は範囲内に丸める', () => {
  assert.equal(defaultSettings(1999).year, 2020);
  assert.equal(defaultSettings(2999).year, 2050);
  assert.equal(normalizeSettings({ year: 2100 }, { fallbackYear: 2026 }).year, 2050);
  assert.equal(normalizeSettings({ year: 2026.5 }, { fallbackYear: 2030 }).year, 2030);
});

test('型が違う値は既定値に倒れる', () => {
  for (const raw of [null, undefined, 'string', 42, [], () => {}]) {
    const settings = normalizeSettings(raw, { fallbackYear: 2026 });
    assert.equal(settings.year, 2026);
    assert.equal(settings.budget, 5);
  }
});

test('有給日数の範囲を制限する', () => {
  assert.equal(normalizeSettings({ budget: -5 }).budget, 0);
  assert.equal(normalizeSettings({ budget: 9999 }).budget, LIMITS.budgetMax);
  assert.equal(normalizeSettings({ budget: 3.9 }).budget, 3);
  assert.equal(normalizeSettings({ budget: Number.NaN }).budget, 5);
  assert.equal(normalizeSettings({ budget: '10' }).budget, 5);
});

test('週休の配列は長さ7・真偽値のみ受け付ける', () => {
  assert.deepEqual(normalizeSettings({ weeklyOff: [1, 0, 0, 0, 0, 0, 1] }).weeklyOff, [
    false, false, false, false, false, false, false,
  ]);
  assert.deepEqual(normalizeSettings({ weeklyOff: [true, true] }).weeklyOff, [
    true, false, false, false, false, false, true,
  ]);
  assert.deepEqual(normalizeSettings({ weeklyOff: 'ttttttt' }).weeklyOff, [
    true, false, false, false, false, false, true,
  ]);
});

test('未知のモード・テーマは既定値に倒れる', () => {
  assert.equal(normalizeSettings({ mode: 'evil' }).mode, 'balanced');
  assert.equal(normalizeSettings({ mode: 'toString' }).mode, 'balanced'); // プロトタイプ汚染の回避
  assert.equal(normalizeSettings({ theme: 'rainbow' }).theme, 'auto');
  assert.equal(normalizeSettings({ theme: 'dark' }).theme, 'dark');
});

test('休業日の検証', () => {
  const closures = normalizeClosures([
    { start: '2026-12-29', end: '2027-01-03', label: '年末年始' },
    { start: '2026-13-01', end: '2026-13-02', label: '不正な日付' },
    { start: '2026-05-02', end: '2026-05-01', label: '逆転' },
    { start: '2026-01-01', end: '2028-01-01', label: '長すぎる' },
    { start: '2026-08-13', end: '2026-08-15' },
    'not-an-object',
    null,
  ]);
  assert.equal(closures.length, 2);
  assert.equal(closures[0].label, '年末年始');
  assert.equal(closures[1].label, '会社休業日');
});

test('休業日の件数を制限する', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    start: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    end: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    label: `休業${i}`,
  }));
  assert.equal(normalizeClosures(many).length, LIMITS.closuresMax);
});

test('ラベルは制御文字を除き長さを制限する', () => {
  assert.equal(normalizeLabel('年末\n年始'), '年末 年始');
  assert.equal(normalizeLabel('  余白  '), '余白');
  assert.equal(normalizeLabel('あ'.repeat(100)).length, LIMITS.labelMaxLength);
  assert.equal(normalizeLabel(12345), '');
  assert.equal(normalizeLabel(null), '');
});

test('取得日は妥当な日付だけ・重複なし・件数制限つき', () => {
  assert.deepEqual(normalizePicks(['2026-05-01', '2026-05-01', 'bad', 42, null]), ['2026-05-01']);
  assert.deepEqual(normalizePicks('2026-05-01'), []);
  const many = Array.from({ length: 500 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`);
  assert.ok(normalizePicks(many).length <= LIMITS.picksMax);
});

test('壊れた保存値でも起動できる', () => {
  for (const stored of ['{', 'null', '[]', '"文字列"', '{"budget": {"$ne": null}}']) {
    const storage = fakeStorage({ [STORAGE_KEY]: stored });
    const settings = loadSettings(storage, { fallbackYear: 2026 });
    assert.equal(settings.year, 2026);
    assert.equal(settings.budget, 5);
  }
});

test('保存・読み込み・消去', () => {
  const storage = fakeStorage();
  const settings = { ...defaultSettings(2026), budget: 12, picksTouched: true, picks: ['2026-05-01'] };
  assert.equal(saveSettings(storage, settings), true);
  const loaded = loadSettings(storage, { fallbackYear: 2026 });
  assert.equal(loaded.budget, 12);
  assert.deepEqual(loaded.picks, ['2026-05-01']);
  assert.equal(loaded.picksTouched, true);
  clearSettings(storage);
  assert.equal(loadSettings(storage, { fallbackYear: 2026 }).budget, 5);
});

test('localStorage が使えない環境でも例外を投げない', () => {
  const broken = {
    getItem() {
      throw new Error('アクセス拒否');
    },
    setItem() {
      throw new Error('容量超過');
    },
    removeItem() {
      throw new Error('アクセス拒否');
    },
  };
  assert.equal(loadSettings(broken, { fallbackYear: 2026 }).budget, 5);
  assert.equal(saveSettings(broken, defaultSettings(2026)), false);
  assert.equal(clearSettings(broken), false);
  assert.equal(loadSettings(undefined, { fallbackYear: 2026 }).year, 2026);
});
