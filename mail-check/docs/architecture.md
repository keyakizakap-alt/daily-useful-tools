# 設計書 — 「おくるまえに」

- 関連文書: [requirements.md](./requirements.md)

## 1. 設計方針

| 方針 | 理由 |
|---|---|
| 完全ローカル・通信ゼロ | 本文は業務機密。外に出さないこと自体が製品価値（S1 要求） |
| 依存パッケージゼロ | サプライチェーン経路を作らない（S2 要求）。`npm audit` の指摘対象を構造的に持たない |
| 判定ロジックは純粋関数 | UI なしで単体テストできる。ルール追加が UI に波及しない（A1 / A2 要求） |
| ビルド不要 | `file://` で開けば動く。既存収録ツール（`index.html` / `weather/`）と同じ配布形態 |
| ルールはデータ、判定は共通処理 | ルール追加＝テーブルへの1行追加 |

## 2. システム構成

```
mail-check/                 ← このツールだけで完結するディレクトリ
├── index.html              画面（マークアップのみ。インラインスクリプトを持たない）
├── styles.css              スタイル（ライト／ダークのトークン定義）
├── engine.js               点検エンジン（DOM 非依存の純粋関数群）★テスト対象
├── app.js                  DOM 層（入出力・描画・保存。engine.js を呼ぶだけ）
├── package.json            開発用スクリプト（依存0件）
├── vercel.json             このツール専用の Vercel プロジェクト設定
├── .vercelignore           配信しないもの（docs / feedback / tests / package*.json）
├── docs/                   要件定義・設計・PR 記録
├── feedback/               レビューとトリアージの記録
└── tests/
    ├── engine.test.js      単体テスト（node:test、依存ゼロ）
    └── smoke.mjs           ブラウザ結合スモーク（playwright が使える場合のみ）
```

リポジトリ直下には何も置かない。既存アプリ（`index.html` = こいのかたち、`weather/` = そらならべ、
`gcp-cert/` = くもみち）と混ざらないよう、**1ツール1ディレクトリで自己完結**させる（`gcp-cert/` と同じ方式）。

データの流れ（すべてブラウザ内・単方向）:

```
[textarea/入力] → app.js → engine.check(text, options) → findings[]
                                    ↓
                     app.js が escapeHtml して描画（ハイライト／一覧）
                                    ↓
              [置換ボタン] → engine.applyFixes(text, findings) → textarea へ戻す
```

ネットワーク境界は存在しない。`fetch` / `XMLHttpRequest` / `WebSocket` / 外部 `src` を一切使わない。

## 3. モジュール設計

### 3.1 `engine.js`（DOM 非依存）

ブラウザでは `<script src="engine.js">` としてグローバル `OkuruMae` を公開し、Node からは
`require('../engine.js')` で同じオブジェクトを読む UMD 形式。二重実装を作らない。

公開 API:

| 関数 | 入出力 | 備考 |
|---|---|---|
| `check(text, options)` | `{ findings, stats, score }` | 純粋関数。`options = { subject, audience, ignored }` |
| `applyFix(text, finding)` | `string` | 1件適用 |
| `applyFixes(text, findings)` | `string` | 後方から適用して位置ずれを防ぐ |
| `buildSegments(text, findings)` | `Array<{text, findingIds}>` | ハイライト描画用の分割結果（純粋） |
| `escapeHtml(s)` | `string` | `& < > " '` を実体参照化 |
| `SPAN_RULES` / `CATEGORIES` / `SEVERITIES` | 定数 | ルール表の公開（テスト・UI 双方が参照） |

`finding` の形:

```js
{
  id: 'f12',            // 描画・無視機能で使う安定 ID
  ruleId: 'keigo.ryokai',
  category: 'keigo',
  severity: '高' | '中' | '低',
  start: 12, end: 18,   // 文書全体チェックでは null
  matched: '了解しました',
  message: '社外・上司には「承知しました」を使う',
  why: '「了解」は対等または下位への応答とされるため',
  suggestion: '承知しました' // null のこともある
}
```

### 3.2 判定の二層構造

1. **スパンルール**（`SPAN_RULES`）: 正規表現でテキスト内の位置を特定する。
   - `pattern`（`g` フラグ必須）/ `category` / `severity` / `message` / `why`
   - `fix`: 置換文字列、または `(match, groups) => string`（`null` を返すと候補なし）
   - `audiences`: 適用する送信相手の配列（既定は全員）
   - `skipInQuote`: 引用行を除外するか（既定 true）
2. **文書チェック**（`DOCUMENT_CHECKS`）: 本文全体を見る関数群。宛名・結び・署名の有無、
   件名の妥当性、敬体と常体の混在、「させていただく」の多用、緩衝表現の不足など。
   位置を持たない指摘は `start: null` とし、一覧のみに表示する。

### 3.3 重なりの解消

異なるルールが重なる範囲に当たった場合、**重要度（高 > 中 > 低）→ 範囲が狭い順 → 開始位置の早い順**で
優先し、重なる後続の指摘を落とす。これによりハイライトの範囲が一意に決まる。

「範囲が狭い順」は後から入れた規則である。当初は「広い順」だったため、行全体を範囲とする
`structure.longLine` が同じ行の敬語・表記の指摘をすべて覆い隠していた（`feedback/review_report.md` R1）。
あわせて、行や文書全体を対象とする助言的な指摘は**位置を持たせず**、行番号をメッセージに入れる方針とした。

### 3.5 位置の扱い

- 引用行の除去（`stripQuotes`）は、引用行を**同じ文字数の空白**に置き換える。文字数が変わらないため、
  引用除去後の文字列で見つけた位置をそのまま原文の位置として使える（R2）。
- 「無視」の同一性（`findingKey`）は `ruleId + 一致文字列` で定義し、**絶対位置を含めない**。
  位置を含めると、本文を1文字直しただけで無視が解除されてしまう（R3）。
- 正規表現に後読み（`(?<!…)`）を使わない。未対応のブラウザでは正規表現リテラルの評価が
  構文エラーになり、`engine.js` 全体が読み込めなくなるため（R4）。前後の文字は `validate` で見る。

### 3.4 `app.js`（DOM 層）

- 入力は `input` イベント＋300ms のデバウンスで `check` を呼ぶ（FR-01）
- 描画は `escapeHtml` を通した文字列のみを `innerHTML` に渡す。`buildSegments` の出力以外の
  経路で利用者入力を HTML として扱わない（NFR-04）
- 「無視」は指摘の `ruleId + matched + start` をキーに Set で保持し、再点検時に除外
- 下書き保存は既定 OFF。ON のときのみ `localStorage` に `subject` / `body` を書き、
  OFF に戻した時点でキーを削除する（FR-11）

## 4. セキュリティ方針

| 観点 | 対策 |
|---|---|
| 本文の外部送信 | 送信経路を実装しない。CSP で `connect-src 'none'` / `form-action 'none'` を宣言 |
| XSS | 利用者入力は `textContent` か `escapeHtml` 経由のみ。`innerHTML` へ渡す文字列は自前生成に限定 |
| サプライチェーン | 依存パッケージ 0。外部フォント・CDN を使わない（システムフォントのみ） |
| クリックジャッキング等 | 静的ページで操作対象となる副作用がない。リポジトリの `vercel.json` で `X-Content-Type-Options` / `Referrer-Policy` を付与 |
| 秘密情報のハードコード | ソースに鍵・トークンを持たない（そもそも通信しない） |
| 端末に残るデータ | 保存は既定 OFF。ON 時も `localStorage` のみで、解除時に削除 |
| 正規表現 DoS | すべてのパターンでネストした量指定子を使わず、繰り返しの上限を明示（`{1,8}` 等） |
| 誤検出による害 | 「無視」機能と重要度表示で、利用者が最終判断を下せるようにする |

CSP（`mail-check/index.html` の `<meta http-equiv="Content-Security-Policy">`）:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none';
font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'
```

`file://` で開いた場合、ブラウザは `'self'` を同一ディレクトリの `file:` リソースとして扱わない
ことがある。そのため `script-src`/`style-src` には `'self'` のみを指定しつつ、**インラインの
スクリプト・スタイルを一切持たない構成**にして、`http(s)` 配信時に最も強い制限がかかるようにする。
`file://` での動作は Step 4 のブラウザスモークテストで確認する。

## 5. テスト方針

| 層 | 手段 | 対象 |
|---|---|---|
| 単体 | `node --test`（Node 標準、依存ゼロ） | `engine.js` の全公開 API・分類ごとの代表ルール・誤検出コーパス・性能 |
| 結合（ブラウザ） | playwright（グローバル導入がある場合のみ実行） | `file://` で開いて入力→指摘表示→置換→コピーまでの経路、CSP 違反やコンソールエラーがないこと |
| 静的解析 | `eslint`（グローバル導入がある場合）＋ `node --check` | 構文・未使用変数・危険な API の不使用 |
| 依存監査 | `npm audit` | 依存ゼロであることの確認 |

## 6. 判断の記録（なぜそうしなかったか）

- **形態素解析ライブラリを使わない**: 辞書が数 MB になり「開くだけ」が崩れる。MVP はルールベースで、
  誤検出は「無視」と重要度で吸収する。
- **生成 AI による自動リライトを入れない**: 通信が発生し製品の第一価値（機密を出さない）と矛盾する。
- **`type="module"` を使わない**: `file://` では CORS によりモジュール読み込みが失敗するため、
  クラシックスクリプト＋UMD を選択した。
- **点数を大きく見せない**: D1 の指摘どおり、点数は補助情報。主役は指摘一覧。
