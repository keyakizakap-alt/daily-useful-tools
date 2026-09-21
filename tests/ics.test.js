import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeText, stripControls, foldLine, toDateValue, toTimestamp, createUidFactory, buildLeaveCalendar } from '../src/lib/ics.js';

const NOW = new Date('2026-09-21T03:04:05.000Z');
const uid = () => 'fixed-uid@tsunagiyasumi';

test('TEXT 値をエスケープする', () => {
  assert.equal(escapeText('a\\b'), 'a\\\\b');
  assert.equal(escapeText('a;b'), 'a\\;b');
  assert.equal(escapeText('a,b'), 'a\\,b');
  assert.equal(escapeText('a\nb'), 'a\\nb');
  assert.equal(escapeText('a\r\nb'), 'a\\nb');
  // バックスラッシュを先に処理しているので二重エスケープにならない
  assert.equal(escapeText('\\;'), '\\\\\\;');
});

test('制御文字を除去する', () => {
  assert.equal(stripControls('a\u0000b\u0007c'), 'abc');
  assert.equal(stripControls('保持\tする'), '保持\tする');
});

test('ラベルに改行を混ぜても行が分割されない（インジェクション対策）', () => {
  const evil = '年末年始\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:偽物';
  const ics = buildLeaveCalendar({
    picks: ['2026-12-29'],
    streaks: [{ start: '2026-12-29', end: '2026-12-29', length: 1, leaveDates: ['2026-12-29'] }],
    now: NOW,
    uid,
    summary: evil,
  });
  // 折り返しを戻した「論理行」で見て、イベントが増えていないこと
  const lines = unfold(ics);
  assert.equal(lines.filter((line) => line === 'BEGIN:VEVENT').length, 1);
  assert.equal(lines.filter((line) => line.startsWith('SUMMARY:')).length, 1);
  assert.equal(lines.some((line) => line.startsWith('SUMMARY:偽物')), false);
  // 改行はエスケープされて1行の中に収まっている
  assert.equal(lines.some((line) => line.includes('\\nEND:VEVENT\\nBEGIN:VEVENT')), true);
});

/** 継続行（先頭スペース）を連結して論理行に戻す。 */
function unfold(ics) {
  const lines = [];
  for (const line of ics.split('\r\n')) {
    if (line.startsWith(' ') && lines.length > 0) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

test('75オクテットで折り返し、マルチバイト文字を分割しない', () => {
  const line = `DESCRIPTION:${'あ'.repeat(60)}`;
  const folded = foldLine(line);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1, '折り返されていない');
  for (const part of lines) {
    assert.ok(Buffer.byteLength(part, 'utf8') <= 75, `75オクテットを超えている: ${Buffer.byteLength(part, 'utf8')}`);
  }
  for (const part of lines.slice(1)) assert.equal(part.startsWith(' '), true);
  // 折り返しを戻すと元の文字列に一致する（文字が壊れていない）
  assert.equal(lines.map((part, i) => (i === 0 ? part : part.slice(1))).join(''), line);
});

test('短い行は折り返さない', () => {
  assert.equal(foldLine('BEGIN:VCALENDAR'), 'BEGIN:VCALENDAR');
});

test('日付・時刻の書式', () => {
  assert.equal(toDateValue('2026-09-21'), '20260921');
  assert.equal(toTimestamp(NOW), '20260921T030405Z');
});

test('終日イベントとして書き出す', () => {
  const ics = buildLeaveCalendar({
    picks: ['2026-09-25', '2026-09-24'],
    streaks: [
      { start: '2026-09-19', end: '2026-09-27', length: 9, leaveDates: ['2026-09-24', '2026-09-25'] },
    ],
    now: NOW,
    uid,
  });

  assert.equal(ics.startsWith('BEGIN:VCALENDAR\r\n'), true);
  assert.equal(ics.endsWith('END:VCALENDAR\r\n'), true);
  // 改行はすべて CRLF（LF 単独の改行が無い）
  assert.equal(ics.split('\n').length - 1, ics.split('\r\n').length - 1);

  const lines = ics.split('\r\n');
  assert.equal(lines.filter((line) => line === 'BEGIN:VEVENT').length, 2);
  // 日付順に並び、DTEND は翌日（排他）
  assert.equal(lines.includes('DTSTART;VALUE=DATE:20260924'), true);
  assert.equal(lines.includes('DTEND;VALUE=DATE:20260925'), true);
  assert.equal(lines.includes('DTSTART;VALUE=DATE:20260925'), true);
  assert.equal(lines.includes('DTEND;VALUE=DATE:20260926'), true);
  assert.equal(lines.includes('DTSTAMP:20260921T030405Z'), true);
  assert.ok(ics.includes('9/19(土)'), '連休の説明が入っていない');
});

test('重複した日付はひとつにまとめる', () => {
  const ics = buildLeaveCalendar({ picks: ['2026-09-24', '2026-09-24'], now: NOW, uid });
  assert.equal(ics.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length, 1);
});

test('有給が無ければイベントのないカレンダーになる', () => {
  const ics = buildLeaveCalendar({ picks: [], now: NOW, uid });
  assert.equal(ics.includes('BEGIN:VEVENT'), false);
  assert.equal(ics.includes('END:VCALENDAR'), true);
});

test('UID は毎回異なる', () => {
  const factory = createUidFactory({});
  const a = factory();
  const b = factory();
  assert.notEqual(a, b);
  assert.equal(a.endsWith('@tsunagiyasumi'), true);
});
