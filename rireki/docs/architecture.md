# 設計書 — 「としめくり」

- 関連文書: [requirements.md](./requirements.md)

## 1. 設計方針

| 方針 | 理由 |
|---|---|
| 完全ローカル・通信ゼロ | 生年月日・学校名は個人情報。外に出さないこと自体が安全策（N1） |
| 依存パッケージゼロ・ビルド不要 | 供給網リスクを持たない（N2）。既存の `mail-check/` と同じ配布形態 |
| 計算は純粋関数（`src/engine.js`） | UI なしで境界値をテストできる（N6） |
| 日付は「年・月・日」の整数で扱う | `Date` のタイムゾーン・夏時間の影響を受けない。比較は `y*10000+m*100+d` の整数で行う |
| 元号はデータ表、判定は共通処理 | 将来の改元は表への1行追加で済む |

## 2. システム構成

```
rireki/                     ← このアプリだけで完結するディレクトリ
├── index.html              画面（マークアップのみ。インラインスクリプトなし）
├── src/
│   ├── engine.js           計算エンジン（DOM 非依存・UMD）★テスト対象
│   ├── app.js              DOM 層（入力の読み取り・描画・コピー）
│   └── styles.css          スタイル（ライト／ダークのトークン）
├── tests/
│   ├── engine.test.mjs     単体テスト（node:test、依存ゼロ）
│   └── static.test.mjs     静的検査（CSP・外部通信・innerHTML 不使用・秘密情報）
├── docs/                   要件定義・設計
├── feedback/               レビュー記録
└── PR_DESCRIPTION.md       PR 説明
```

データの流れ（すべてブラウザ内・単方向）:

```
[フォーム入力] → app.js が値を読む → engine.buildTimeline(input) → { rows, age, errors }
                                                 ↓
                         app.js が textContent で表に描画 / engine.formatTimelineText でコピー文字列を作る
```

## 3. モジュール設計（`src/engine.js`）

ブラウザでは `<script src="src/engine.js">` でグローバル `Toshimekuri` を公開し、Node からは
`require` で同じオブジェクトを読む UMD 形式。

| 関数 | 入出力 | 備考 |
|---|---|---|
| `parseDate(str)` | `'2001-04-02'` → `{y,m,d}` / `null` | 実在しない日付は `null` |
| `toWareki(y, m, d)` | `{ era, eraYear, label }` | `label` 例: `令和元年`。範囲外は `RangeError` |
| `toSeireki(era, eraYear)` | 西暦年 | 元号の期間外は `RangeError` |
| `formatYm(y, m, mode)` | `'令和7年 3月'` / `'2025年 3月'` | 月初日（4月入学は4/1、3月卒業は3/31）で元号を判定 |
| `elementaryEntryYear(birth)` | 西暦年 | 1/1〜4/1生まれは `誕生年+6`、それ以外は `+7` |
| `ageOn(birth, ref)` | 満年齢 | 2/29生まれは平年3/1に加齢 |
| `buildTimeline(input)` | `{ rows, age, errors }` | 下記 |
| `formatTimelineText(rows, mode)` | タブ区切り文字列 | コピー用 |

`input` の形:

```js
{
  birth: '2003-05-10',          // 必須
  refDate: '2026-11-23',        // 記入日（省略時は呼び出し側で今日を渡す）
  path: 'univ4',                // juniorHigh | high | kosen | junior | vocational | univ4 | univ6 | master | doctor
  vocationalYears: 2,           // path=vocational のとき 1〜4
  roninYears: 0,                // 高校卒業〜進学の空白年数 0〜5
  extend: { high: 0, post: 0, grad: 0 }, // 在学延長 0〜5
  includeElementary: false,
  schools: { elementary: '', juniorHigh: '', high: '', post: '', master: '', doctor: '' }
}
```

`row` の形: `{ y, m, school, event: '入学'|'卒業'|'修了', status: 'done'|'expected', text }`
（`text` は「卒業見込み」等を含む最終表記）。

### 学年計算の規則

- 小学校入学年 `E = elementaryEntryYear(birth)`（年齢計算ニ関スル法律により、4月1日生まれは3月31日に満6歳となり、その年に入学）
- 小学校: E年4月入学 → E+6年3月卒業。中学校: E+6年4月 → E+9年3月。
- 高校（3年＋延長）または高専（5年＋延長）。
- 高校後の学校は「高校卒業年＋浪人年数」の4月入学。大学院は直前の卒業年の4月入学（空白なし）。
- 卒業・修了は3月、入学は4月で固定（9月入学などはスコープ外）。

## 4. 画面設計

1画面・上から順に「入力 → 結果 → 年号変換」。

1. 基本入力: 生年月日（`type=date`）、最終学歴（`select`）、記入日（`type=date`、初期値=今日）
2. 詳しい条件（`<details>`、初期は閉じる）: 浪人年数、在学延長年数、専門学校の年数、学校名、小学校を含めるか
3. 結果: 満年齢・早生まれ表示、年表（`<table>`：年／月／学歴）、和暦／西暦切り替え、コピーボタン
4. 和暦⇔西暦の変換欄
- 入力のたびに即時再計算（送信ボタンなし）。エラーは入力欄の下に `role="alert"` で日本語表示。

## 5. セキュリティ方針

| 脅威 | 対策 |
|---|---|
| 個人情報の外部送信 | 通信 API（`fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`）を使わない。CSP `connect-src 'none'`。静的テストで検査 |
| 入力値の保存・残存 | 入力値は保存しない。保存するのは表示テーマ（`light`/`dark`/`system`）のみ |
| XSS（学校名の自由入力） | DOM 描画は `textContent` と `createElement` のみ。`innerHTML`/`eval`/`new Function` を使わない（静的テストで検査）。CSP `script-src 'self'` でインラインスクリプトを禁止 |
| 異常な入力値 | 文字数上限（60）、数値は整数かつ範囲内にクランプ、日付は厳密に検証 |
| 供給網 | 依存パッケージ0件。外部 CDN・フォントを読まない |
| 秘密情報 | API キー等を持たない。静的テストで秘密情報らしき文字列が無いことを検査 |
| クリックジャッキング等 | 配信時はリポジトリ直下 `vercel.json` の共通ヘッダー（`X-Frame-Options: SAMEORIGIN`、`nosniff` 等）を使う |

## 6. テスト方針

- `tests/engine.test.mjs`: 早生まれ境界（4/1・4/2・1/1・12/31）、改元境界（1989/1/7・1/8、2019/4/30・5/1、2019年4月・5月）、元年表記、満年齢（誕生日前日・当日・2/29）、学歴パターン全9種、浪人・延長、見込み表記、入力エラー、コピー文字列
- `tests/static.test.mjs`: CSP の存在、外部 URL・通信 API・`innerHTML` の不使用、秘密情報らしき文字列が無いこと
- ルートの `npm test` から実行する
