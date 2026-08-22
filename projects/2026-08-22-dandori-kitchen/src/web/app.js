/**
 * 段取りキッチン — 画面制御。
 *
 * 計算は src/lib の純関数に任せ、このファイルは DOM の描画と入力の受け取りだけを行う。
 * 外部への通信は一切行わず、保存先は localStorage のみ。
 */

import { schedule, toTimeSlots } from '../lib/scheduler.js';
import { parseTime, formatTime, formatTimeWithDay, formatDuration } from '../lib/time.js';
import { PRESET_RECIPES, createDishFromPreset, groupPresetsByCategory, totalStepMinutes } from '../lib/recipes.js';
import { saveState, loadState } from '../lib/storage.js';

/** @typedef {import('../lib/scheduler.js').Dish} Dish */

/** 画面の状態。 */
const state = {
  targetTime: '18:30',
  cooks: 1,
  /** @type {Dish[]} */
  dishes: [],
};

let dishSequence = 0;
const nextDishId = () => `dish-${Date.now().toString(36)}-${(dishSequence += 1)}`;

const el = {
  targetTime: document.querySelector('#target-time'),
  cooks: document.querySelector('#cooks'),
  presetSelect: document.querySelector('#preset-select'),
  addPreset: document.querySelector('#add-preset'),
  addCustom: document.querySelector('#add-custom'),
  clearAll: document.querySelector('#clear-all'),
  dishList: document.querySelector('#dish-list'),
  result: document.querySelector('#result'),
};

// ── 初期化 ────────────────────────────────────────────────
function init() {
  buildPresetOptions();

  const restored = loadState();
  if (restored) {
    // 保存データがあれば、料理が0件（利用者が意図的にすべて削除した状態）でもそのまま尊重する。
    state.targetTime = restored.targetTime;
    state.cooks = restored.cooks;
    state.dishes = restored.dishes.map((dish) => ({ ...dish, id: dish.id || nextDishId() }));
  } else {
    // 保存データが一度もない初回だけ、よくある献立を入れてすぐ結果が見られるようにする。
    state.dishes = ['ごはん（炊飯）', '味噌汁', '生姜焼き'].map((name) =>
      createDishFromPreset(name, nextDishId()),
    );
  }

  el.targetTime.value = state.targetTime;
  el.cooks.value = String(state.cooks);

  el.targetTime.addEventListener('change', () => {
    state.targetTime = el.targetTime.value;
    render();
  });
  el.cooks.addEventListener('change', () => {
    state.cooks = Number(el.cooks.value) || 1;
    render();
  });
  el.addPreset.addEventListener('click', () => {
    const name = el.presetSelect.value;
    if (!name) return;
    state.dishes.push(createDishFromPreset(name, nextDishId()));
    render();
  });
  el.addCustom.addEventListener('click', () => {
    state.dishes.push({
      id: nextDishId(),
      name: '新しい料理',
      holdMinutes: 0,
      steps: [{ name: '下ごしらえ', minutes: 5, attended: true }],
    });
    render();
  });
  el.clearAll.addEventListener('click', () => {
    if (state.dishes.length === 0) return;
    // 全消しは戻せないので確認する
    if (!globalThis.confirm('献立をすべて削除します。よろしいですか？')) return;
    state.dishes = [];
    render();
  });

  render();
}

function buildPresetOptions() {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '料理を選んでください';
  placeholder.disabled = true;
  placeholder.selected = true;
  el.presetSelect.append(placeholder);
  for (const { category, recipes } of groupPresetsByCategory()) {
    const group = document.createElement('optgroup');
    group.label = category;
    for (const name of recipes) {
      const preset = PRESET_RECIPES.find((recipe) => recipe.name === name);
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${name}（約${totalStepMinutes(preset)}分）`;
      group.append(option);
    }
    el.presetSelect.append(group);
  }
}

// ── 描画 ──────────────────────────────────────────────────
function render() {
  renderDishes();
  renderResult();
  saveState(state);
}

function renderDishes() {
  el.dishList.replaceChildren();
  if (state.dishes.length === 0) {
    el.dishList.append(
      createEl('p', { className: 'empty', textContent: '料理がありません。上のボタンから追加してください。' }),
    );
    return;
  }
  state.dishes.forEach((dish, dishIndex) => {
    el.dishList.append(renderDish(dish, dishIndex));
  });
}

function renderDish(dish, dishIndex) {
  const card = createEl('div', { className: 'dish' });

  const head = createEl('div', { className: 'dish-head' });
  const nameInput = createEl('input', {
    className: 'dish-name',
    type: 'text',
    value: dish.name,
    ariaLabel: '料理名',
  });
  nameInput.addEventListener('input', () => {
    dish.name = nameInput.value;
    renderResult();
    saveState(state);
  });

  const holdWrap = createEl('label', { className: 'hold-field' });
  const holdInput = createEl('input', { type: 'number', min: '0', step: '5', value: String(dish.holdMinutes ?? 0) });
  holdInput.addEventListener('change', () => {
    dish.holdMinutes = Math.max(0, Number(holdInput.value) || 0);
    holdInput.value = String(dish.holdMinutes);
    // 献立の一覧を作り直すと、同じ行の別のボタンへのクリックが
    // 描画のやり直しで失われてしまう。結果の再計算だけ行う。
    renderResult();
    saveState(state);
  });
  holdWrap.append('できあがりの', holdInput, '分前でOK');
  holdWrap.title = '0なら「できあがり時刻ちょうどに熱々で出したい」。サラダなど先に作れる料理は大きめに。';

  const up = createEl('button', { className: 'ghost', textContent: '↑', title: '上に移動' });
  up.addEventListener('click', () => moveDish(dishIndex, -1));
  const down = createEl('button', { className: 'ghost', textContent: '↓', title: '下に移動' });
  down.addEventListener('click', () => moveDish(dishIndex, 1));
  const remove = createEl('button', { className: 'ghost danger', textContent: '削除', title: 'この料理を削除' });
  remove.addEventListener('click', () => {
    state.dishes.splice(dishIndex, 1);
    render();
  });

  head.append(nameInput, holdWrap, up, down, remove);
  card.append(head);

  // 工程テーブル
  const table = createEl('table', { className: 'steps' });
  const thead = createEl('thead');
  const headRow = createEl('tr');
  for (const label of ['工程', '分', '種類', '']) headRow.append(createEl('th', { textContent: label }));
  thead.append(headRow);
  table.append(thead);

  const tbody = createEl('tbody');
  dish.steps.forEach((step, stepIndex) => {
    tbody.append(renderStepRow(dish, step, stepIndex));
  });
  table.append(tbody);
  card.append(table);

  const addStep = createEl('button', { className: 'ghost', textContent: '＋ 工程を追加' });
  addStep.addEventListener('click', () => {
    dish.steps.push({ name: '新しい工程', minutes: 5, attended: true });
    render();
  });
  card.append(createEl('div', { className: 'row-actions' }, [addStep]));
  return card;
}

function renderStepRow(dish, step, stepIndex) {
  const row = createEl('tr');

  const nameInput = createEl('input', { className: 'step-name', type: 'text', value: step.name, ariaLabel: '工程名' });
  nameInput.addEventListener('input', () => {
    step.name = nameInput.value;
    renderResult();
    saveState(state);
  });

  const minutesInput = createEl('input', { type: 'number', min: '0', step: '1', value: String(step.minutes), ariaLabel: '所要時間（分）' });
  minutesInput.addEventListener('change', () => {
    step.minutes = Math.max(0, Math.round(Number(minutesInput.value) || 0));
    minutesInput.value = String(step.minutes);
    renderResult();
    saveState(state);
  });

  const toggle = createEl('div', { className: 'kind-toggle' });
  const attendedBtn = createEl('button', { textContent: 'つきっきり', dataset: { kind: 'attended' } });
  const unattendedBtn = createEl('button', { textContent: '放置', dataset: { kind: 'unattended' } });
  attendedBtn.setAttribute('aria-pressed', String(step.attended));
  unattendedBtn.setAttribute('aria-pressed', String(!step.attended));
  attendedBtn.title = '手が塞がる工程。同時に調理者の人数までしか実行できない。';
  unattendedBtn.title = '煮る・焼く・寝かせるなど、火にかけて放置できる工程。何本でも並行できる。';
  const applyKind = (attended) => {
    step.attended = attended;
    // 行の再生成はせず、押下状態だけ更新する（クリックの取りこぼしを防ぐ）
    attendedBtn.setAttribute('aria-pressed', String(attended));
    unattendedBtn.setAttribute('aria-pressed', String(!attended));
    renderResult();
    saveState(state);
  };
  attendedBtn.addEventListener('click', () => applyKind(true));
  unattendedBtn.addEventListener('click', () => applyKind(false));
  toggle.append(attendedBtn, unattendedBtn);

  const remove = createEl('button', { className: 'ghost danger', textContent: '×', title: 'この工程を削除' });
  remove.addEventListener('click', () => {
    dish.steps.splice(stepIndex, 1);
    render();
  });

  row.append(
    createEl('td', {}, [nameInput]),
    createEl('td', {}, [minutesInput]),
    createEl('td', {}, [toggle]),
    createEl('td', {}, [remove]),
  );
  return row;
}

function moveDish(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.dishes.length) return;
  const [dish] = state.dishes.splice(index, 1);
  state.dishes.splice(target, 0, dish);
  render();
}

// ── 結果 ──────────────────────────────────────────────────
function renderResult() {
  el.result.replaceChildren();

  if (state.dishes.length === 0) {
    el.result.append(createEl('p', { className: 'empty', textContent: '料理を追加すると、ここに段取りが表示されます。' }));
    return;
  }

  let result;
  try {
    const targetTime = parseTime(state.targetTime);
    result = schedule(state.dishes, { targetTime, cooks: state.cooks });
  } catch (error) {
    el.result.append(createEl('p', { className: 'error', textContent: `計算できませんでした: ${error.message}` }));
    return;
  }

  // サマリ
  const summary = createEl('div', { className: 'summary' });
  summary.append(
    createStat('調理開始', formatTimeWithDay(result.startTime), true),
    createStat('できあがり', formatTime(result.targetTime)),
    createStat('総所要時間', formatDuration(result.totalMinutes)),
    createStat('手を動かす時間', formatDuration(result.activeMinutes)),
    // のべ人数分の値なので、1人のときだけ「手が空く時間」と呼ぶ
    createStat(
      state.cooks === 1 ? '手が空く時間' : 'のべ手待ち時間',
      formatDuration(result.idleMinutes),
    ),
  );
  el.result.append(summary);

  // 人数を増やしたときの効果を、1人で作った場合と比べて具体的に示す
  if (state.cooks > 1) {
    let soloMinutes = null;
    try {
      soloMinutes = schedule(state.dishes, { targetTime: result.targetTime, cooks: 1 }).totalMinutes;
    } catch {
      soloMinutes = null;
    }
    if (soloMinutes !== null) {
      const saved = soloMinutes - result.totalMinutes;
      el.result.append(
        createEl('p', {
          className: 'hint',
          textContent:
            saved > 0
              ? `${state.cooks}人で作ると、1人のときより ${formatDuration(saved)} 短くなります（1人なら ${formatDuration(soloMinutes)}）。`
              : `この献立では ${state.cooks}人にしても総所要時間は変わりません。煮込みや炊飯など「放置」の待ち時間が全体を決めているためです。`,
        }),
      );
    }
  }

  if (result.warnings.length > 0) {
    const list = createEl('ul', { className: 'warnings' });
    for (const warning of result.warnings) list.append(createEl('li', { textContent: warning }));
    el.result.append(list);
  }

  // タイムライン
  const slots = toTimeSlots(result.entries);
  const timeline = createEl('ol', { className: 'timeline' });
  for (const slot of slots) {
    const line = createEl('li', { className: 'slot' });

    const clock = createEl('div', { className: 'clock' });
    clock.append(document.createTextNode(formatTime(slot.startTime)));
    const before = result.targetTime - slot.startTime;
    clock.append(createEl('small', { textContent: `${formatDuration(before)}前` }));
    line.append(clock);

    const body = createEl('div');
    if (slot.attended.length === 0 && slot.running.length === 0) continue;

    for (const entry of slot.attended) {
      const task = createEl('div', { className: 'task attended' });
      task.append(
        createEl('span', { className: 'dish-tag', textContent: entry.dishName }),
        createEl('span', { className: 'action', textContent: entry.stepName }),
        createEl('span', { className: 'duration', textContent: `${entry.minutes}分` }),
      );
      body.append(task);
    }
    // 手を動かさない開始（放置工程の開始）も表示する
    for (const entry of slot.running.filter((item) => item.startTime === slot.startTime)) {
      const task = createEl('div', { className: 'task' });
      task.append(
        createEl('span', { className: 'dish-tag', textContent: entry.dishName }),
        createEl('span', { className: 'action', textContent: entry.stepName }),
        createEl('span', { className: 'duration', textContent: `${entry.minutes}分（放置）` }),
      );
      body.append(task);
    }

    const alreadyRunning = slot.running.filter((item) => item.startTime < slot.startTime);
    if (alreadyRunning.length > 0) {
      const wrap = createEl('div', { className: 'running-list' });
      wrap.append(createEl('span', { className: 'running-label', textContent: '⏳ 裏で進行中' }));
      for (const item of alreadyRunning) {
        wrap.append(
          createEl('span', { className: 'running', textContent: `${item.dishName}：${item.stepName}` }),
        );
      }
      body.append(wrap);
    }

    line.append(body);
    timeline.append(line);
  }
  el.result.append(createEl('h2', { textContent: 'タイムライン' }), timeline);

  // 料理ごとの完成時刻
  const finishList = createEl('ul', { className: 'warnings', style: 'background:transparent;color:inherit;padding-left:1.4rem' });
  for (const dish of result.dishSummaries) {
    finishList.append(
      createEl('li', {
        textContent: `${dish.dishName}：${formatTimeWithDay(dish.startTime)} 開始 → ${formatTimeWithDay(dish.finishTime)} 完成`,
      }),
    );
  }
  el.result.append(createEl('h2', { textContent: '料理ごとの開始・完成' }), finishList);
}

function createStat(label, value, highlight = false) {
  return createEl('div', { className: highlight ? 'stat highlight' : 'stat' }, [
    createEl('div', { className: 'label', textContent: label }),
    createEl('div', { className: 'value', textContent: value }),
  ]);
}

/**
 * 要素を生成する小さなヘルパー。
 * textContent 経由でのみ文字列を入れるため、ユーザー入力が HTML として解釈されることはない。
 */
function createEl(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'ariaLabel') {
      node.setAttribute('aria-label', value);
    } else if (key === 'style') {
      node.setAttribute('style', value);
    } else {
      node[key] = value;
    }
  }
  node.append(...children);
  return node;
}

init();
