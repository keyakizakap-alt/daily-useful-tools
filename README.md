発表練習をしても「棒読みだった」と気づけるのは録画を見返した後で、しかも大半の人は見返さないまま本番に立つ。

**起動方法: `index.html` をブラウザ（Chrome推奨）で開くだけ。** インストール・ビルド・APIキー・ネット接続、すべて不要。

<!-- TODO: スクリーンショット / デモGIF をここに差し替える（`docs/assets/demo.gif`） -->
![PitchMirror デモ（TODO: 画像未撮影）](docs/assets/demo.gif)

---

# PitchMirror（ピッチミラー）

> 発表しているあなた自身を、その場で採点する鏡。

マイクの音だけを使って、話速・熱量・抑揚・間の4指標をリアルタイムに0〜100で採点し、
「今すぐ直せること」を日本語の短い指摘として画面に出し続けます。
音声はブラウザの外に一切出ません。サーバーもクラウドもありません。

## 3分デモの流れ

| 時間 | 内容 |
|------|------|
| 0:00–0:20 | 「今このプレゼンは、この画面に採点されています」— 自己言及で掴む |
| 0:20–1:00 | 課題提示。練習しても自分の話し方は自分では聞こえない |
| 1:00–1:40 | **棒読みモード** — 同じ原稿を抑揚なしで読み、スコアが落ちる様子を見せる |
| 1:40–2:20 | **熱量モード** — 同じ原稿を熱を込めて読み、スコアが跳ね上がる |
| 2:20–2:50 | **審査員にマイクを渡す。** その場で審査員自身が採点される |
| 2:50–3:00 | クローズ。「練習の質を、誰でも今日から上げられます」 |

詳細な秒刻みの台本は [`docs/03-demo-script.md`](docs/03-demo-script.md)。

## 使い方

| 操作 | 動作 |
|------|------|
| 計測開始 | マイクを要求して計測を始める（`Space` でも可） |
| 棒読みモード | 合成入力で低スコアを再現（`1` キー） |
| 熱量モード | 合成入力で高スコアを再現（`2` キー） |
| 終了 | 計測を止めてサマリー画面を表示（`Space`） |
| フィラー検出 | Web Speech API による「えー」「あのー」の計数。**任意機能** |

マイクが拒否された・存在しない・`file://` で安全でない文脈だった場合は、
行き止まりにせず画面上でシミュレーションモードを提示します。**デモは必ずオチまで到達します。**

## アーキテクチャ

```
index.html
├─ src/styles.css        UI（CSS変数 --accent/--warn/--bg/--fg/--muted を可視化層へ供給）
├─ src/app.js            アプリシェル。エンジン→可視化の配線、フォールバック、サマリー
├─ src/engine/
│   ├─ audio-engine.js   Web Audio API。マイク取得・特徴量抽出・フレーム生成
│   ├─ scorer.js         特徴量 → 4指標スコア + 日本語コーチ文（完全ローカル）
│   └─ simulator.js      マイク無しでも完走するための合成入力
└─ src/viz/
    ├─ terrain.js        スペクトルを擬似3D地形として奥へ流す（主役の絵）
    ├─ gauges.js         4指標ゲージ + 総合スコアの大型リング
    └─ timeline.js       発話/沈黙の帯とフィラー位置マーカー
```

データの流れはひとつだけです。

```
AudioEngine ──onFrame(Frame 20-60ms)──▶ Terrain.push() / Timeline.push()
            └─onTick(Score, Metrics 200ms)──▶ Gauges.update() / コーチ文パネル
```

すべて ES Modules。トランスパイルもバンドルもしません。`index.html` がそのまま製品です。

## なぜゼロ依存にこだわったか

ハッカソンのデモが落ちる原因は、ほぼ常に**自分たちのコード以外**です。
会場Wi-Fiの遅延、CDNの応答、APIのレート制限、キーの失効。
PitchMirror は外部への通信を1本も持たないため、**ネットワークが完全に死んでいる会場でも同じように動きます。**

副作用として、プライバシー面でも強い性質が手に入りました。
音声はブラウザのメモリ上だけで処理され、録音も送信も保存もしません。
社外秘の内容をリハーサルしても、データはどこにも残りません。

## 正直な限界

- **話速の推定は音節数の近似です。** 振幅エンベロープのピーク計数によるもので、言語学的に厳密な音節数ではありません。日本語以外では精度が落ちます。
- **「良い発表」の定義は文脈依存です。** 本ツールは声の物理量しか見ていません。落ち着いた語りが適切な場面でも、熱量スコアは低く出ます。スコアは絶対評価ではなく、自分の過去の自分との比較に使うのが正しい使い方です。
- **内容は一切評価していません。** 論理構成・スライド・説得力は対象外です。
- **フィラー検出は Web Speech API 依存**で、Chrome 以外では動かないことがあります。無効時はスコアリングから除外され、UIに「利用できません」と明示されます（黙って0件にはしません）。
- **騒がしい会場では雑音を発話として拾います。** 単一マイク・単一チャンネルのため話者分離はできません。
- シミュレーションモードは**あくまでデモ用の合成入力**であり、実測ではありません。UI上も「シミュレーション」と表示されます。

## ロードマップ

1. **セッション履歴とセルフ比較** — 過去の計測を IndexedDB に保存し、「先週の自分」と重ねて表示する。上達が見えることが練習継続の最大の動機になる。
2. **原稿アップロードとの突き合わせ** — テキストを読み込ませ、どの段落でスコアが落ちたかを行単位で対応付ける。
3. **リハーサル・リプレイ** — フレーム列を保存し、地形とスコアを巻き戻して「ここで平坦になった」を指差せるようにする。
4. **多言語対応** — 音節推定パラメータを言語別に切り替える。
5. **オンライン会議への常駐** — タブ音声をキャプチャして、会議中に自分だけに見えるコーチを出す。
6. **共有カード生成** — サマリーを1枚の画像に書き出し、チームで練習結果を共有する（画像生成もローカル Canvas で完結）。

## ライセンス

[LICENSE](LICENSE) を参照。

---

## English summary

**Problem:** you only find out your talk was monotone after watching the recording — and most people never watch it.

**PitchMirror** is a browser-only live presentation coach. It listens through the microphone and scores four dimensions — pace, energy, pitch variation, and use of pauses — from 0 to 100 in real time, surfacing short, actionable Japanese coaching tips while you speak.

**Run it:** open `index.html` in Chrome. No install, no build step, no API key, no network.

**Zero dependencies by design.** Every scoring decision is computed locally from Web Audio API features. Nothing is uploaded, recorded, or stored, so it works on a dead conference Wi-Fi and is safe for confidential rehearsals. If the microphone is unavailable, the app offers a simulation mode instead of dead-ending, so the demo always reaches its punchline.

**Known limits:** syllable rate is an amplitude-envelope approximation, not linguistic analysis; the tool measures voice physics only and never evaluates content; filler-word detection depends on the optional Web Speech API and says so in the UI when unavailable.
