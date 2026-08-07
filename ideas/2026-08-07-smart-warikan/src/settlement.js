// スマート割り勘: 精算計算のコアロジック（純粋関数、UI非依存）

/**
 * 各参加者の支出を集計し、純収支（プラス=受け取る側／マイナス=支払う側）を計算する。
 * @param {{id: string, name: string}[]} participants
 * @param {{id: string, amount: number, payerId: string, shares: Record<string, number>}[]} expenses
 * @returns {Record<string, number>} participantId -> balance（円未満の端数を含む可能性あり）
 */
export function calculateBalances(participants, expenses) {
  const balances = {};
  for (const p of participants) balances[p.id] = 0;

  for (const expense of expenses) {
    if (!(expense.payerId in balances)) {
      throw new Error(`未登録の支払者IDです: ${expense.payerId}`);
    }
    balances[expense.payerId] += expense.amount;

    const shareEntries = Object.entries(expense.shares).filter(([, w]) => w > 0);
    const totalWeight = shareEntries.reduce((sum, [, w]) => sum + w, 0);
    if (totalWeight <= 0) {
      throw new Error(`支出「${expense.title || expense.id}」の割り勘対象者が設定されていません`);
    }

    for (const [participantId, weight] of shareEntries) {
      if (!(participantId in balances)) {
        throw new Error(`未登録の参加者IDです: ${participantId}`);
      }
      balances[participantId] -= (expense.amount * weight) / totalWeight;
    }
  }

  return roundBalancesPreservingSum(balances);
}

/**
 * 浮動小数点の割り勘結果を整数円に丸めつつ、合計が厳密に0になるよう調整する。
 * 丸め誤差は絶対値が最大の参加者に寄せる。
 */
function roundBalancesPreservingSum(rawBalances) {
  const ids = Object.keys(rawBalances);
  const rounded = {};
  let sum = 0;
  for (const id of ids) {
    rounded[id] = Math.round(rawBalances[id]);
    sum += rounded[id];
  }

  if (sum !== 0 && ids.length > 0) {
    // 丸め誤差（通常は数円以内）を、残高の絶対値が最大の参加者に寄せて合計を0にする。
    const adjustId = ids.reduce((maxId, id) =>
      Math.abs(rounded[id]) > Math.abs(rounded[maxId]) ? id : maxId, ids[0]);
    rounded[adjustId] -= sum;
  }

  return rounded;
}

/**
 * 貸し借りの残高から、送金回数が最小になる精算プランを貪欲法で求める。
 * 常に最大の債権者と最大の債務者をマッチングさせる。
 * @param {Record<string, number>} balances
 * @returns {{from: string, to: string, amount: number}[]}
 */
export function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, balance] of Object.entries(balances)) {
    if (balance > 0) creditors.push({ id, amount: balance });
    else if (balance < 0) debtors.push({ id, amount: -balance });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transactions.push({ from: debtor.id, to: creditor.id, amount });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return transactions;
}

/**
 * calculateBalances と simplifyDebts をまとめて実行するユーティリティ。
 */
export function settle(participants, expenses) {
  const balances = calculateBalances(participants, expenses);
  const transactions = simplifyDebts(balances);
  return { balances, transactions };
}
