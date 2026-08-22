import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTime,
  formatTime,
  formatTimeWithDay,
  formatDuration,
  dayOffset,
  toHalfWidth,
} from '../src/lib/time.js';

test('parseTime: 基本的な時刻を分に変換する', () => {
  assert.equal(parseTime('00:00'), 0);
  assert.equal(parseTime('18:30'), 18 * 60 + 30);
  assert.equal(parseTime('23:59'), 1439);
});

test('parseTime: 1桁の時・分と前後の空白を受け付ける', () => {
  assert.equal(parseTime('9:05'), 545);
  assert.equal(parseTime('  7:00  '), 420);
});

test('parseTime: 全角数字と全角コロンを受け付ける', () => {
  assert.equal(parseTime('１８：３０'), 18 * 60 + 30);
});

test('parseTime: 不正な入力は日本語メッセージで例外になる', () => {
  assert.throws(() => parseTime('25:00'), /時が範囲外/);
  assert.throws(() => parseTime('12:70'), /分が範囲外/);
  assert.throws(() => parseTime('あさ'), /形式が不正/);
  assert.throws(() => parseTime('1830'), /形式が不正/);
  assert.throws(() => parseTime(1830), /文字列で指定/);
});

test('formatTime: 分を HH:MM に整形しゼロ埋めする', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(545), '09:05');
  assert.equal(formatTime(1439), '23:59');
});

test('formatTime: 日をまたぐ値を24時間で正規化する', () => {
  assert.equal(formatTime(-20), '23:40', '負の値は前日に回り込む');
  assert.equal(formatTime(1440), '00:00');
  assert.equal(formatTime(1500), '01:00');
});

test('dayOffset: 前日・当日・翌日を判別する', () => {
  assert.equal(dayOffset(-1), -1);
  assert.equal(dayOffset(0), 0);
  assert.equal(dayOffset(1439), 0);
  assert.equal(dayOffset(1440), 1);
});

test('formatTimeWithDay: 日跨ぎに日本語の接頭辞を付ける', () => {
  assert.equal(formatTimeWithDay(1110), '18:30');
  assert.equal(formatTimeWithDay(-20), '前日 23:40');
  assert.equal(formatTimeWithDay(1455), '翌日 00:15');
});

test('formatDuration: 日本語の所要時間表記にする', () => {
  assert.equal(formatDuration(0), '0分');
  assert.equal(formatDuration(45), '45分');
  assert.equal(formatDuration(60), '1時間');
  assert.equal(formatDuration(90), '1時間30分');
  assert.equal(formatDuration(125), '2時間5分');
});

test('formatDuration: 負の値は例外になる', () => {
  assert.throws(() => formatDuration(-1), /負の値/);
});

test('toHalfWidth: 全角数字とコロンだけを変換し他はそのまま', () => {
  assert.equal(toHalfWidth('１２：３４'), '12:34');
  assert.equal(toHalfWidth('味噌汁'), '味噌汁');
});
