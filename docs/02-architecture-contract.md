# PitchMirror アーキテクチャ契約（開発エージェント間の唯一の真実）

この文書のインターフェースは**固定**。3体の開発エージェントは自分の担当ファイルのみを作成し、
他のエージェントの担当ファイルは**絶対に作成・編集しない**。

## ファイル所有権

| 担当 | 所有ファイル（これ以外に触れない） |
|------|-----------------------------------|
| **Dev A（解析エンジン）** | `src/engine/audio-engine.js`, `src/engine/scorer.js`, `src/engine/simulator.js` |
| **Dev B（可視化）** | `src/viz/gauges.js`, `src/viz/terrain.js`, `src/viz/timeline.js` |
| **Dev C（シェル/UI）** | `index.html`, `src/app.js`, `src/styles.css`, `README.md`, `docs/03-demo-script.md` |

すべて **ES Modules**（`<script type="module">`）。ビルド不要。`index.html` をブラウザで直接開いて動くこと。
外部CDN・npm依存は**一切禁止**。

## 共有データ型

```js
/**
 * 20-60ms ごとに1つ生成される解析フレーム。
 * @typedef {Object} Frame
 * @property {number} t         - 計測開始からの経過秒
 * @property {number} rms       - 音量 0..1（正規化済み）
 * @property {number} pitchHz   - 推定基本周波数 Hz（無声時は 0）
 * @property {number} centroid  - スペクトル重心 0..1（声の明るさ）
 * @property {boolean} voiced   - 発声中か
 * @property {Float32Array} spectrum - 32bin の正規化スペクトル 0..1
 */

/**
 * スコア。0..100。すべてローカル計算。
 * @typedef {Object} Score
 * @property {number} pace      - 話速の適正度（速すぎ/遅すぎで減点）
 * @property {number} energy    - 熱量（音量の平均と立ち上がりの鋭さ）
 * @property {number} variation - 抑揚（ピッチ・音量の分散。棒読みで低下）
 * @property {number} pause     - 間の使い方（適度な無音は加点、詰まりは減点）
 * @property {number} overall   - 上記の加重平均
 */

/**
 * @typedef {Object} Metrics
 * @property {number} elapsed        - 経過秒
 * @property {number} syllableRate   - 推定音節数/秒
 * @property {number} speakingRatio  - 発話時間 / 経過時間 0..1
 * @property {number} longestPause   - 最長無音秒
 * @property {number} pauseCount     - 0.35秒以上の無音の回数
 * @property {number} fillerCount    - フィラー語数（Speech API 無効時は 0）
 * @property {string[]} coachTips    - 日本語の短い指摘文。最大3件。
 */
```

## Dev A の公開 API（`src/engine/audio-engine.js`）

```js
export class AudioEngine {
  /** @param {{onFrame:(f:Frame)=>void, onTick:(s:Score,m:Metrics)=>void}} handlers */
  constructor(handlers) {}
  /** マイク起動。失敗時は例外を投げる（呼び出し側が simulate() へフォールバック） */
  async start() {}
  /** マイク無しでも完走できるデモ用の合成入力。引数はシナリオ名 */
  startSimulation(scenario /* 'monotone' | 'energetic' */) {}
  stop() {}
  /** 計測終了後の最終結果 */
  getSummary() { /* => {score:Score, metrics:Metrics, frames:Frame[]} */ }
  /** Web Speech API を任意で有効化。未対応環境では false を返すだけで例外を投げない */
  enableSpeech() { /* => boolean */ }
}
```
- `onFrame` は毎フレーム、`onTick` は約200msごとに呼ばれる。
- **重要**: `startSimulation('monotone')` は低スコア、`startSimulation('energetic')` は高スコアを再現性を持って出すこと（デモの仕込みに使う）。

## Dev B の公開 API（`src/viz/*.js`）

```js
// gauges.js — 4指標のライブゲージ + overall の大型リング
export class Gauges {
  constructor(canvas /* HTMLCanvasElement */) {}
  update(score /* Score */) {}   // 値は内部で補間しなめらかに動かす
  resize() {}
}

// terrain.js — スペクトルを地形として奥に流す（アイソメトリック擬似3D）
export class Terrain {
  constructor(canvas) {}
  push(frame /* Frame */) {}
  resize() {}
}

// timeline.js — 発話/無音の帯 + フィラー位置マーカー
export class Timeline {
  constructor(canvas) {}
  push(frame /* Frame */, metrics /* Metrics */) {}
  resize() {}
}
```
- 3クラスすべて `requestAnimationFrame` ループを**自前で回す**。`update`/`push` はデータ投入のみ。
- `devicePixelRatio` 対応必須。
- 色は CSS 変数を `getComputedStyle` で読む: `--accent`, `--warn`, `--bg`, `--fg`, `--muted`。

## Dev C の責務
- `index.html` に上記を組み立て、開始/停止、マイク不許可時の自動フォールバック、
  デモ用の「棒読みモード / 熱量モード」ボタン、終了後のサマリー画面を実装。
- README は W6 準拠（1行目=課題 / 2行目=起動方法 / 3行目=スクショ枠 / その後に技術）。

## 全員共通の禁止事項
- `git commit` / `git push` を実行しない（統合役がまとめて行う）
- 担当外ファイルの作成・編集
- 外部ネットワークアクセスを伴うコード
