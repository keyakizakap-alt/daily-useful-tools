import { calculateSettlement } from "./warikan.js";

/** @type {string[]} */
const members = [];
/** @type {{payer: string, amount: number, participants: string[], memo: string}[]} */
const expenses = [];

const memberForm = document.getElementById("member-form");
const memberNameInput = document.getElementById("member-name");
const memberList = document.getElementById("member-list");
const memberEmpty = document.getElementById("member-empty");

const expenseForm = document.getElementById("expense-form");
const expensePayerSelect = document.getElementById("expense-payer");
const expenseAmountInput = document.getElementById("expense-amount");
const expenseMemoInput = document.getElementById("expense-memo");
const expenseParticipants = document.getElementById("expense-participants");
const expenseList = document.getElementById("expense-list");
const expenseEmpty = document.getElementById("expense-empty");

const settleButton = document.getElementById("settle-button");
const settleError = document.getElementById("settle-error");
const settleResult = document.getElementById("settle-result");
const balanceList = document.getElementById("balance-list");
const transactionList = document.getElementById("transaction-list");
const transactionEmpty = document.getElementById("transaction-empty");

const yen = new Intl.NumberFormat("ja-JP");

function renderMembers() {
  memberList.innerHTML = "";
  memberEmpty.hidden = members.length > 0;

  for (const name of members) {
    const li = document.createElement("li");
    li.className = "chip";
    li.textContent = name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `${name} を削除`);
    removeBtn.addEventListener("click", () => removeMember(name));

    li.appendChild(removeBtn);
    memberList.appendChild(li);
  }

  renderPayerOptions();
  renderParticipantCheckboxes();
}

function renderPayerOptions() {
  const previous = expensePayerSelect.value;
  expensePayerSelect.innerHTML = "";

  for (const name of members) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    expensePayerSelect.appendChild(option);
  }

  if (members.includes(previous)) {
    expensePayerSelect.value = previous;
  }
}

function renderParticipantCheckboxes() {
  expenseParticipants.innerHTML = "";

  for (const name of members) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = name;
    checkbox.name = "participant";
    label.appendChild(checkbox);
    label.append(` ${name}`);
    expenseParticipants.appendChild(label);
  }
}

function addMember(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (members.includes(trimmed)) return;
  members.push(trimmed);
  renderMembers();
}

function removeMember(name) {
  const index = members.indexOf(name);
  if (index === -1) return;
  members.splice(index, 1);

  for (let i = expenses.length - 1; i >= 0; i -= 1) {
    const expense = expenses[i];
    if (expense.payer === name) {
      expenses.splice(i, 1);
      continue;
    }
    expense.participants = expense.participants.filter((p) => p !== name);
  }

  renderMembers();
  renderExpenses();
  hideSettleResult();
}

function renderExpenses() {
  expenseList.innerHTML = "";
  expenseEmpty.hidden = expenses.length > 0;

  expenses.forEach((expense, index) => {
    const li = document.createElement("li");

    const label = document.createElement("div");
    const targetLabel =
      expense.participants.length === 0 ||
      expense.participants.length === members.length
        ? "全員"
        : expense.participants.join("・");

    label.innerHTML = `<strong>${expense.payer}</strong> が ${yen.format(
      expense.amount,
    )}円 を立て替え${expense.memo ? `（${expense.memo}）` : ""}`;

    const meta = document.createElement("div");
    meta.className = "expense-meta";
    meta.textContent = `対象: ${targetLabel}`;
    label.appendChild(document.createElement("br"));
    label.appendChild(meta);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "削除";
    removeBtn.addEventListener("click", () => {
      expenses.splice(index, 1);
      renderExpenses();
      hideSettleResult();
    });

    li.appendChild(label);
    li.appendChild(removeBtn);
    expenseList.appendChild(li);
  });
}

function hideSettleResult() {
  settleResult.hidden = true;
  settleError.textContent = "";
}

memberForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addMember(memberNameInput.value);
  memberNameInput.value = "";
  memberNameInput.focus();
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  settleError.textContent = "";

  if (members.length === 0) {
    settleError.textContent = "先にメンバーを登録してください。";
    return;
  }

  const payer = expensePayerSelect.value;
  const amount = Number(expenseAmountInput.value);

  if (!payer) {
    settleError.textContent = "支払った人を選択してください。";
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    settleError.textContent = "金額は1円以上の数値を入力してください。";
    return;
  }

  const checkedBoxes = Array.from(
    expenseParticipants.querySelectorAll("input[type=checkbox]:checked"),
  ).map((box) => box.value);

  expenses.push({
    payer,
    amount: Math.round(amount),
    participants: checkedBoxes,
    memo: expenseMemoInput.value.trim(),
  });

  expenseForm.reset();
  renderParticipantCheckboxes();
  renderExpenses();
  hideSettleResult();
});

settleButton.addEventListener("click", () => {
  settleError.textContent = "";

  if (members.length < 2) {
    settleError.textContent =
      "精算には2人以上のメンバー登録が必要です。";
    settleResult.hidden = true;
    return;
  }
  if (expenses.length === 0) {
    settleError.textContent = "支出が1件も登録されていません。";
    settleResult.hidden = true;
    return;
  }

  let result;
  try {
    result = calculateSettlement(
      members,
      expenses.map((e) => ({
        payer: e.payer,
        amount: e.amount,
        participants: e.participants,
      })),
    );
  } catch (error) {
    settleError.textContent = error.message;
    settleResult.hidden = true;
    return;
  }

  renderBalances(result.balances);
  renderTransactions(result.transactions);
  settleResult.hidden = false;
});

function renderBalances(balances) {
  balanceList.innerHTML = "";

  for (const member of members) {
    const amount = balances[member] ?? 0;
    const li = document.createElement("li");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = member;

    const amountSpan = document.createElement("span");
    amountSpan.className = `amount ${amount >= 0 ? "positive" : "negative"}`;
    amountSpan.textContent =
      amount > 0
        ? `+${yen.format(amount)}円（受け取り）`
        : amount < 0
          ? `-${yen.format(Math.abs(amount))}円（支払い）`
          : "±0円（精算済み）";

    li.appendChild(nameSpan);
    li.appendChild(amountSpan);
    balanceList.appendChild(li);
  }
}

function renderTransactions(transactions) {
  transactionList.innerHTML = "";
  transactionEmpty.hidden = transactions.length > 0;

  for (const t of transactions) {
    const li = document.createElement("li");
    li.textContent = `${t.from} → ${t.to}：${yen.format(t.amount)}円`;
    transactionList.appendChild(li);
  }
}

renderMembers();
renderExpenses();
