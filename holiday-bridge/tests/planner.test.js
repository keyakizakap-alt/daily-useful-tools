/* ============================================================
   やすみつなぎ — プランナーの単体テスト
   実行: npm test
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');

const { addDays, dayOfWeek } = require('../src/holidays.js');
const {
  MAX_LEAVE_BUDGET,
  MIN_BRIDGE_DAYS,
  OBJECTIVE,
  REASON,
  buildCalendar,
  buildPlan,
  clampInt,
  defaultSettings,
  dowJa,
  findBridges,
  formatDateJa,
  formatDateJaWithYear,
  formatPlanText,
  formatRangeJa,
  parseCompanyOff,
  rankBridges,
  reasonLabel,
} = require('../src/planner.js');

/** 月〜金勤務の設定。 */
const MON_FRI = { workdays: [false, true, true, true, true, true, false], companyOff: [] };

function calendar2026(extra) {
  return buildCalendar('2026-01-01', '2026-12-31', { ...MON_FRI, ...extra });
}

/* ------------------------------------------------------------
   カレンダーの構築
   ------------------------------------------------------------ */

test('カレンダーは期間の両端を含み、日数が合う', () => {
  const days = buildCalendar('2026-01-01', '2026-12-31', MON_FRI);
  assert.equal(days.length, 365);
  assert.equal(days[0].date, '2026-01-01');
  assert.equal(days[days.length - 1].date, '2026-12-31');
  // 日付が 1 日ずつ連続している
  for (let i = 1; i < days.length; i += 1) {
    assert.equal(days[i].date, addDays(days[i - 1].date, 1));
    assert.equal(days[i].dow, dayOfWeek(days[i].date));
  }
});

test('土日は休み、平日は出勤になる', () => {
  const days = calendar2026();
  const jan = days.filter((d) => d.date.startsWith('2026-01'));
  const sat = jan.find((d) => d.date === '2026-01-03'); // 土
  const mon = jan.find((d) => d.date === '2026-01-05'); // 月
  assert.equal(sat.off, true);
  assert.equal(sat.reason, REASON.WEEKEND);
  assert.equal(mon.off, false);
  assert.equal(mon.reason, null);
});

test('祝日は休みになり、名称と種別が入る', () => {
  const days = calendar2026();
  const byDate = new Map(days.map((d) => [d.date, d]));
  assert.equal(byDate.get('2026-01-01').off, true);
  assert.equal(byDate.get('2026-01-01').name, '元日');
  assert.equal(byDate.get('2026-01-01').reason, REASON.HOLIDAY);
  assert.equal(byDate.get('2026-05-06').reason, REASON.SUBSTITUTE, '振替休日');
  assert.equal(byDate.get('2026-09-22').reason, REASON.CITIZENS, '国民の休日');
});

test('会社休業日は祝日より優先して表示される', () => {
  // 元日を会社休業日にも指定した場合、理由は会社休業日になる
  const days = buildCalendar('2026-01-01', '2026-01-05', {
    ...MON_FRI,
    companyOff: ['2026-01-01'],
  });
  assert.equal(days[0].reason, REASON.COMPANY);
  assert.equal(days[0].name, '会社休業日');
});

test('会社休業日は平日を休みにする', () => {
  const days = buildCalendar('2026-08-10', '2026-08-16', {
    ...MON_FRI,
    companyOff: ['2026-08-13', '2026-08-14'],
  });
  const byDate = new Map(days.map((d) => [d.date, d]));
  assert.equal(byDate.get('2026-08-13').off, true);
  assert.equal(byDate.get('2026-08-14').off, true);
  assert.equal(byDate.get('2026-08-12').off, false, '指定していない平日は出勤日');
});

test('勤務曜日の指定が壊れていても既定値で動く', () => {
  for (const bad of [null, undefined, [], [true], 'MTWTF', 42]) {
    const days = buildCalendar('2026-01-01', '2026-01-07', { workdays: bad });
    assert.equal(days.length, 7);
    // 既定値（月〜金）が使われ、1/3(土)・1/4(日) が休みになる
    const byDate = new Map(days.map((d) => [d.date, d]));
    assert.equal(byDate.get('2026-01-03').off, true);
    assert.equal(byDate.get('2026-01-05').off, false);
  }
});

test('カレンダーは不正な期間を弾く', () => {
  assert.throws(() => buildCalendar('2026-02-30', '2026-03-01', MON_FRI), TypeError);
  assert.throws(() => buildCalendar('2026-12-31', '2026-01-01', MON_FRI), RangeError);
});

/* ------------------------------------------------------------
   連休候補の列挙
   ------------------------------------------------------------ */

test('候補は 3 日以上で、両端が休日、前後が出勤日である（極大性）', () => {
  const days = calendar2026();
  const byIndex = days;
  const bridges = findBridges(days, 5);
  assert.ok(bridges.length > 0);

  for (const b of bridges) {
    assert.ok(b.totalDays >= MIN_BRIDGE_DAYS, `${b.start} が短すぎる`);
    assert.equal(b.totalDays, b.endIndex - b.startIndex + 1);
    // 前後が出勤日（極大性）
    if (b.startIndex > 0) {
      assert.equal(byIndex[b.startIndex - 1].off, false, `${b.start} の前日が休日`);
    }
    if (b.endIndex < days.length - 1) {
      assert.equal(byIndex[b.endIndex + 1].off, false, `${b.end} の翌日が休日`);
    }
    // 区間内の出勤日が、ちょうど leaveDates と一致する
    const inside = byIndex.slice(b.startIndex, b.endIndex + 1);
    const workInside = inside.filter((d) => !d.off).map((d) => d.date);
    assert.deepEqual(b.leaveDates, workInside, `${b.start} の有給日が区間内の出勤日と違う`);
    assert.equal(b.leaveCount, workInside.length);
  }
});

test('候補の有給日数は上限を超えない', () => {
  const days = calendar2026();
  for (const limit of [0, 1, 2, 5, 10]) {
    for (const b of findBridges(days, limit)) {
      assert.ok(b.leaveCount <= limit, `上限 ${limit} を超える候補 ${b.start}`);
    }
  }
});

test('上限 0 では有給を使わない連休だけが出る', () => {
  const days = calendar2026();
  const bridges = findBridges(days, 0);
  assert.ok(bridges.length > 0);
  for (const b of bridges) {
    assert.equal(b.leaveCount, 0);
    assert.equal(b.efficiency, null, '有給 0 日の効率は null');
  }
});

test('効率は 連休日数 ÷ 有給日数 である', () => {
  const days = calendar2026();
  for (const b of findBridges(days, 5)) {
    if (b.leaveCount === 0) assert.equal(b.efficiency, null);
    else assert.equal(b.efficiency, b.totalDays / b.leaveCount);
  }
});

test('2026年のゴールデンウィークは有給 1 日で 6 連休になる', () => {
  const days = calendar2026();
  const bridges = findBridges(days, 5);
  // 5/2(土)〜5/6(水・振替) は有給 0 日で 5 連休。5/1(金) に有給を 1 日入れると 6 連休
  const six = bridges.find((b) => b.start === '2026-05-01' && b.end === '2026-05-06');
  assert.ok(six, '5/1〜5/6 の候補がある');
  assert.equal(six.totalDays, 6);
  assert.equal(six.leaveCount, 1);
  assert.deepEqual(six.leaveDates, ['2026-05-01']);
});

test('2026年の秋の連休は有給 0 日で 5 連休ある', () => {
  const days = calendar2026();
  const free = findBridges(days, 0);
  const silver = free.find((b) => b.start === '2026-09-19');
  assert.ok(silver, '9/19 から始まる連休がある');
  assert.equal(silver.end, '2026-09-23');
  assert.equal(silver.totalDays, 5);
  assert.ok(silver.labels.includes('敬老の日'));
  assert.ok(silver.labels.includes('国民の休日'));
  assert.ok(silver.labels.includes('秋分の日'));
});

test('すべての曜日が休みなら期間全体が 1 つの候補になる', () => {
  const allOff = { workdays: [false, false, false, false, false, false, false], companyOff: [] };
  const days = buildCalendar('2026-01-01', '2026-01-31', allOff);
  const bridges = findBridges(days, 5);
  assert.equal(bridges.length, 1);
  assert.equal(bridges[0].totalDays, 31);
  assert.equal(bridges[0].leaveCount, 0);
});

test('休日が 1 日もない期間では、連休は有給だけでつくられる', () => {
  const allWork = { workdays: [true, true, true, true, true, true, true], companyOff: [] };
  // 2026 年 6 月は祝日がなく、全曜日出勤にすると休日が 1 日もない
  const days = buildCalendar('2026-06-01', '2026-06-30', allWork);
  assert.ok(days.every((d) => !d.off), '6月に休日がないこと');

  const bridges = findBridges(days, 3);
  assert.ok(bridges.length > 0);
  for (const b of bridges) {
    assert.equal(b.leaveCount, b.totalDays, '区間の全日が有給になる');
    assert.equal(b.totalDays, 3, '上限 3 日なので 3 連休だけが成立する');
  }
});

test('祝日は勤務曜日の設定より優先して休みになる', () => {
  const allWork = { workdays: [true, true, true, true, true, true, true], companyOff: [] };
  const days = buildCalendar('2026-01-01', '2026-01-05', allWork);
  assert.equal(days[0].off, true, '全曜日出勤でも元日は休み');
  assert.equal(days[0].name, '元日');
  assert.equal(days[1].off, false);
});

test('期間が短くても落ちない', () => {
  for (const [start, end] of [['2026-01-01', '2026-01-01'], ['2026-01-01', '2026-01-02']]) {
    const days = buildCalendar(start, end, MON_FRI);
    assert.doesNotThrow(() => findBridges(days, 5));
  }
});

/* ------------------------------------------------------------
   年間プランの最適化
   ------------------------------------------------------------ */

function planOf(budget, objective, maxPerBridge = 5) {
  const days = calendar2026();
  const bridges = findBridges(days, maxPerBridge);
  return { days, bridges, plan: buildPlan(days, bridges, budget, { objective }) };
}

test('プランは予算を超えず、候補が重複しない', () => {
  for (const budget of [0, 1, 3, 5, 10, 20, 40]) {
    for (const objective of [OBJECTIVE.LONG, OBJECTIVE.COUNT]) {
      const { plan } = planOf(budget, objective);
      assert.ok(plan.leaveUsed <= budget, `予算 ${budget} を超えた: ${plan.leaveUsed}`);
      assert.equal(
        plan.leaveUsed,
        plan.bridges.reduce((s, b) => s + b.leaveCount, 0),
        'leaveUsed の集計が合わない'
      );
      assert.equal(
        plan.totalDays,
        plan.bridges.reduce((s, b) => s + b.totalDays, 0),
        'totalDays の集計が合わない'
      );
      // 区間が重ならず、日付順に並んでいる
      for (let i = 1; i < plan.bridges.length; i += 1) {
        assert.ok(
          plan.bridges[i - 1].endIndex < plan.bridges[i].startIndex,
          `${plan.bridges[i - 1].end} と ${plan.bridges[i].start} が重複`
        );
      }
      // 有給を使う日が重複しない
      const all = plan.bridges.flatMap((b) => b.leaveDates);
      assert.equal(new Set(all).size, all.length, '同じ日に二重に有給を当てている');
    }
  }
});

test('予算 0 のプランは有給 0 日の連休だけを拾う', () => {
  const { plan } = planOf(0, OBJECTIVE.LONG);
  assert.equal(plan.leaveUsed, 0);
  assert.ok(plan.bridges.length > 0);
  for (const b of plan.bridges) assert.equal(b.leaveCount, 0);
});

test('予算を増やすと結果が悪化しない（単調性）', () => {
  for (const objective of [OBJECTIVE.LONG, OBJECTIVE.COUNT]) {
    let prev = -1;
    for (const budget of [0, 1, 2, 3, 5, 8, 10, 15, 20]) {
      const { plan } = planOf(budget, objective);
      assert.ok(
        plan.totalDays >= prev,
        `予算 ${budget}(${objective}) で合計日数が減った: ${prev} → ${plan.totalDays}`
      );
      prev = plan.totalDays;
    }
  }
});

test('貪欲法（効率順に詰める）より劣らない', () => {
  const budget = 10;
  const { days, bridges, plan } = planOf(budget, OBJECTIVE.COUNT);

  // 効率の高い順に、重複しない範囲で詰めていく貪欲法
  const greedy = [];
  const used = new Array(days.length).fill(false);
  let left = budget;
  const sorted = [...bridges].sort(
    (a, b) => (b.efficiency || 99) - (a.efficiency || 99) || b.totalDays - a.totalDays
  );
  for (const b of sorted) {
    if (b.leaveCount > left) continue;
    let free = true;
    for (let i = b.startIndex; i <= b.endIndex; i += 1) if (used[i]) { free = false; break; }
    if (!free) continue;
    for (let i = b.startIndex; i <= b.endIndex; i += 1) used[i] = true;
    left -= b.leaveCount;
    greedy.push(b);
  }
  const greedyDays = greedy.reduce((s, b) => s + b.totalDays, 0);
  assert.ok(
    plan.totalDays >= greedyDays,
    `DP(${plan.totalDays}) が貪欲法(${greedyDays}) に負けた`
  );
});

test('「長い連休を優先」は「休みの回数を優先」より最長連休が長い', () => {
  const long = planOf(10, OBJECTIVE.LONG).plan;
  const count = planOf(10, OBJECTIVE.COUNT).plan;
  const longest = (p) => p.bridges.reduce((m, b) => Math.max(m, b.totalDays), 0);
  assert.ok(
    longest(long) > longest(count),
    `long=${longest(long)} count=${longest(count)}`
  );
  // 一方で合計日数は「回数を優先」の方が大きい（こちらが線形の最大化）
  assert.ok(
    count.totalDays >= long.totalDays,
    `count=${count.totalDays} long=${long.totalDays}`
  );
});

/**
 * 総当たりのオラクル。
 * 期間内の出勤日から budget 日以内を選ぶ全組み合わせを試し、
 * 「3 日以上連続した休みの並び」について評価値の最大を求める。
 * DP とは独立に（候補の列挙を使わずに）解くため、最適性の検証になる。
 */
function bruteForceBest(days, budget, score) {
  const workIndexes = days.map((d, i) => (d.off ? -1 : i)).filter((i) => i >= 0);
  let best = 0;

  const evaluate = (chosen) => {
    const off = days.map((d) => d.off);
    for (const i of chosen) off[i] = true;
    let total = 0;
    let run = 0;
    for (let i = 0; i <= off.length; i += 1) {
      if (i < off.length && off[i]) {
        run += 1;
      } else {
        if (run >= MIN_BRIDGE_DAYS) total += score(run);
        run = 0;
      }
    }
    if (total > best) best = total;
  };

  const choose = (startAt, chosen) => {
    evaluate(chosen);
    if (chosen.length === budget) return;
    for (let k = startAt; k < workIndexes.length; k += 1) {
      chosen.push(workIndexes[k]);
      choose(k + 1, chosen);
      chosen.pop();
    }
  };
  choose(0, []);
  return best;
}

test('DP の結果が総当たりの最適解と一致する（両モード）', () => {
  // 総当たりが現実的な規模に絞る（約 2 か月・予算 3 日）
  const days = buildCalendar('2026-01-01', '2026-02-28', MON_FRI);
  const budget = 3;
  const bridges = findBridges(days, budget);

  const linear = buildPlan(days, bridges, budget, { objective: OBJECTIVE.COUNT });
  const bestLinear = bruteForceBest(days, budget, (run) => run);
  assert.equal(linear.totalDays, bestLinear, `回数優先: DP=${linear.totalDays} 総当たり=${bestLinear}`);

  const squared = buildPlan(days, bridges, budget, { objective: OBJECTIVE.LONG });
  const bestSquared = bruteForceBest(days, budget, (run) => run * run);
  const squaredScore = squared.bridges.reduce((sum, b) => sum + b.totalDays * b.totalDays, 0);
  assert.equal(squaredScore, bestSquared, `長さ優先: DP=${squaredScore} 総当たり=${bestSquared}`);
});

test('予算を使うと有給 0 日のときより連休日数が増える', () => {
  const withLeave = planOf(4, OBJECTIVE.COUNT).plan;
  const freeOnly = planOf(0, OBJECTIVE.COUNT).plan;
  assert.ok(
    withLeave.totalDays > freeOnly.totalDays,
    `${withLeave.totalDays} <= ${freeOnly.totalDays}`
  );
});

test('プランの既定の優先モードは「長い連休を優先」', () => {
  const days = calendar2026();
  const bridges = findBridges(days, 5);
  assert.equal(buildPlan(days, bridges, 5).objective, OBJECTIVE.LONG);
  assert.equal(buildPlan(days, bridges, 5, {}).objective, OBJECTIVE.LONG);
  assert.equal(buildPlan(days, bridges, 5, { objective: 'なにか' }).objective, OBJECTIVE.LONG);
  assert.equal(buildPlan(days, bridges, 5, { objective: OBJECTIVE.COUNT }).objective, OBJECTIVE.COUNT);
});

test('予算が不正でもプランは成立する', () => {
  const days = calendar2026();
  const bridges = findBridges(days, 5);
  for (const bad of [-5, NaN, null, undefined, 'たくさん', 1e9]) {
    const plan = buildPlan(days, bridges, bad);
    assert.ok(plan.leaveUsed >= 0);
    assert.ok(plan.leaveUsed <= MAX_LEAVE_BUDGET, `${String(bad)} で上限を超えた`);
  }
});

test('候補が空ならプランも空になる', () => {
  const days = calendar2026();
  const plan = buildPlan(days, [], 10);
  assert.deepEqual(plan.bridges, []);
  assert.equal(plan.totalDays, 0);
  assert.equal(plan.leaveUsed, 0);
});

/* ------------------------------------------------------------
   並べ替え
   ------------------------------------------------------------ */

test('効率ランキングは効率の降順で、有給 0 日を分けている', () => {
  const days = calendar2026();
  const { paid, free } = rankBridges(findBridges(days, 5));
  assert.ok(paid.length > 0 && free.length > 0);
  for (const b of paid) assert.ok(b.leaveCount > 0);
  for (const b of free) assert.equal(b.leaveCount, 0);
  for (let i = 1; i < paid.length; i += 1) {
    assert.ok(
      paid[i - 1].efficiency >= paid[i].efficiency,
      `効率が昇順になっている: ${paid[i - 1].start} → ${paid[i].start}`
    );
  }
  for (let i = 1; i < free.length; i += 1) {
    assert.ok(free[i - 1].totalDays >= free[i].totalDays, '有給 0 日の並びが日数降順でない');
  }
});

test('効率ランキングの先頭は 2026 年で有給 1 日 6 連休', () => {
  const days = calendar2026();
  const { paid } = rankBridges(findBridges(days, 5));
  assert.equal(paid[0].efficiency, 6);
  assert.equal(paid[0].leaveCount, 1);
  assert.equal(paid[0].totalDays, 6);
});

test('rankBridges は入力配列を書き換えない', () => {
  const days = calendar2026();
  const bridges = findBridges(days, 5);
  const before = bridges.map((b) => b.start);
  rankBridges(bridges);
  assert.deepEqual(bridges.map((b) => b.start), before);
});

/* ------------------------------------------------------------
   会社休業日の解析
   ------------------------------------------------------------ */

test('単日・期間・年つきの書式を解析できる', () => {
  assert.deepEqual(parseCompanyOff('8/13', 2026).dates, ['2026-08-13']);
  assert.deepEqual(parseCompanyOff('8/13-8/15', 2026).dates, [
    '2026-08-13', '2026-08-14', '2026-08-15',
  ]);
  assert.deepEqual(parseCompanyOff('2027/1/4', 2026).dates, ['2027-01-04']);
  assert.deepEqual(parseCompanyOff('2026-08-13', 2026).dates, ['2026-08-13'], 'ISO 形式');
});

test('ISO 形式のハイフンを期間の区切りと混同しない', () => {
  // '2026-08-13' が 3 つに割れて「区切りが多すぎる」にならないこと
  assert.deepEqual(parseCompanyOff('2026-08-13', 2026).errors, []);
  assert.deepEqual(parseCompanyOff('2026-08-13-2026-08-15', 2026).dates, [
    '2026-08-13', '2026-08-14', '2026-08-15',
  ]);
});

test('notBefore を渡すと、年の指定がない過去日付は翌年と解釈される', () => {
  // 対象期間が 2026-10-12 から始まるとき、「1/3」は 2027-01-03 を指す（レビュー R-02）
  const opts = { notBefore: '2026-10-12' };
  assert.deepEqual(parseCompanyOff('1/3', 2026, opts).dates, ['2027-01-03']);
  assert.deepEqual(parseCompanyOff('8/13-8/15', 2026, opts).dates, [
    '2027-08-13', '2027-08-14', '2027-08-15',
  ]);
  // 期間の開始以降の日付はずらさない
  assert.deepEqual(parseCompanyOff('10/20', 2026, opts).dates, ['2026-10-20']);
  assert.deepEqual(parseCompanyOff('12/29-1/3', 2026, opts).dates, [
    '2026-12-29', '2026-12-30', '2026-12-31',
    '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
});

test('notBefore でも、年を明示した日付はずらさない', () => {
  const opts = { notBefore: '2026-10-12' };
  assert.deepEqual(parseCompanyOff('2025/8/13', 2026, opts).dates, ['2025-08-13']);
  assert.deepEqual(parseCompanyOff('2026-08-13', 2026, opts).dates, ['2026-08-13']);
});

test('notBefore を渡さなければ従来どおりの解釈になる', () => {
  assert.deepEqual(parseCompanyOff('1/3', 2026).dates, ['2026-01-03']);
  assert.deepEqual(parseCompanyOff('1/3', 2026, {}).dates, ['2026-01-03']);
  assert.deepEqual(parseCompanyOff('1/3', 2026, { notBefore: null }).dates, ['2026-01-03']);
});

test('notBefore でずれた開始日より、終了日が後になる', () => {
  // 開始が翌年にずれたら、終了日も開始日より後に揃える
  const r = parseCompanyOff('1/3-1/5', 2026, { notBefore: '2026-10-12' });
  assert.deepEqual(r.dates, ['2027-01-03', '2027-01-04', '2027-01-05']);
  assert.deepEqual(r.errors, []);
});

test('全角数字を受け付ける', () => {
  assert.deepEqual(parseCompanyOff('２０２６/８/１３', 2026).dates, ['2026-08-13']);
});

test('区切りは改行・カンマ・読点を受け付ける', () => {
  const r = parseCompanyOff('8/13\n9/1, 9/2、9/3', 2026);
  assert.deepEqual(r.dates, ['2026-08-13', '2026-09-01', '2026-09-02', '2026-09-03']);
  assert.deepEqual(r.errors, []);
});

test('期間の区切りは - 〜 ~ を受け付ける', () => {
  for (const sep of ['-', '〜', '~', ' - ']) {
    const r = parseCompanyOff(`8/13${sep}8/14`, 2026);
    assert.deepEqual(r.dates, ['2026-08-13', '2026-08-14'], `区切り「${sep}」`);
  }
});

test('年をまたぐ期間は終了年を翌年とみなす', () => {
  const r = parseCompanyOff('12/29-1/3', 2026);
  assert.deepEqual(r.dates, [
    '2026-12-29', '2026-12-30', '2026-12-31',
    '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
  assert.deepEqual(r.errors, []);
});

test('日本語表記も受け付ける', () => {
  assert.deepEqual(parseCompanyOff('8月13日', 2026).dates, ['2026-08-13']);
});

test('重複した指定は 1 回にまとめ、昇順に並べる', () => {
  const r = parseCompanyOff('9/2, 8/13, 8/13-8/14', 2026);
  assert.deepEqual(r.dates, ['2026-08-13', '2026-08-14', '2026-09-02']);
});

test('不正な入力はエラーを返し、他の行は処理する', () => {
  const r = parseCompanyOff('8/13\n2/30\nあした\n13/1\n9/1', 2026);
  assert.deepEqual(r.dates, ['2026-08-13', '2026-09-01'], '正しい行は残る');
  assert.equal(r.errors.length, 3, `エラー 3 件: ${JSON.stringify(r.errors)}`);
  for (const message of r.errors) {
    assert.ok(
      /読み取れませんでした|実在しない日付です/.test(message),
      `日本語のエラー文言になっていない: ${message}`
    );
  }
});

test('空の入力はエラーなしで空になる', () => {
  for (const input of ['', '   ', '\n\n', null, undefined, 42]) {
    const r = parseCompanyOff(input, 2026);
    assert.deepEqual(r.dates, []);
    assert.deepEqual(r.errors, []);
  }
});

test('長すぎる期間と逆順の期間はエラーになる', () => {
  const tooLong = parseCompanyOff('2026/1/1-2028/1/1', 2026);
  assert.deepEqual(tooLong.dates, []);
  assert.equal(tooLong.errors.length, 1);
  assert.ok(/長すぎます/.test(tooLong.errors[0]));

  const reversed = parseCompanyOff('2027/1/5-2026/1/5', 2026);
  assert.deepEqual(reversed.dates, []);
  assert.equal(reversed.errors.length, 1);
});

test('区切りが 3 つ以上あるとエラーになる', () => {
  const r = parseCompanyOff('8/13-8/14-8/15', 2026);
  assert.deepEqual(r.dates, []);
  assert.equal(r.errors.length, 1);
});

/* ------------------------------------------------------------
   数値の正規化
   ------------------------------------------------------------ */

test('clampInt は範囲に収め、不正値は既定値にする', () => {
  assert.equal(clampInt(5, 0, 10, 3), 5);
  assert.equal(clampInt(-1, 0, 10, 3), 0);
  assert.equal(clampInt(99, 0, 10, 3), 10);
  assert.equal(clampInt('7', 0, 10, 3), 7);
  assert.equal(clampInt('7.9', 0, 10, 3), 7, '小数は切り捨て');
  assert.equal(clampInt(7.9, 0, 10, 3), 7);
  assert.equal(clampInt('abc', 0, 10, 3), 3);
  assert.equal(clampInt('', 0, 10, 3), 3);
  assert.equal(clampInt(null, 0, 10, 3), 3);
  assert.equal(clampInt(undefined, 0, 10, 3), 3);
  assert.equal(clampInt(NaN, 0, 10, 3), 3);
  assert.equal(clampInt(Infinity, 0, 10, 3), 3);
});

/* ------------------------------------------------------------
   表示・書き出し
   ------------------------------------------------------------ */

test('日付と曜日が日本語で整形される', () => {
  assert.equal(formatDateJa('2026-03-20'), '3月20日(金)');
  assert.equal(formatDateJa('2026-12-31'), '12月31日(木)');
  assert.equal(formatDateJa('壊れた値'), '');
  assert.equal(dowJa(0), '日');
  assert.equal(dowJa(6), '土');
  assert.equal(dowJa(9), '');
});

test('休日の理由が日本語ラベルになる', () => {
  assert.equal(reasonLabel(REASON.HOLIDAY), '祝日');
  assert.equal(reasonLabel(REASON.SUBSTITUTE), '振替休日');
  assert.equal(reasonLabel(REASON.CITIZENS), '国民の休日');
  assert.equal(reasonLabel(REASON.COMPANY), '会社休業日');
  assert.equal(reasonLabel(REASON.WEEKEND), '休み');
  assert.equal(reasonLabel('なにか'), '');
  assert.equal(reasonLabel(null), '');
});

test('連休の期間表示が「開始〜終了」になる', () => {
  const days = calendar2026();
  const b = findBridges(days, 0).find((x) => x.start === '2026-09-19');
  assert.equal(formatRangeJa(b), '9月19日(土)〜9月23日(水)');
  assert.equal(formatRangeJa(b, { withYear: true }), '2026年9月19日(土)〜9月23日(水)');
});

test('年つきの日付表示', () => {
  assert.equal(formatDateJaWithYear('2027-01-01'), '2027年1月1日(金)');
  assert.equal(formatDateJaWithYear('壊れた値'), '');
});

test('コピー用テキストに必要な情報が入る', () => {
  const { plan } = planOf(5, OBJECTIVE.LONG);
  const text = formatPlanText(plan, { periodLabel: '2026年' });
  assert.ok(text.includes('やすみつなぎ'));
  assert.ok(text.includes('対象期間: 2026年'));
  assert.ok(text.includes(`使う有給: ${plan.leaveUsed}日`));
  assert.ok(text.includes(`連休の合計: ${plan.totalDays}日`));
  assert.ok(text.includes('官報'), '免責の一文が入る');
  for (const b of plan.bridges) {
    assert.ok(text.includes(formatRangeJa(b, { withYear: true })), `${b.start} が本文にない`);
    for (const d of b.leaveDates) {
      assert.ok(text.includes(formatDateJaWithYear(d)), `${d} が本文にない`);
    }
  }
});

test('空のプランでもコピー用テキストが成立する', () => {
  const text = formatPlanText({ bridges: [], totalDays: 0, leaveUsed: 0 });
  assert.ok(text.includes('見つかりませんでした'));
  assert.ok(!text.includes('対象期間'), 'periodLabel がなければ行を出さない');
});

/* ------------------------------------------------------------
   既定値
   ------------------------------------------------------------ */

test('既定の設定は月〜金勤務である', () => {
  const s = defaultSettings();
  assert.deepEqual(s.workdays, [false, true, true, true, true, true, false]);
  assert.equal(s.objective, OBJECTIVE.LONG);
  assert.ok(s.leaveDays >= 0 && s.leaveDays <= MAX_LEAVE_BUDGET);
  assert.deepEqual(s.companyOff, []);
});

test('defaultSettings は毎回新しいオブジェクトを返す', () => {
  const a = defaultSettings();
  const b = defaultSettings();
  a.workdays[0] = true;
  assert.equal(b.workdays[0], false, '配列が共有されている');
});

/* ------------------------------------------------------------
   性能
   ------------------------------------------------------------ */

test('12 か月ぶんの計算が 200ms 未満で終わる', () => {
  const started = process.hrtime.bigint();
  const days = buildCalendar('2026-10-12', '2027-10-11', MON_FRI);
  const bridges = findBridges(days, 5);
  buildPlan(days, bridges, 40, { objective: OBJECTIVE.LONG });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 200, `${elapsedMs.toFixed(1)}ms かかった`);
});
