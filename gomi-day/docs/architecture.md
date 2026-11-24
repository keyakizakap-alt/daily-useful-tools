# あしたのごみ — 設計書

## 1. 方針

- 既存アプリ（`mail-check/` など）と同じく、ビルド不要・サーバー不要の静的Webアプリにする。
- 計算ロジック（規則の判定・共有・.ics 生成）は DOM に依存しない純粋な関数として `src/rules.js` に分け、Node の標準テストランナーで検証する。
- 画面の処理（`src/app.js`）は、ロジックを呼んで DOM に反映するだけにする。

## 2. 構成

```
gomi-day/
├── index.html        # 入口（src/ の CSS と JS を読み込む）
├── src/
│   ├── rules.js      # 純粋ロジック（ブラウザでは window.GomiRules、Node では module.exports）
│   ├── app.js        # 画面の描画・イベント・localStorage
│   └── styles.css
├── tests/
│   ├── rules.test.mjs    # ロジックの単体テスト
│   └── static.test.mjs   # 危険なAPIを使っていないか・CSPの静的検査
├── docs/             # 要件・設計
└── feedback/         # レビュー結果
```

- `file://` で開いても動くよう、ES Modules ではなく通常のスクリプトとして読み込む（`rules.js` は UMD 形式）。
- ルートの `npm test` に `gomi-day/tests/*.test.mjs` を含める。

## 3. データ構造

```js
// localStorage キー: "gomi-day:v1"
{
  version: 1,
  rules: [
    { id: "r1", name: "燃やすごみ", type: "weekly",  weekdays: [1, 4] },
    { id: "r2", name: "資源ごみ",   type: "nth",     weekdays: [3], nths: [2, 4] },
    { id: "r3", name: "びん・缶",   type: "biweekly", weekdays: [5], anchor: "2026-11-20" }
  ],
  breaks: [ { from: "2026-12-30", to: "2027-01-03" } ]
}
```

- 曜日は 0=日〜6=土。日付は端末のローカル日付の `YYYY-MM-DD` 文字列で持ち、時刻・タイムゾーンのずれを避ける。
- 第n週は「その月の何回目のその曜日か」（`Math.ceil(日 / 7)`）で判定する。
- 隔週は、基準日を含む週（日曜始まり）からの週数が偶数の週に当たる。

## 4. 主な関数（`src/rules.js`）

| 関数 | 役割 |
|---|---|
| `parseDate` / `formatDate` / `addDays` | ローカル日付の変換 |
| `matchesRule(rule, date)` | 規則がその日に当たるか |
| `itemsOn(config, date)` | その日に出すごみの名前一覧（お休み期間を除外） |
| `upcoming(config, from, days)` | 指定日数分の予定 |
| `describeRule(rule)` | 「第2・第4 水曜」などの説明文 |
| `sanitizeConfig(obj)` | 外部から来た設定を検査し、安全な新しいオブジェクトだけを返す。不正なら例外 |
| `encodeShare` / `decodeShare` | 設定 ⇄ URL用文字列（JSON → UTF-8 → base64url） |
| `toICS(config, from, days, options)` | .ics 文字列（終日予定、任意で前夜20時の通知） |

## 5. 画面

1. 「今日」「あした」の2枚（最上部、最も大きい）
2. これから2週間
3. 収集の規則（一覧＋追加フォーム）
4. お休み期間（年末年始など）
5. 共有と書き出し
6. 注意書き（自治体の公式情報を優先すること、祝日の扱い）

## 6. セキュリティ方針

| 脅威 | 対策 |
|---|---|
| 共有URLの細工（XSS・巨大データ・型の混入・プロトタイプ汚染） | 長さ上限 → base64url の文字種検査 → JSON.parse → `sanitizeConfig` で型・範囲・件数・文字数を検査し、許可した項目だけで新しいオブジェクトを作る |
| 利用者入力の HTML 解釈 | `innerHTML` / `eval` / `new Function` を使わず、`textContent` と `createElement` で描画する（`tests/static.test.mjs` で検査） |
| 外部スクリプトの混入 | CSP `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'` 。外部の CDN・フォントを使わない |
| .ics の改行・区切り文字による項目の注入 | RFC 5545 に従い `\` `;` `,` 改行をエスケープし、75オクテットで折り返す |
| 共有を開いただけで設定が消える | 読み込み前に確認を表示。読み込み後は URL のハッシュを消す |
| 機密情報 | 扱わない。APIキーも不要 |
| 保存データの破損 | localStorage の読み書きは try/catch で囲み、壊れたデータは無視して空の状態で起動する |

## 7. 技術選定の理由

- フレームワークなし: 画面が1枚で状態も小さく、依存を増やすとサプライチェーンのリスクと保守費が増えるだけのため。
- 通知を .ics に任せる: Web Push はサーバーと購読管理が必要で、MVPの価値検証には過剰。OS標準のカレンダー通知は確実に届く。
