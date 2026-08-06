import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBalances,
  settleUp,
  calculateSettlement,
} from "../src/warikan.js";

test("均等割りで割り切れる場合の収支計算", () => {
  const members = ["あかね", "けん", "みさき"];
  const expenses = [{ payer: "あかね", amount: 3000 }];

  const balances = calculateBalances(members, expenses);

  assert.equal(balances["あかね"], 2000);
  assert.equal(balances["けん"], -1000);
  assert.equal(balances["みさき"], -1000);
});

test("端数が出る場合でも合計は必ず0になる", () => {
  const members = ["あかね", "けん", "みさき"];
  const expenses = [{ payer: "あかね", amount: 1000 }];

  const balances = calculateBalances(members, expenses);
  const total = Object.values(balances).reduce((a, b) => a + b, 0);

  assert.equal(total, 0);
  // 1000 / 3 = 333 余り 1 -> 先頭の「あかね」が1円多く負担する
  assert.equal(balances["あかね"], 1000 - 334);
  assert.equal(balances["けん"], -333);
  assert.equal(balances["みさき"], -333);
});

test("一部メンバーのみが対象の支出（部分参加）", () => {
  const members = ["あかね", "けん", "みさき"];
  const expenses = [
    { payer: "けん", amount: 2000, participants: ["けん", "みさき"] },
  ];

  const balances = calculateBalances(members, expenses);

  assert.equal(balances["あかね"], 0);
  assert.equal(balances["けん"], 1000);
  assert.equal(balances["みさき"], -1000);
});

test("複数の支出を合算して収支計算できる", () => {
  const members = ["あかね", "けん", "みさき"];
  const expenses = [
    { payer: "あかね", amount: 3000 },
    { payer: "けん", amount: 1500, participants: ["けん", "みさき"] },
  ];

  const balances = calculateBalances(members, expenses);
  const total = Object.values(balances).reduce((a, b) => a + b, 0);

  assert.equal(total, 0);
  assert.equal(balances["あかね"], 2000);
});

test("未登録のメンバーが支払者の場合はエラーになる", () => {
  const members = ["あかね", "けん"];
  const expenses = [{ payer: "ゆうと", amount: 1000 }];

  assert.throws(() => calculateBalances(members, expenses), /未登録のメンバー/);
});

test("未登録のメンバーが対象者に含まれる場合はエラーになる", () => {
  const members = ["あかね", "けん"];
  const expenses = [
    { payer: "あかね", amount: 1000, participants: ["あかね", "ゆうと"] },
  ];

  assert.throws(() => calculateBalances(members, expenses), /未登録のメンバー/);
});

test("支出が0件の場合は全員の収支が0になる", () => {
  const members = ["あかね", "けん"];
  const balances = calculateBalances(members, []);

  assert.equal(balances["あかね"], 0);
  assert.equal(balances["けん"], 0);
});

test("メンバーが1人だけの場合は自己完結で収支0", () => {
  const members = ["あかね"];
  const expenses = [{ payer: "あかね", amount: 5000 }];

  const balances = calculateBalances(members, expenses);
  assert.equal(balances["あかね"], 0);
});

test("settleUp: 送金リストの合計後、全員の残高が0になる", () => {
  const balances = { あかね: 2000, けん: -1000, みさき: -1000 };
  const transactions = settleUp(balances);

  const finalBalances = { ...balances };
  for (const t of transactions) {
    finalBalances[t.from] += t.amount;
    finalBalances[t.to] -= t.amount;
  }

  for (const amount of Object.values(finalBalances)) {
    assert.equal(amount, 0);
  }
});

test("settleUp: 送金額はすべて正の整数", () => {
  const balances = { A: 500, B: 300, C: -200, D: -600 };
  const transactions = settleUp(balances);

  assert.ok(transactions.length > 0);
  for (const t of transactions) {
    assert.ok(t.amount > 0);
    assert.ok(Number.isInteger(t.amount));
    assert.notEqual(t.from, t.to);
  }
});

test("settleUp: 収支が全員0なら送金は発生しない", () => {
  const balances = { あかね: 0, けん: 0 };
  const transactions = settleUp(balances);

  assert.deepEqual(transactions, []);
});

test("calculateSettlement: 収支と精算リストをまとめて取得できる", () => {
  const members = ["あかね", "けん", "みさき"];
  const expenses = [{ payer: "あかね", amount: 3000 }];

  const { balances, transactions } = calculateSettlement(members, expenses);

  assert.equal(balances["あかね"], 2000);
  assert.equal(transactions.length, 2);

  const finalBalances = { ...balances };
  for (const t of transactions) {
    finalBalances[t.from] += t.amount;
    finalBalances[t.to] -= t.amount;
  }
  for (const amount of Object.values(finalBalances)) {
    assert.equal(amount, 0);
  }
});

test("大人数・複数支出でも送金後の残高がすべて0になる（整合性の総合テスト）", () => {
  const members = ["A", "B", "C", "D", "E"];
  const expenses = [
    { payer: "A", amount: 10000 },
    { payer: "B", amount: 3333, participants: ["B", "C", "D"] },
    { payer: "C", amount: 777, participants: ["A", "E"] },
    { payer: "D", amount: 5000 },
  ];

  const { balances, transactions } = calculateSettlement(members, expenses);

  const finalBalances = { ...balances };
  for (const t of transactions) {
    finalBalances[t.from] += t.amount;
    finalBalances[t.to] -= t.amount;
  }
  for (const amount of Object.values(finalBalances)) {
    assert.equal(amount, 0);
  }
});
