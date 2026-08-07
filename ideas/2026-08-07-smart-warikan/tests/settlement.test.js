import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBalances, simplifyDebts, settle } from '../src/settlement.js';

const participants = [
  { id: 'A', name: 'あかり' },
  { id: 'B', name: 'ぼたん' },
  { id: 'C', name: 'ちひろ' },
];

function sumAmounts(transactions) {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

test('均等割り: 1件の支出をA,B,Cで3等分する', () => {
  const expenses = [
    { id: 'e1', title: '飲み会', amount: 3000, payerId: 'A', shares: { A: 1, B: 1, C: 1 } },
  ];
  const balances = calculateBalances(participants, expenses);
  assert.equal(balances.A, 2000); // 3000払って1000負担 -> +2000
  assert.equal(balances.B, -1000);
  assert.equal(balances.C, -1000);

  const transactions = simplifyDebts(balances);
  assert.equal(transactions.length, 2);
  assert.equal(sumAmounts(transactions), 2000);
  for (const t of transactions) {
    assert.equal(t.to, 'A');
    assert.equal(t.amount, 1000);
  }
});

test('支払者が対象者に含まれないケース（全額を他の人のために立て替え）', () => {
  const expenses = [
    { id: 'e1', title: 'タクシー代（Aは乗っていない）', amount: 2000, payerId: 'A', shares: { B: 1, C: 1 } },
  ];
  const balances = calculateBalances(participants, expenses);
  assert.equal(balances.A, 2000);
  assert.equal(balances.B, -1000);
  assert.equal(balances.C, -1000);
});

test('重み付き分割: Aは2人分として負担する', () => {
  const expenses = [
    { id: 'e1', title: '飲み放題込みコース', amount: 4000, payerId: 'C', shares: { A: 2, B: 1, C: 1 } },
  ];
  const balances = calculateBalances(participants, expenses);
  // 合計weight=4, 1weightあたり1000円。A: -2000, B: -1000, C: 4000-1000=3000
  assert.equal(balances.A, -2000);
  assert.equal(balances.B, -1000);
  assert.equal(balances.C, 3000);
});

test('複数支出の合算: balanceは全支出を通算する', () => {
  const expenses = [
    { id: 'e1', title: '飲み会', amount: 3000, payerId: 'A', shares: { A: 1, B: 1, C: 1 } },
    { id: 'e2', title: '二次会（Aは不参加）', amount: 2000, payerId: 'B', shares: { B: 1, C: 1 } },
  ];
  const balances = calculateBalances(participants, expenses);
  // e1: A+2000, B-1000, C-1000
  // e2: A+0, B+1000, C-1000
  assert.equal(balances.A, 2000);
  assert.equal(balances.B, 0);
  assert.equal(balances.C, -2000);
});

test('金額保存則: 送金額の合計は債権者の受取合計と一致する', () => {
  const expenses = [
    { id: 'e1', title: '旅行A', amount: 15000, payerId: 'A', shares: { A: 1, B: 1, C: 1 } },
    { id: 'e2', title: '旅行B', amount: 9000, payerId: 'B', shares: { A: 1, B: 1, C: 1 } },
    { id: 'e3', title: 'タクシー', amount: 1800, payerId: 'C', shares: { A: 1, C: 1 } },
  ];
  const { balances, transactions } = settle(participants, expenses);

  const totalPositive = Object.values(balances).filter((v) => v > 0).reduce((s, v) => s + v, 0);
  assert.equal(sumAmounts(transactions), totalPositive);

  // 送金後、全員の残高が0になることを検証する
  const after = { ...balances };
  for (const t of transactions) {
    after[t.from] += t.amount;
    after[t.to] -= t.amount;
  }
  for (const id of Object.keys(after)) {
    assert.equal(after[id], 0);
  }
});

test('送金回数は参加者数-1件以下になる', () => {
  const five = [
    { id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' },
    { id: 'D', name: 'D' }, { id: 'E', name: 'E' },
  ];
  const expenses = [
    { id: 'e1', title: '支出1', amount: 12345, payerId: 'A', shares: { A: 1, B: 1, C: 1, D: 1, E: 1 } },
    { id: 'e2', title: '支出2', amount: 6789, payerId: 'C', shares: { A: 2, B: 1, D: 1 } },
    { id: 'e3', title: '支出3', amount: 4321, payerId: 'E', shares: { B: 1, C: 1, D: 1, E: 1 } },
  ];
  const { transactions } = settle(five, expenses);
  assert.ok(transactions.length <= five.length - 1);
});

test('端数が発生するケースでも送金総額は支出合計の負担分と一致する', () => {
  const expenses = [
    { id: 'e1', title: '均等に割り切れない支出', amount: 1000, payerId: 'A', shares: { A: 1, B: 1, C: 1 } },
  ];
  const { balances, transactions } = settle(participants, expenses);
  const sumBalances = Object.values(balances).reduce((s, v) => s + v, 0);
  assert.equal(sumBalances, 0); // 丸め調整により合計は必ず0

  const totalPositive = Object.values(balances).filter((v) => v > 0).reduce((s, v) => s + v, 0);
  assert.equal(sumAmounts(transactions), totalPositive);
});

test('すでに貸し借りがゼロの場合、送金プランは空になる', () => {
  const balances = { A: 0, B: 0, C: 0 };
  const transactions = simplifyDebts(balances);
  assert.deepEqual(transactions, []);
});

test('割り勘対象者が指定されていない支出はエラーになる', () => {
  const expenses = [
    { id: 'e1', title: '不正な支出', amount: 1000, payerId: 'A', shares: {} },
  ];
  assert.throws(() => calculateBalances(participants, expenses));
});
