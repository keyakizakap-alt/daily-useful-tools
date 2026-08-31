/**
 * InvoiceGuard フロントエンド。
 * サーバーの /api/* を呼び、結果を描画するだけ。判定ロジックは一切持たない
 * （同じ請求書がクライアントとサーバーで違う結果になる事態を避けるため）。
 */

const $ = (id) => document.getElementById(id);

const state = {
  tab: 'file',
  file: null,
  sampleId: null,
  aiAvailable: false,
};

const yen = (n) => `${Number(n).toLocaleString('ja-JP')} 円`;

const VERDICT = {
  qualified: { badge: '適格請求書', title: '要件を満たしています。全額を仕入税額控除できます。' },
  qualified_defective: {
    badge: '記載不備',
    title: '登録番号はありますが、記載事項に不備があります。',
  },
  non_registered: {
    badge: '登録番号なし',
    title: '免税事業者等からの仕入れとして、控除できる額が制限されます。',
  },
};

// --- 初期化 -----------------------------------------------------------------

async function init() {
  await Promise.all([loadConfig(), loadSamples()]);
  wireTabs();
  wireDropzone();
  $('runBtn').addEventListener('click', run);
}

async function loadConfig() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    state.aiAvailable = cfg.aiAvailable;

    if (!cfg.aiAvailable) {
      const notice = $('aiNotice');
      notice.textContent =
        'ANTHROPIC_API_KEY が設定されていないため、ファイル・テキストの読み取りは実行できません。「サンプルで試す」から監査ロジックの動作を確認できます。';
      notice.hidden = false;
    }

    renderDeadline(cfg.today);
  } catch {
    /* 設定が取れなくても本体は動く */
  }
}

/** 2026-10-01 の引き下げまでの残日数を表示する。 */
function renderDeadline(today) {
  if (!today) return;
  const [y, m, d] = today.split('-').map(Number);
  const days = Math.round((Date.UTC(2026, 9, 1) - Date.UTC(y, m - 1, d)) / 86400000);
  if (days <= 0) return;

  $('deadlineCount').textContent = `あと ${days} 日`;
  $('deadline').hidden = false;
}

async function loadSamples() {
  try {
    const samples = await (await fetch('/api/samples')).json();
    const list = $('sampleList');

    for (const s of samples) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sample';
      btn.dataset.id = s.id;
      btn.innerHTML =
        `<span class="sample-label"></span><span class="sample-summary"></span>`;
      btn.querySelector('.sample-label').textContent = s.label;
      btn.querySelector('.sample-summary').textContent = s.summary;

      btn.addEventListener('click', () => {
        state.sampleId = s.id;
        for (const el of list.querySelectorAll('.sample')) {
          el.classList.toggle('is-selected', el.dataset.id === s.id);
        }
      });

      list.appendChild(btn);
    }
  } catch {
    /* サンプルが取れなくてもファイル/テキストは使える */
  }
}

// --- 入力 -------------------------------------------------------------------

function wireTabs() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;

      for (const t of document.querySelectorAll('.tab')) {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      }
      for (const b of document.querySelectorAll('.tab-body')) {
        b.classList.toggle('is-active', b.dataset.body === state.tab);
      }
    });
  }
}

function wireDropzone() {
  const zone = $('dropzone');
  const input = $('fileInput');

  input.addEventListener('change', () => setFile(input.files?.[0] ?? null));

  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add('is-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.remove('is-over');
    });
  }
  zone.addEventListener('drop', (e) => setFile(e.dataTransfer?.files?.[0] ?? null));
}

function setFile(file) {
  state.file = file;
  $('fileName').textContent = file ? file.name : '';
}

/** File を base64（データURLのプレフィックスなし）にする。 */
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('ファイルを読み込めませんでした。'));
    reader.readAsDataURL(file);
  });
}

// --- 実行 -------------------------------------------------------------------

async function run() {
  const btn = $('runBtn');
  const err = $('error');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = '確認しています…';

  try {
    const simplified = $('simplified').checked;
    let endpoint;
    let payload;

    if (state.tab === 'sample') {
      if (!state.sampleId) throw new Error('サンプルを1つ選んでください。');
      endpoint = '/api/audit-extracted';
      payload = { sampleId: state.sampleId };
    } else if (state.tab === 'text') {
      const text = $('textInput').value.trim();
      if (!text) throw new Error('請求書のテキストを貼り付けてください。');
      endpoint = '/api/audit';
      payload = { text, simplified };
    } else {
      if (!state.file) throw new Error('請求書のファイルを選んでください。');
      endpoint = '/api/audit';
      payload = {
        base64: await toBase64(state.file),
        mediaType: state.file.type,
        simplified,
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `エラーが発生しました (${res.status})`);

    render(data);
  } catch (e) {
    err.textContent = e instanceof Error ? e.message : String(e);
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '確認する';
  }
}

// --- 描画 -------------------------------------------------------------------

function render({ invoice, audit }) {
  const v = VERDICT[audit.invoiceClass];
  $('verdictBadge').textContent = v.badge;
  $('verdictBadge').className = `verdict-badge ${audit.invoiceClass}`;
  $('verdictTitle').textContent = v.title;

  $('mTotal').textContent = yen(audit.impact.totalTax);
  $('mDeductible').textContent = yen(audit.impact.deductible);
  $('mLost').textContent = yen(audit.impact.lost);
  $('impactDetail').textContent = audit.impact.detail;

  const reqs = $('requirements');
  reqs.replaceChildren();
  for (const r of audit.requirements) {
    const li = document.createElement('li');
    li.className = r.status;
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = r.status === 'ok' ? '✓' : '!';
    const body = document.createElement('span');
    const label = document.createElement('span');
    label.className = 'req-label';
    label.textContent = `${r.id}. ${r.label}`;
    const detail = document.createElement('span');
    detail.className = 'req-detail';
    detail.textContent = r.detail;
    body.append(label, document.createElement('br'), detail);
    li.append(mark, body);
    reqs.appendChild(li);
  }

  const taxes = $('taxChecks');
  taxes.replaceChildren();
  if (audit.taxChecks.length === 0) {
    const li = document.createElement('li');
    li.className = 'ng';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = '!';
    const body = document.createElement('span');
    body.textContent = '税率ごとの区分が読み取れなかったため検算できません。';
    li.append(mark, body);
    taxes.appendChild(li);
  }
  for (const c of audit.taxChecks) {
    const li = document.createElement('li');
    li.className = c.ok ? 'ok' : 'ng';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = c.ok ? '✓' : '!';
    const body = document.createElement('span');
    body.textContent = c.detail;
    li.append(mark, body);
    taxes.appendChild(li);
  }

  const actions = $('actions');
  actions.replaceChildren();
  for (const a of audit.actions) {
    const li = document.createElement('li');
    li.textContent = a;
    actions.appendChild(li);
  }
  $('actionsWrap').hidden = audit.actions.length === 0;

  $('rawJson').textContent = JSON.stringify(invoice, null, 2);
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

init();
