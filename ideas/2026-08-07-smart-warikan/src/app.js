import { settle } from './settlement.js';

const state = {
  participants: [], // { id, name }
  expenses: [],      // { id, title, amount, payerId, shares }
};

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

// --- DOM要素 ---
const memberForm = document.getElementById('member-form');
const memberNameInput = document.getElementById('member-name');
const memberList = document.getElementById('member-list');
const memberHint = document.getElementById('member-hint');

const expenseForm = document.getElementById('expense-form');
const expenseTitleInput = document.getElementById('expense-title');
const expenseAmountInput = document.getElementById('expense-amount');
const expensePayerSelect = document.getElementById('expense-payer');
const expenseSharesContainer = document.getElementById('expense-shares');
const expenseTable = document.getElementById('expense-table');
const expenseTableBody = document.getElementById('expense-table-body');
const expenseEmptyHint = document.getElementById('expense-empty');

const settleButton = document.getElementById('settle-button');
const settlementResult = document.getElementById('settlement-result');
const copyButton = document.getElementById('copy-button');
const copyStatus = document.getElementById('copy-status');

// --- 参加者管理 ---
memberForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = memberNameInput.value.trim();
  if (!name) return;
  state.participants.push({ id: nextId('member'), name });
  memberNameInput.value = '';
  memberNameInput.focus();
  renderMembers();
  renderExpensePayerOptions();
  renderExpenseShareInputs();
});

function removeMember(id) {
  state.participants = state.participants.filter((p) => p.id !== id);
  // 削除された参加者が支払者だった支出は成立しなくなるため削除する
  state.expenses = state.expenses.filter((e) => e.payerId !== id);
  // 削除された参加者を割り勘対象者から外す。対象者がいなくなった支出も削除する
  state.expenses.forEach((e) => {
    delete e.shares[id];
  });
  state.expenses = state.expenses.filter((e) => Object.keys(e.shares).length > 0);

  renderMembers();
  renderExpensePayerOptions();
  renderExpenseShareInputs();
  renderExpenseTable();
  clearSettlementResult();
}

function renderMembers() {
  memberList.innerHTML = '';
  for (const participant of state.participants) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = participant.name;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `${participant.name}を削除`);
    removeBtn.addEventListener('click', () => removeMember(participant.id));
    li.appendChild(label);
    li.appendChild(removeBtn);
    memberList.appendChild(li);
  }
  memberHint.hidden = state.participants.length >= 2;
}

// --- 支出フォーム ---
function renderExpensePayerOptions() {
  const previousValue = expensePayerSelect.value;
  expensePayerSelect.innerHTML = '';
  for (const participant of state.participants) {
    const option = document.createElement('option');
    option.value = participant.id;
    option.textContent = participant.name;
    expensePayerSelect.appendChild(option);
  }
  if (state.participants.some((p) => p.id === previousValue)) {
    expensePayerSelect.value = previousValue;
  }
}

function renderExpenseShareInputs() {
  expenseSharesContainer.innerHTML = '';
  for (const participant of state.participants) {
    const row = document.createElement('div');
    row.className = 'share-row';

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.participantId = participant.id;
    checkbox.className = 'share-checkbox';
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(participant.name));

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '1';
    weightInput.step = '1';
    weightInput.value = '1';
    weightInput.dataset.participantId = participant.id;
    weightInput.className = 'share-weight';
    weightInput.setAttribute('aria-label', `${participant.name}の負担割合`);

    checkbox.addEventListener('change', () => {
      weightInput.disabled = !checkbox.checked;
    });

    row.appendChild(label);
    row.appendChild(weightInput);
    expenseSharesContainer.appendChild(row);
  }
}

expenseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.participants.length < 2) {
    window.alert('参加者を2人以上登録してください。');
    return;
  }

  const amount = Number(expenseAmountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    window.alert('金額は1円以上の数値で入力してください。');
    return;
  }

  const shares = {};
  const checkboxes = expenseSharesContainer.querySelectorAll('.share-checkbox');
  checkboxes.forEach((checkbox) => {
    if (!checkbox.checked) return;
    const weightInput = expenseSharesContainer.querySelector(
      `.share-weight[data-participant-id="${checkbox.dataset.participantId}"]`
    );
    const weight = Number(weightInput.value) || 1;
    shares[checkbox.dataset.participantId] = weight;
  });

  if (Object.keys(shares).length === 0) {
    window.alert('割り勘対象者を1人以上選択してください。');
    return;
  }

  state.expenses.push({
    id: nextId('expense'),
    title: expenseTitleInput.value.trim(),
    amount,
    payerId: expensePayerSelect.value,
    shares,
  });

  expenseForm.reset();
  renderExpenseShareInputs();
  renderExpenseTable();
  clearSettlementResult();
});

function participantName(id) {
  return state.participants.find((p) => p.id === id)?.name ?? '（削除済み）';
}

function renderExpenseTable() {
  expenseTableBody.innerHTML = '';
  const hasExpenses = state.expenses.length > 0;
  expenseTable.hidden = !hasExpenses;
  expenseEmptyHint.hidden = hasExpenses;

  for (const expense of state.expenses) {
    const tr = document.createElement('tr');

    const titleTd = document.createElement('td');
    titleTd.textContent = expense.title || '（無題の支出）';

    const amountTd = document.createElement('td');
    amountTd.className = 'amount';
    amountTd.textContent = yen.format(expense.amount);

    const payerTd = document.createElement('td');
    payerTd.textContent = participantName(expense.payerId);

    const targetsTd = document.createElement('td');
    targetsTd.textContent = Object.entries(expense.shares)
      .map(([id, weight]) => (weight > 1 ? `${participantName(id)}(×${weight})` : participantName(id)))
      .join('、');

    const actionTd = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '削除';
    deleteBtn.className = 'secondary';
    deleteBtn.addEventListener('click', () => {
      state.expenses = state.expenses.filter((e) => e.id !== expense.id);
      renderExpenseTable();
      clearSettlementResult();
    });
    actionTd.appendChild(deleteBtn);

    tr.append(titleTd, amountTd, payerTd, targetsTd, actionTd);
    expenseTableBody.appendChild(tr);
  }
}

// --- 精算 ---
let lastSummaryText = '';

function clearSettlementResult() {
  settlementResult.innerHTML = '';
  copyButton.hidden = true;
  copyStatus.textContent = '';
  lastSummaryText = '';
}

settleButton.addEventListener('click', () => {
  if (state.participants.length < 2) {
    renderError('参加者を2人以上登録してください。');
    return;
  }
  if (state.expenses.length === 0) {
    renderError('支出を1件以上登録してください。');
    return;
  }

  try {
    const { transactions } = settle(state.participants, state.expenses);
    renderSettlement(transactions);
  } catch (error) {
    renderError(error.message);
  }
});

function renderError(message) {
  settlementResult.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error-message';
  p.textContent = message;
  settlementResult.appendChild(p);
  copyButton.hidden = true;
  lastSummaryText = '';
}

function renderSettlement(transactions) {
  settlementResult.innerHTML = '';

  if (transactions.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'すでに全員の貸し借りが精算済みです。送金の必要はありません。';
    settlementResult.appendChild(p);
    copyButton.hidden = true;
    lastSummaryText = '';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'transaction-list';
  const lines = [`【スマート割り勘】精算結果（送金 ${transactions.length}件）`];

  for (const t of transactions) {
    const li = document.createElement('li');
    const desc = document.createElement('span');
    desc.textContent = `${participantName(t.from)} → ${participantName(t.to)}`;
    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = yen.format(t.amount);
    li.appendChild(desc);
    li.appendChild(amount);
    ul.appendChild(li);
    lines.push(`${participantName(t.from)} → ${participantName(t.to)}へ ${yen.format(t.amount)}`);
  }

  settlementResult.appendChild(ul);
  lastSummaryText = lines.join('\n');
  copyButton.hidden = false;
  copyStatus.textContent = '';
}

function copyWithFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const succeeded = document.execCommand('copy');
  document.body.removeChild(textarea);
  return succeeded;
}

copyButton.addEventListener('click', async () => {
  if (!lastSummaryText) return;

  // navigator.clipboard はセキュアコンテキスト（https/localhost）でのみ動作するため、
  // file:// で開かれた場合などは execCommand('copy') にフォールバックする。
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(lastSummaryText);
      copyStatus.textContent = 'コピーしました。';
      return;
    } catch {
      // フォールバックへ続行
    }
  }

  copyStatus.textContent = copyWithFallback(lastSummaryText)
    ? 'コピーしました。'
    : 'コピーに失敗しました。手動で選択してコピーしてください。';
});

// 初期描画
renderMembers();
renderExpensePayerOptions();
renderExpenseShareInputs();
renderExpenseTable();
