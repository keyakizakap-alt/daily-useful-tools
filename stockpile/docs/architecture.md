# 設計書 — 「そなえ帳」

- 日付: 2026-11-09
- 関連文書: [requirements.md](./requirements.md)

## 1. システム構成

```
stockpile/
├── index.html        画面の骨組み（CSP をメタタグで宣言）
├── src/
│   ├── engine.js     計算・検証の純粋関数（DOM に触れない）。ブラウザでは window.Sonae、Node では module.exports
│   ├── app.js        画面の描画とイベント処理。engine.js だけを使う
│   └── styles.css    見た目（ライト／ダーク）
├── tests/
│   └── engine.test.mjs  node:test による単体テスト（ルートの `npm test` から実行）
├── docs/             要件・設計・PR 説明
└── feedback/         レビュー記録
```

- サーバーなし・ビルドなし・依存パッケージなし。`index.html` を開くだけで動く。
- `file://` で動かすため ES Modules は使わず、`<script src>` の順読み込み（engine → app）にする。
- `engine.js` は UMD 形式の小さな包みで、ブラウザとテスト（`createRequire`）から同じコードを読む。

## 2. データモデル

```js
// localStorage キー: "sonae-cho:v1"
{
  version: 1,
  household: { adults: 2, children: 0, infants: 0, elders: 0, dogs: 0, cats: 0, days: 7 },
  items: [
    { id: "i-lx3k...", reqId: "water", name: "保存水 2L", qty: 12, expiry: "2027-08-31" }
  ]
}
```

- `qty` は必要量と同じ単位（水は L、主食は食…）。品目選択時に単位を画面に表示する。
- `reqId` は必要量の品目 ID か `"other"`（集計対象外の自由記入）。
- `expiry` は `YYYY-MM-DD` か空文字（期限なし）。

## 3. 主要関数（`src/engine.js`）

| 関数 | 入力 → 出力 | 概要 |
|---|---|---|
| `calcRequirements(household)` | 家族構成 → 必要量の配列 | 基準表 `REQUIREMENTS` を人数・日数に掛ける。0 の品目は除く |
| `daysUntil(expiry, today)` | 期限・今日 → 残り日数 or `null` | 暦日の差（時差の影響を受けないよう UTC の日付で計算） |
| `expiryStatus(days)` | 残り日数 → `expired` / `soon` / `rolling` / `ok` / `none` | 0未満・30日以内・60日以内・それ以上・期限なし |
| `summarize(household, items, today)` | → `{ rows, coverage, waterDays, alerts }` | 品目別の充足量（期限切れを除く）・充足率・全体充足率・水の日数・期限アラート |
| `shoppingList(summary)` | → 文字列 | 不足分を「・品目 あと◯単位」の行にする |
| `sanitizeState(raw)` | 任意の値 → `{ ok, state, errors }` | 読み込み・保存データの検証。型・範囲・件数（500件）・文字数（40字）を確認し、知らない項目は捨てる |

## 4. 画面構成

1. ヘッダー: 名称、「データはこの端末にだけ保存され、送信されません」
2. 概況: 全体の充足率、水の残り日数、期限切れ・期限間近の件数
3. 家族構成: 人数・日数の数値入力（変更すると即再計算）
4. 必要量と充足: 品目ごとに「必要量 / ある量 / 充足率バー / 状態（足りている・あと◯）」
5. 期限のお知らせ: 期限切れ / 30日以内 / 今月食べて買い足す（60日以内）
6. 在庫: 追加フォーム（品目・品名・数量・期限）と一覧（数量変更・削除）
7. 買い物リスト: 不足分の一覧と「コピー」
8. データ: 書き出し / 読み込み / 全消去、基準値の根拠と公式リンク

## 5. セキュリティ方針

| 脅威 | 対策 |
|---|---|
| 生活情報の外部送信 | 通信コードなし。CSP `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'` |
| XSS（品名・読み込み JSON） | DOM 生成は `createElement` + `textContent` のみ。`innerHTML` を使わない |
| 不正な読み込みデータ | `sanitizeState` で型・範囲・件数・文字数・日付の実在を検証。`__proto__` 等は既知キーだけを写すことで無視 |
| 巨大ファイルによるフリーズ | 読み込みファイルは 1MB まで |
| 秘密情報 | API キー等を持たない（ハードコーディングする対象がない） |
| 依存ライブラリ | 依存0。サプライチェーン経路なし |
| クリックジャッキング | ルートの `vercel.json` の `X-Frame-Options: SAMEORIGIN` を継承 |

## 6. テスト方針

- `stockpile/tests/engine.test.mjs`（node:test）で計算・期限判定・集計・検証をテストする。
- ルートの `npm test` に含め、Stop フックでも実行されるようにする。
- 画面は Playwright で開き、主要操作（人数変更・在庫追加・XSS 文字列・読み込みエラー）を手動確認する（自動化は MVP 外）。
