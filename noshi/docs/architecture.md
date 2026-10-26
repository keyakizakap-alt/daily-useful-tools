# 設計書 — 「のしるべ」

- 日付: 2026-10-26
- 関連文書: [requirements.md](./requirements.md)

## 1. システム構成

サーバー・ビルド・依存パッケージのない静的 Web アプリ。ブラウザで `noshi/index.html` を開くだけで動く。

```
noshi/
├── index.html          画面の骨組み（静的な日本語テキストのみ）
├── src/
│   ├── engine.js       相場表・マナー表・金額点検・大字変換（DOM 非依存の純粋関数, UMD）
│   ├── app.js          入力の読み取り → engine 呼び出し → 結果の描画（DOM 担当）
│   └── styles.css      見た目（ライト/ダーク・縦書きプレビュー）
├── tests/
│   ├── engine.test.js  engine の単体テスト（node:test）
│   └── smoke.mjs       Playwright によるブラウザ結合テスト（未導入環境ではスキップ）
├── docs/               要件定義書・設計書
├── feedback/           レビュー結果
└── package.json        テスト・監査のスクリプト（依存なし）
```

### データの流れ

```
[入力フォーム] --input/change--> app.js readForm()
        └─> engine.getGuide(sceneId, opts)     … 包み方一式・金額の目安
        └─> engine.parseYen(text)              … 金額の解釈
        └─> engine.checkAmount(sceneId, yen, guide) … 点検結果
        └─> engine.toDaiji(yen) / billPlan()   … 中袋の表記・お札の組み合わせ
        └─> app.js render() --textContent--> [結果領域 / 袋プレビュー]
```

外部への送信・保存は一切ない。

## 2. モジュール設計

### 2.1 engine.js（公開 API）

| 関数 | 入力 | 出力 |
|---|---|---|
| `SCENES` | — | 場面の一覧（id・名称・グループ・金額の決め方） |
| `RELATIONS` / `AGES` / `RELIGIONS` / `CHILD_AGES` | — | 選択肢の定義 |
| `relationsFor(sceneId)` | 場面 | その場面に目安がある関係の配列 |
| `getGuide(sceneId, opts)` | 場面・{relation, age, religion, childAge, receivedYen} | 表書き・水引・のし・墨・お札・袱紗・折り返し・金額の目安・注意 |
| `parseYen(text)` | 文字列 | `{ ok, yen }` または `{ ok:false, reason }` |
| `checkAmount(sceneId, yen, guide)` | 場面・金額・目安 | `[{ level:'warn'|'info'|'ok', code, message }]` |
| `toDaiji(yen)` | 整数 | 「金 参萬円」 |
| `billPlan(yen, sceneId)` | 金額・場面 | `[{ bill, count }]`（結婚祝いは枚数を奇数に寄せる） |
| `formatYen(yen)` / `formatRange(min,max)` | 数値 | 「3万円」「5千〜1万円」 |

### 2.2 データ表の方針

- 相場は `SCENES[*].amounts[relation]` に `[min, max]` か、年代別 `{ 20:[..], 30:[..], 40:[..] }` で持つ。
- お返し系（快気祝い・出産内祝い）は `amountMode: 'return'`、お年玉は `amountMode: 'child'` として別計算。
- マナー（表書き・水引など）は場面ごとの定義に持ち、香典・法要のみ宗教で表書き・水引を上書きする。
- 定義に無い関係・年代を指定された場合は、目安を `null` にして画面で「目安なし」と表示する（推測値を出さない）。

### 2.3 金額点検のルール

| code | 条件 | level |
|---|---|---|
| `invalid` | 0以下・1億円以上・整数でない | warn |
| `taboo-digit` | 先頭の数字が4か9（4千・9千・4万・9万…） | warn |
| `even-wedding` | 結婚祝いで万の位が偶数（2万・8万・10万の倍数を除く） | warn |
| `two-wedding` | 結婚祝いで2万円 | info（近年は許容・3枚に分ける提案） |
| `even-funeral` | 香典で万の位が偶数（2万円など） | info |
| `unit` | 千円単位でない（お年玉は500円単位まで可） | info |
| `over` / `under` | 目安の2倍超 / 目安の半分未満 | info |
| `ok` | 上記のいずれにも当たらない | ok |

### 2.4 大字変換

- 4桁ごとに「萬」で区切り、各4桁を「阡・百・拾」で表す。
- 数字は 壱・弐・参・四・伍・六・七・八・九。位の前の「壱」は省略しない（改ざん防止のため）。
- 例: 30,000 → 「金 参萬円」、15,000 → 「金 壱萬伍阡円」、100,000 → 「金 壱拾萬円」。

## 3. 画面設計

- 1画面構成。左（スマホでは上）に入力、右（下）に結果。
- 入力: 場面（optgroup で4グループ）→ 関係 → 年代（ラジオ）→ 宗教（香典・法要のみ）／子の年齢（お年玉のみ）／いただいた金額（お返し系のみ）→ 包む金額（任意）→ お名前（任意・プレビュー用）。
- 結果: ①金額の目安 ②金額の点検 ③包み方（表形式）④中袋の書き方（大字＋コピー）⑤お札の組み合わせ ⑥袋のプレビュー（縦書き）⑦場面ごとの注意。
- 色はトークン化し、`prefers-color-scheme` でダーク対応。警告は色＋「注意」「参考」のラベル文字で区別。

## 4. セキュリティ方針

| 脅威 | 対策 |
|---|---|
| 入力した名前・金額の外部流出 | 通信コードを持たない。CSP `default-src 'none'; connect-src 'none'`。外部フォント・CDN なし |
| 端末内への痕跡 | localStorage / sessionStorage / Cookie を使わない |
| XSS（名前欄からのスクリプト注入） | 動的な DOM 生成は `createElement` + `textContent` のみ。`innerHTML` を使わない。CSP で inline script 不可 |
| 巨大入力による誤動作 | 金額欄 30文字・名前欄 20文字の `maxlength`、エンジン側でも長さと 1億円未満を検査 |
| クリックジャッキング | Vercel/ルートのヘッダ（`X-Frame-Options: SAMEORIGIN`）と CSP `frame-ancestors` は meta では効かないため、配信側ヘッダに委ねる |
| サプライチェーン | 依存パッケージゼロ。`npm audit` で 0 件を確認 |
| フォーム送信 | `<form>` に `action` を持たせず submit を抑止。CSP `form-action 'none'` |

## 5. テスト方針

- `noshi/tests/engine.test.js`: 相場表の網羅（全場面×全関係×全年代で目安が `min <= max`）、金額点検の各ルール、`parseYen` の表記ゆれ、`toDaiji` の境界値、`billPlan` の合計一致。
- `noshi/tests/smoke.mjs`: 実ブラウザで場面切り替え・金額入力・XSS 文字列の名前入力・外部リクエストがゼロであることを確認。
- ルートの `npm test` に `noshi/tests/*.test.js` を含め、CI と同じコマンドで確認できるようにする。
