/* =========================================================================
 * PitchMirror — アプリシェル
 *
 * 役割は3つだけ。
 *   1. エンジン（Dev A）と可視化（Dev B）を組み立てる
 *   2. onFrame → 地形 / タイムライン、onTick → ゲージ / コーチ に配る
 *   3. 何が壊れてもデモがオチまで到達するようにする（W4）
 *
 * 依存ゼロ。ビルド不要。ネットワークアクセス皆無。
 * ========================================================================= */

/* ---------------------------------------------------------------
 * 1. DOM 参照
 * ------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const el = {
  status:        $('status'),
  statusLabel:   $('statusLabel'),
  clock:         $('clock'),

  notice:        $('notice'),
  noticeTitle:   $('noticeTitle'),
  noticeText:    $('noticeText'),
  noticeActions: $('noticeActions'),
  noticeClose:   $('noticeClose'),

  terrainCanvas:  $('terrainCanvas'),
  gaugesCanvas:   $('gaugesCanvas'),
  timelineCanvas: $('timelineCanvas'),

  tips:    $('tips'),
  readout: {
    overall:    $('mOverall'),
    rate:       $('mRate'),
    ratio:      $('mRatio'),
    pause:      $('mPause'),
    pauseCount: $('mPauseCount'),
    filler:     $('mFiller'),
  },

  btnStart:     $('btnStart'),
  btnStop:      $('btnStop'),
  btnMonotone:  $('btnMonotone'),
  btnEnergetic: $('btnEnergetic'),
  speechToggle: $('speechToggle'),
  speechNote:   $('speechNote'),

  summary:        $('summary'),
  verdict:        $('verdict'),
  sOverall:       $('sOverall'),
  summaryBars:    $('summaryBars'),
  summaryMetrics: $('summaryMetrics'),
  summaryTips:    $('summaryTips'),
  btnAgain:       $('btnAgain'),
  btnClose:       $('btnClose'),

  bootfail:     $('bootfail'),
  bootfailText: $('bootfailText'),
};

/* ---------------------------------------------------------------
 * 2. 実行時の状態
 * ------------------------------------------------------------- */

const state = {
  engine: null,
  viz: { gauges: null, terrain: null, timeline: null },
  running: false,
  mode: 'idle',          // 'idle' | 'live' | 'sim'
  startedAt: 0,
  lastMetrics: null,
  clockTimer: 0,
  speechWanted: false,
};

/* ---------------------------------------------------------------
 * 3. モジュール読み込み（欠けても黙って死なない）
 *
 * 動的 import にしているのは、Dev A / Dev B のファイルが片方だけ
 * 欠けている状態でも「何が無いか」を画面に出したいため。
 * 静的 import だと 1 ファイル欠けただけで全画面が空白になる。
 * ------------------------------------------------------------- */

async function loadModules() {
  // エンジンは必須。無ければ何もできないので致命的エラー扱い。
  try {
    const mod = await import('./engine/audio-engine.js');
    state.engine = new mod.AudioEngine({ onFrame, onTick });
  } catch (err) {
    fatal('src/engine/audio-engine.js を読み込めませんでした: ' + describe(err));
    return false;
  }

  // 可視化は個別に落とす。1つ壊れても残りは動く。
  await attachViz('terrain',  './viz/terrain.js',  'Terrain',  el.terrainCanvas,  'terrainFallback');
  await attachViz('gauges',   './viz/gauges.js',   'Gauges',   el.gaugesCanvas,   'gaugesFallback');
  await attachViz('timeline', './viz/timeline.js', 'Timeline', el.timelineCanvas, 'timelineFallback');

  return true;
}

async function attachViz(key, path, className, canvas, fallbackId) {
  try {
    const mod = await import(path);
    state.viz[key] = new mod[className](canvas);
  } catch (err) {
    state.viz[key] = null;
    const fb = document.getElementById(fallbackId);
    if (fb) {
      fb.textContent = className + ' を読み込めません（' + path + '）。他の表示は動作します。';
      fb.hidden = false;
    }
    console.warn('[PitchMirror] viz 読み込み失敗:', path, err);
  }
}

const describe = (err) => (err && err.message) ? err.message : String(err);

function fatal(message) {
  el.bootfailText.textContent = message;
  el.bootfail.hidden = false;
  setControlsEnabled(false);
}

/* ---------------------------------------------------------------
 * 4. エンジン → 可視化 のデータ配線
 * ------------------------------------------------------------- */

/** 毎フレーム（20-60ms）。地形とタイムラインへ。 */
function onFrame(frame) {
  if (state.viz.terrain)  state.viz.terrain.push(frame);
  if (state.viz.timeline) state.viz.timeline.push(frame, state.lastMetrics);
}

/** 約200msごと。ゲージ・数値・コーチ文へ。 */
function onTick(score, metrics) {
  state.lastMetrics = metrics;
  if (state.viz.gauges) state.viz.gauges.update(score);
  renderReadout(score, metrics);
  renderTips(metrics.coachTips, score.overall);
}

/* ---------------------------------------------------------------
 * 5. ライブ表示
 * ------------------------------------------------------------- */

const n0 = (v) => Number.isFinite(v) ? Math.round(v) : 0;
const n1 = (v) => Number.isFinite(v) ? v.toFixed(1) : '0.0';

function renderReadout(score, m) {
  el.readout.overall.textContent    = n0(score.overall);
  el.readout.rate.textContent       = n1(m.syllableRate);
  el.readout.ratio.textContent      = n0(m.speakingRatio * 100) + '%';
  el.readout.pause.textContent      = n1(m.longestPause) + 's';
  el.readout.pauseCount.textContent = n0(m.pauseCount);
  el.readout.filler.textContent     = state.speechWanted ? n0(m.fillerCount) : '—';
}

let lastTipsKey = null;   // null = 未描画。'' はコーチ文0件という正当な状態なので区別する

function renderTips(tips, overall) {
  const list = Array.isArray(tips) ? tips.slice(0, 3) : [];
  const key = list.join('|');
  if (key === lastTipsKey) return;     // 内容が同じなら再描画しない（点滅防止）
  lastTipsKey = key;

  el.tips.textContent = '';
  if (list.length === 0) {
    el.tips.appendChild(tipNode('いい調子です。そのまま続けてください。', false));
    return;
  }
  const warn = Number.isFinite(overall) && overall < 60;
  for (const text of list) el.tips.appendChild(tipNode(text, warn));
}

function tipNode(text, warn) {
  const li = document.createElement('li');
  li.className = 'tip' + (warn ? ' tip-warn' : '');
  li.textContent = text;
  return li;
}

function setStatus(stateName, label) {
  el.status.dataset.state = stateName;
  el.statusLabel.textContent = label;
}

function startClock() {
  state.startedAt = performance.now();
  stopClock();
  el.clock.textContent = '00:00';
  state.clockTimer = setInterval(() => {
    const s = Math.floor((performance.now() - state.startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    el.clock.textContent = mm + ':' + ss;
  }, 250);
}

function stopClock() {
  if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = 0; }
}

/* ---------------------------------------------------------------
 * 6. 通知バナー
 * ------------------------------------------------------------- */

/** @param {{label:string, primary?:boolean, onClick:Function}[]} actions */
function showNotice(title, text, actions = []) {
  el.noticeTitle.textContent = title;
  el.noticeText.textContent = text;
  el.noticeActions.textContent = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm' + (a.primary ? ' btn-primary' : '');
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    el.noticeActions.appendChild(b);
  }
  el.notice.hidden = false;
}

const hideNotice = () => { el.notice.hidden = true; };

/* ---------------------------------------------------------------
 * 7. 計測の開始・停止
 * ------------------------------------------------------------- */

function beginSession(mode, label) {
  state.running = true;
  state.mode = mode;
  state.lastMetrics = null;
  lastTipsKey = null;
  setStatus(mode, label);
  startClock();
  setControlsEnabled(true);
  el.summary.hidden = true;
}

async function startLive() {
  hideNotice();
  if (!state.engine) return;
  try {
    await state.engine.start();
    beginSession('live', 'マイク計測中');
    if (state.speechWanted) applySpeechToggle(true);
  } catch (err) {
    // ★ W4: ここで行き止まりにしない。必ずシミュレーションへ逃がす。
    console.warn('[PitchMirror] マイク起動失敗:', err);
    showNotice(
      'マイクを使えませんでした',
      micReason(err) + ' シミュレーションでそのままデモを続けられます。',
      [
        { label: '熱量モードで続行', primary: true, onClick: () => startSim('energetic') },
        { label: '棒読みモードで続行', onClick: () => startSim('monotone') },
        { label: 'マイクを再試行', onClick: startLive },
      ]
    );
    setStatus('idle', 'マイク不可');
  }
}

function micReason(err) {
  const name = err && err.name ? err.name : '';
  if (!window.isSecureContext) {
    return 'このページは安全なコンテキスト（https:// または localhost）ではありません。';
  }
  if (name === 'NotAllowedError')  return 'ブラウザでマイクの使用が拒否されました。';
  if (name === 'NotFoundError')    return 'マイクデバイスが見つかりませんでした。';
  if (name === 'NotReadableError') return '他のアプリがマイクを占有している可能性があります。';
  return '原因: ' + describe(err);
}

function startSim(scenario) {
  hideNotice();
  if (!state.engine) return;
  try {
    if (state.running) state.engine.stop();
    state.engine.startSimulation(scenario);
    beginSession('sim', scenario === 'monotone' ? '棒読みモード（シミュレーション）'
                                                : '熱量モード（シミュレーション）');
  } catch (err) {
    showNotice('シミュレーションを開始できませんでした', describe(err), []);
  }
}

function stopSession() {
  if (!state.engine || !state.running) return;
  state.running = false;
  state.mode = 'idle';
  stopClock();
  try { state.engine.stop(); } catch (err) { console.warn('[PitchMirror] stop:', err); }
  setStatus('done', '計測終了');
  setControlsEnabled(true);

  let summary = null;
  try { summary = state.engine.getSummary(); }
  catch (err) { console.warn('[PitchMirror] getSummary:', err); }

  if (summary && summary.score && summary.metrics) {
    renderSummary(summary.score, summary.metrics);
  } else {
    showNotice('結果を取得できませんでした', 'getSummary() が有効な結果を返しませんでした。', []);
  }
}

function setControlsEnabled() {
  el.btnStop.disabled = !state.running;
}

/* ---------------------------------------------------------------
 * 8. サマリー画面
 * ------------------------------------------------------------- */

const SCORE_ROWS = [
  ['pace',      '話速'],
  ['energy',    '熱量'],
  ['variation', '抑揚'],
  ['pause',     '間'],
];

function renderSummary(score, m) {
  el.sOverall.textContent = n0(score.overall);
  el.verdict.textContent = verdictFor(score);

  el.summaryBars.textContent = '';
  for (const [key, label] of SCORE_ROWS) {
    el.summaryBars.appendChild(scoreBar(label, score[key]));
  }

  el.summaryMetrics.textContent = '';
  const cells = [
    ['話した時間',   n1(m.elapsed) + ' 秒'],
    ['音節/秒',      n1(m.syllableRate)],
    ['発話率',       n0(m.speakingRatio * 100) + ' %'],
    ['最長の沈黙',   n1(m.longestPause) + ' 秒'],
    ['間の回数',     String(n0(m.pauseCount))],
    ['フィラー',     state.speechWanted ? String(n0(m.fillerCount)) : '未計測'],
  ];
  for (const [k, v] of cells) el.summaryMetrics.appendChild(metricCell(k, v));

  el.summaryTips.textContent = '';
  const tips = Array.isArray(m.coachTips) && m.coachTips.length
    ? m.coachTips
    : ['大きな問題は見つかりませんでした。'];
  for (const t of tips) {
    const li = document.createElement('li');
    li.textContent = t;
    el.summaryTips.appendChild(li);
  }

  el.summary.hidden = false;
  el.btnAgain.focus();
}

function scoreBar(label, value) {
  const v = Math.max(0, Math.min(100, n0(value)));
  const row = document.createElement('div');
  row.className = 'sbar';

  const name = document.createElement('span');
  name.className = 'sbar-name';
  name.textContent = label;

  const track = document.createElement('div');
  track.className = 'sbar-track';
  const fill = document.createElement('div');
  fill.className = 'sbar-fill' + (v < 60 ? ' low' : '');
  fill.style.width = v + '%';
  track.appendChild(fill);

  const val = document.createElement('span');
  val.className = 'sbar-val';
  val.textContent = String(v);

  row.append(name, track, val);
  return row;
}

function metricCell(k, v) {
  const box = document.createElement('div');
  box.className = 'scell';
  const kk = document.createElement('span');
  kk.className = 'scell-k';
  kk.textContent = k;
  const vv = document.createElement('span');
  vv.className = 'scell-v';
  vv.textContent = v;
  box.append(kk, vv);
  return box;
}

/** 総合点＋一番弱い指標から、一行の講評を作る。 */
function verdictFor(score) {
  const o = n0(score.overall);
  let worstKey = 'pace', worstVal = Infinity;
  for (const [key] of SCORE_ROWS) {
    const v = n0(score[key]);
    if (v < worstVal) { worstVal = v; worstKey = key; }
  }
  const weak = {
    pace:      '次に効くのは、話す速さを整えること。',
    energy:    '次に効くのは、声の熱量をもう一段上げること。',
    variation: '次に効くのは、抑揚をつけること。',
    pause:     '次に効くのは、間を意識的に取ること。',
  }[worstKey];

  const head =
    o >= 85 ? 'このまま本番に出られます。' :
    o >= 70 ? '伝わる発表です。あと一歩。' :
    o >= 55 ? '内容は届いていますが、届き方が惜しい。' :
              '今の話し方だと、聞き手の集中が切れます。';

  return head + ' ' + weak;
}

/* ---------------------------------------------------------------
 * 9. Web Speech API トグル（任意機能。使えなければ正直に言う）
 * ------------------------------------------------------------- */

function applySpeechToggle(checked) {
  if (!checked) {
    state.speechWanted = false;
    el.speechNote.classList.remove('unsupported');
    el.speechNote.textContent = '（任意 / Web Speech API）';
    return;
  }
  let ok = false;
  try { ok = state.engine ? state.engine.enableSpeech() === true : false; }
  catch (err) { console.warn('[PitchMirror] enableSpeech:', err); ok = false; }

  state.speechWanted = ok;
  el.speechToggle.checked = ok;

  if (ok) {
    el.speechNote.classList.remove('unsupported');
    el.speechNote.textContent = '（有効 / フィラー語を数えます）';
  } else {
    // 黙って無効化しない。使えないことを画面に出す。
    el.speechNote.classList.add('unsupported');
    el.speechNote.textContent = '（この環境では利用できません）';
    showNotice(
      'フィラー検出は使えません',
      'この環境では Web Speech API が利用できないため、フィラー語の検出は無効です。'
      + '音声特徴量によるスコアリングはすべて通常どおり動作します。',
      []
    );
  }
}

/* ---------------------------------------------------------------
 * 10. リサイズ（契約: 各 viz は resize() を持つ）
 * ------------------------------------------------------------- */

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeAll, 120);
});

function resizeAll() {
  for (const v of Object.values(state.viz)) {
    if (v && typeof v.resize === 'function') {
      try { v.resize(); } catch (err) { console.warn('[PitchMirror] resize:', err); }
    }
  }
}

/* ---------------------------------------------------------------
 * 11. イベント配線と起動
 * ------------------------------------------------------------- */

function wireControls() {
  el.btnStart.addEventListener('click', startLive);
  el.btnStop.addEventListener('click', stopSession);
  el.btnMonotone.addEventListener('click', () => startSim('monotone'));
  el.btnEnergetic.addEventListener('click', () => startSim('energetic'));
  el.speechToggle.addEventListener('change', (e) => applySpeechToggle(e.target.checked));

  el.noticeClose.addEventListener('click', hideNotice);
  el.btnClose.addEventListener('click', () => { el.summary.hidden = true; });
  el.btnAgain.addEventListener('click', () => { el.summary.hidden = true; startLive(); });

  // 壇上でマウスを探さないためのキーボードショートカット
  document.addEventListener('keydown', (e) => {
    // フォーカス中のボタン/入力は、ブラウザ既定の動作に任せて二重発火を防ぐ。
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLButtonElement) return;
    if (e.key === '1') startSim('monotone');
    if (e.key === '2') startSim('energetic');
    if (e.key === 'Escape') el.summary.hidden = true;
    if (e.code === 'Space') { e.preventDefault(); state.running ? stopSession() : startLive(); }
  });
}

async function boot() {
  wireControls();
  setControlsEnabled();

  const ok = await loadModules();
  if (!ok) return;

  resizeAll();

  if (!window.isSecureContext) {
    showNotice(
      'マイクが使えない可能性があります',
      'file:// で開いているため、ブラウザがマイクを拒否することがあります。'
      + 'その場合も「棒読みモード / 熱量モード」でデモは最後まで進みます。',
      [{ label: '熱量モードを試す', primary: true, onClick: () => startSim('energetic') }]
    );
  }
}

boot();
