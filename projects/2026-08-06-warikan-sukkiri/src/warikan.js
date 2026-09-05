// わりかんスッキリ - 計算エンジン（UIから独立した純粋関数群）
// ブラウザ（<script type="module">）と Node.js（node:test）の両方から読み込める ESM 形式。

/**
 * 各メンバーの収支（balance）を計算する。
 * 戻り値の balance[member] が正 = 払いすぎ（受け取る側）、負 = 不足（支払う側）。
 * 端数は各支出ごとに参加者の先頭から1円ずつ多く負担させることで、
 * 合計が必ず支出額と一致するようにする。
 *
 * @param {string[]} members
 * @param {{payer: string, amount: number, participants?: string[]}[]} expenses
 * @returns {Record<string, number>}
 */
export function calculateBalances(members, expenses) {
  const balance = Object.fromEntries(members.map((m) => [m, 0]));

  for (const expense of expenses) {
    const participants =
      expense.participants && expense.participants.length > 0
        ? expense.participants
        : members;

    if (!(expense.payer in balance)) {
      throw new Error(`未登録のメンバーです: ${expense.payer}`);
    }
    for (const p of participants) {
      if (!(p in balance)) {
        throw new Error(`未登録のメンバーです: ${p}`);
      }
    }

    balance[expense.payer] += expense.amount;

    const share = Math.floor(expense.amount / participants.length);
    const remainder = expense.amount - share * participants.length;

    participants.forEach((p, index) => {
      const extra = index < remainder ? 1 : 0;
      balance[p] -= share + extra;
    });
  }

  return balance;
}

/**
 * 収支から最小送金回数に近い精算リストを貪欲法で生成する。
 *
 * @param {Record<string, number>} balances
 * @returns {{from: string, to: string, amount: number}[]}
 */
export function settleUp(balances) {
  const creditors = [];
  const debtors = [];

  for (const [member, amount] of Object.entries(balances)) {
    if (amount > 0) creditors.push({ member, amount });
    else if (amount < 0) debtors.push({ member, amount: -amount });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transactions.push({ from: debtor.member, to: creditor.member, amount });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) i += 1;
    if (debtor.amount === 0) j += 1;
  }

  return transactions;
}

/**
 * メンバーと支出から、収支と精算リストをまとめて計算するヘルパー。
 *
 * @param {string[]} members
 * @param {{payer: string, amount: number, participants?: string[]}[]} expenses
 */
export function calculateSettlement(members, expenses) {
  const balances = calculateBalances(members, expenses);
  const transactions = settleUp(balances);
  return { balances, transactions };
}
