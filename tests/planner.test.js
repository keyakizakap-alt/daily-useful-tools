import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_STREAK,
  SCORE_MODES,
  segments,
  findStreaks,
  summarize,
  listOpportunities,
  optimize,
} from '../src/lib/planner.js';
import { buildTimeline, DEFAULT_WEEKLY_OFF } from '../src/lib/calendar.js';
import { bruteForce, makeRandom, timelineFromPattern } from './helpers/brute-force.js';

function evaluate(timeline, picks, mode = 'balanced') {
  const { score } = SCORE_MODES[mode];
  return findStreaks(timeline, picks).reduce((sum, streak) => sum + score(streak.length), 0);
}

test('segments はブロックとギャップの交互列に分解する', () => {
  const { blocks, gaps } = segments(timelineFromPattern('oowwwoo'));
  assert.equal(blocks.length, gaps.length + 1);
  assert.deepEqual(blocks.map((b) => b.len), [2, 2]);
  assert.deepEqual(gaps.map((g) => g.len), [3]);
});

test('segments は両端が出勤日でも長さ0のブロックで揃える', () => {
  const { blocks, gaps } = segments(timelineFromPattern('wwoow'));
  assert.deepEqual(blocks.map((b) => b.len), [0, 2, 0]);
  assert.deepEqual(gaps.map((g) => g.len), [2, 1]);
});

test('segments は選択できない日を maxA / maxB / canMerge に反映する', () => {
  const timeline = timelineFromPattern('owwwo');
  timeline[2].selectable = false; // 真ん中だけ対象外
  const { gaps } = segments(timeline);
  assert.equal(gaps[0].maxA, 1);
  assert.equal(gaps[0].maxB, 1);
  assert.equal(gaps[0].canMerge, false);
});

test('findStreaks は休みと有給をつないだ連続日を返す', () => {
  const timeline = timelineFromPattern('oowoo');
  const streaks = findStreaks(timeline, [timeline[2].date]);
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].length, 5);
  assert.deepEqual(streaks[0].leaveDates, [timeline[2].date]);

  const without = findStreaks(timeline, []);
  assert.deepEqual(without.map((s) => s.length), [2, 2]);
});

test('summarize は3日以上の連休だけを数える', () => {
  const timeline = timelineFromPattern('ooowwoo');
  const stats = summarize(timeline, []);
  assert.equal(stats.count, 1);
  assert.equal(stats.longest, 3);
  assert.equal(stats.usedDays, 0);
});

test('optimize: 1日の有給で休みと休みをつなぐ', () => {
  const timeline = timelineFromPattern('oowoo');
  const result = optimize(timeline, { budget: 1 });
  assert.deepEqual(result.picks, [timeline[2].date]);
  assert.equal(result.score, 3); // 5連休の「3日目以降」= 3日ぶん
  assert.equal(result.baseline, 0); // 2連休は連休として数えない
  assert.equal(result.gained, 3);
});

test('optimize: 長い休みに1日足すより、週末どうしをつなぐ方を選ぶ', () => {
  // 左: 5連休の隣に1日足せる / 右: 週末と週末を1日でつなげる
  const timeline = timelineFromPattern('ooooowwwwwoowoo');
  const result = optimize(timeline, { budget: 1 });
  assert.deepEqual(result.picks, [timeline[12].date]); // 'oowoo' 側の出勤日
  assert.equal(findStreaks(timeline, result.picks).some((s) => s.length === 5), true);
});

test('optimize: 予算0では何も選ばない', () => {
  const timeline = timelineFromPattern('oowwoo');
  const result = optimize(timeline, { budget: 0 });
  assert.deepEqual(result.picks, []);
  assert.equal(result.usedDays, 0);
});

test('optimize: 予算が余っても無駄に消費しない', () => {
  const timeline = timelineFromPattern('oowoo');
  const result = optimize(timeline, { budget: 5 });
  assert.equal(result.usedDays, 1);
});

test('optimize: 選べない日は使わない', () => {
  const timeline = timelineFromPattern('oowoo');
  timeline[2].selectable = false;
  const result = optimize(timeline, { budget: 3 });
  assert.deepEqual(result.picks, []);
});

test('optimize: ねらいによって選び方が変わる', () => {
  //  休み2 + 出勤1 + 休み2 + 出勤1 + 休み2（有給1日ぶんの予算）
  const timeline = timelineFromPattern('oowoowoo');
  const balanced = optimize(timeline, { budget: 1, mode: 'balanced' });
  const longest = optimize(timeline, { budget: 1, mode: 'longest' });
  assert.equal(balanced.usedDays, 1);
  assert.equal(longest.usedDays, 1);
  // どちらも5連休がひとつできる（この形では差が出ない）ことを確認する
  assert.equal(evaluate(timeline, balanced.picks, 'balanced'), 3);
  assert.equal(evaluate(timeline, longest.picks, 'longest'), 25);
});

test('optimize: 長さ重視では1本の長い連休に集中する', () => {
  // 3日ぶんの予算。分散させれば 5連休×1 + 4連休×1、集中させれば 8連休×1。
  const timeline = timelineFromPattern('oowoooowwoo');
  const longest = optimize(timeline, { budget: 3, mode: 'longest' });
  const streaks = findStreaks(timeline, longest.picks);
  assert.equal(Math.max(...streaks.map((s) => s.length)), 11);
});

test('optimize の結果は総当たりの最適解と一致する（無作為な入力）', () => {
  const random = makeRandom(20260921);
  for (let trial = 0; trial < 40; trial += 1) {
    const length = 18 + Math.floor(random() * 8);
    const pattern = Array.from({ length }, () => (random() < 0.32 ? 'o' : 'w')).join('');
    const timeline = timelineFromPattern(pattern);
    const budget = trial % 4;
    const mode = trial % 2 === 0 ? 'balanced' : 'longest';

    const best = bruteForce(timeline, { budget, mode });
    const result = optimize(timeline, { budget, mode });

    assert.equal(
      result.score,
      best.score,
      `pattern=${pattern} budget=${budget} mode=${mode} dp=${result.score} brute=${best.score}`,
    );
    // 返した取得日を実際に評価しても同じ点数になること（再構成の検証）
    assert.equal(evaluate(timeline, result.picks, mode), result.score);
    assert.ok(result.picks.length <= budget, '予算を超えて選んでいる');
    assert.equal(new Set(result.picks).size, result.picks.length, '同じ日を重複して選んでいる');
    for (const date of result.picks) {
      const entry = timeline.find((item) => item.date === date);
      assert.ok(entry && !entry.off && entry.selectable, `選べない日を選んでいる: ${date}`);
    }
  }
});

test('listOpportunities は効きめの高い順に並ぶ', () => {
  const timeline = timelineFromPattern('oowoowwoo');
  const rows = listOpportunities(timeline, { maxCost: 5 });
  assert.ok(rows.length > 0);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i - 1].valuePerLeave >= rows[i].valuePerLeave, '効きめの降順になっていない');
  }
  // 有給1日で 2日+2日 をつないで5連休にする取り方が先頭
  assert.equal(rows[0].cost, 1);
  assert.equal(rows[0].streakLength, 5);
  assert.equal(rows[0].baseLength, 4);
  assert.equal(rows[0].valuePerLeave, 3);
});

test('listOpportunities はすでに長い休みへの1日追加を上位に出さない', () => {
  // 左: 5連休に1日足せる（6連休） / 右: 2日+2日を1日でつないで5連休
  const timeline = timelineFromPattern('ooooowwwwwoowoo');
  const rows = listOpportunities(timeline, { maxCost: 1 });
  assert.equal(rows[0].streakLength, 5, 'つなぐ取り方が先頭でない');
  assert.equal(rows[0].baseLength, 4);
  const extendGw = rows.find((row) => row.streakLength === 6);
  assert.ok(extendGw, '6連休の候補自体は残っている');
  assert.ok(rows.indexOf(extendGw) > 0, '6連休の候補が先頭に来ている');
});

test('listOpportunities は3日未満の連休を候補にしない', () => {
  const timeline = timelineFromPattern('wwwwww');
  const rows = listOpportunities(timeline, { maxCost: 2 });
  assert.deepEqual(rows, []);
});

test('2026年・土日祝休みでの実データ', () => {
  const timeline = buildTimeline({
    start: '2025-12-01',
    end: '2027-01-31',
    weeklyOff: DEFAULT_WEEKLY_OFF,
    selectableFrom: '2026-01-01',
    selectableTo: '2026-12-31',
  });

  // 9/24(木)・9/25(金) を取ると 9/19〜9/27 の9連休になる（有給2日で効率4.5倍）。
  const rows = listOpportunities(timeline, { maxCost: 5, limit: 100 });
  const silverWeek = rows.find(
    (row) => row.dates.length === 2 && row.dates[0] === '2026-09-24' && row.dates[1] === '2026-09-25',
  );
  assert.ok(silverWeek, '9月の橋渡しが候補に出ていない');
  assert.equal(silverWeek.streakLength, 9);
  assert.equal(silverWeek.baseLength, 7); // 9/19〜9/23 の5日と 9/26〜9/27 の2日
  assert.equal(silverWeek.valuePerLeave, 2);

  const result = optimize(timeline, { budget: 5, mode: 'balanced' });
  assert.equal(result.usedDays <= 5, true);
  const stats = summarize(timeline, result.picks, {
    within: { from: '2026-01-01', to: '2026-12-31' },
  });
  // ゴールデンウィーク（5/2〜5/10 の9連休）は有給2日で作れるので、5日の予算なら必ず拾う。
  assert.ok(
    stats.streaks.some((streak) => streak.start === '2026-05-02' && streak.length === 9),
    'ゴールデンウィークをつないでいない',
  );
  assert.ok(stats.longest >= 9, `最長連休が短い: ${stats.longest}`);
  assert.ok(stats.count >= 8, `連休の回数が少ない: ${stats.count}`);
  assert.ok(stats.streaks.every((streak) => streak.length >= MIN_STREAK));

  // 長さ重視では1本に集中する
  const focused = optimize(timeline, { budget: 5, mode: 'longest' });
  const focusedStats = summarize(timeline, focused.picks, {
    within: { from: '2026-01-01', to: '2026-12-31' },
  });
  assert.ok(focusedStats.longest >= 13, `長さ重視で伸びていない: ${focusedStats.longest}`);
});

test('1年ぶんの最適化が現実的な時間で終わる', () => {
  const timeline = buildTimeline({
    start: '2025-12-01',
    end: '2027-01-31',
    weeklyOff: DEFAULT_WEEKLY_OFF,
    selectableFrom: '2026-01-01',
    selectableTo: '2026-12-31',
  });
  const started = performance.now();
  optimize(timeline, { budget: 40, mode: 'longest' });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1000, `最適化に時間がかかりすぎている: ${elapsed.toFixed(0)}ms`);
});

test('週休も祝日もない極端な設定でも落ちない', () => {
  const timeline = buildTimeline({
    start: '2026-01-01',
    end: '2026-12-31',
    weeklyOff: [false, false, false, false, false, false, false],
    useHolidays: false,
  });
  const result = optimize(timeline, { budget: 5, mode: 'balanced' });
  assert.equal(result.usedDays, 5);
  assert.equal(findStreaks(timeline, result.picks)[0].length, 5);
});
