# 設計: 俳句アシスト（Haiku Assist）

## アーキテクチャ
静的なフロントエンドのみの構成（サーバー不要）。

```
apps/2026-08-08-haiku-assist/
├── docs/
│   ├── idea.md          ... アイデアと背景
│   ├── requirements.md  ... 要件定義
│   └── design.md        ... 本ファイル（設計）
├── src/
│   ├── index.html        ... UI本体
│   ├── style.css          ... スタイル
│   ├── mora.js            ... モーラ（音）カウントの純粋関数（ブラウザ/Node両対応）
│   ├── kigo.js             ... 季語辞書データ
│   └── app.js               ... UIロジック（DOM操作、状態管理）
├── tests/
│   └── mora.test.js       ... mora.js の自動テスト（Node.js, 標準assertのみ使用）
└── feedback/
    ├── round1-self-review.md   ... 1回目のセルフレビュー（模擬ユーザーテスト）
    └── round2-followup.md      ... 改善後の振り返り
```

## モジュール設計

### mora.js
- `countMora(text: string): number`
  - 入力文字列からモーラ数を計算する純粋関数。
  - UMDライクな最小限の形で `module.exports`（Node）と `window.MoraUtil`（ブラウザ）の両方に公開し、
    ビルドツールなしで `tests/mora.test.js` と `src/app.js` の両方から利用できるようにする。
- `judgeMora(count: number, target: number): 'ok' | 'ng'`
  - 目標音数と一致しているかを判定するヘルパー。

### kigo.js
- 季節（`spring`/`summer`/`autumn`/`winter`/`newyear`）をキーとする季語配列を持つオブジェクト
  `KIGO_DICTIONARY` を `window.KigoData` / `module.exports` として公開。
- 各季語エントリは `{ word: string, reading: string, description: string }` の形。

### app.js
- 3つの入力欄（上五・中七・下五）に `input` イベントリスナーを設定し、
  入力のたびに `mora.js` の関数で音数を再計算・再描画する。
- 季節セレクターの変更、および「更新」ボタンのクリックで季語候補をランダムに再抽選する。
- 入力欄の内容全体を結合し、`KIGO_DICTIONARY` の全季語と部分一致検索して季語検出を行う。
- 「俳句をコピー」ボタンで `navigator.clipboard.writeText` を呼び出す
  （非対応環境向けに `document.execCommand('copy')` へのフォールバックも用意）。

## モーラカウントのアルゴリズム
1. 文字列を1文字ずつ走査する。
2. 各文字について:
   - 小書き文字集合（ゃゅょぁぃぅぇぉ + カタカナ版）に属する場合 → カウントしない（直前の文字と結合済みとみなす）
   - それ以外の「数える対象」文字集合（ひらがな・カタカナ全般、っ／ッ、ん／ン、ー）に属する場合 → 1加算
   - 上記以外（漢字・英数字・記号・空白）→ 無視（0加算）
3. 合計値を返す。

この方式により、最初の文字が小書き文字であっても（通常起こらないが）安全に0扱いとなり、
拗音の直前文字とのペアを個別に検出するロジックを持たずに正しくカウントできる
（「直前と結合する」のではなく「小書き文字自体を無視する」ことで同じ結果を実現するシンプルな実装）。

## テスト方針
- `tests/mora.test.js` は Node.js 標準の `assert` モジュールのみを使い、外部依存なしで
  `node tests/mora.test.js` として実行できるようにする。
- 要件定義の受け入れ基準に挙げた代表例（がっこう＝4音 等）を含む複数ケースを網羅する。
