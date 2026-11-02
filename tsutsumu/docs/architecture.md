# つつむ — 設計書

## 1. システム構成

サーバーなしの静的 Web アプリ。リポジトリ直下の Vercel / GitHub Pages 配信にそのまま載る。

```
tsutsumu/
├─ index.html          画面の骨格（CSP・メタ情報）
├─ src/
│  ├─ engine.js        判断ロジック（純粋関数・DOM 非依存）。ブラウザでは window.Tsutsumu、Node では module.exports
│  ├─ app.js           画面の描画とイベント処理、localStorage への保存
│  └─ styles.css       見た目（ライト / ダーク、慶事 / 弔事のテーマ）
├─ tests/
│  └─ engine.test.mjs  engine.js の単体テスト（node:test、依存パッケージなし）
├─ docs/               要件定義・設計
└─ feedback/           レビュー結果
```

- ES Modules ではなく通常の `<script>` で読み込む。`index.html` をファイルとして直接開いても（`file://`）動かすため。
- 依存パッケージなし。ビルド工程なし。

### データの流れ

```
[選択: 場面・関係・年代・宗教・人数・金額]
        │ (app.js が入力を集める)
        ▼
engine.plan(input) ──► { range, recommended, alternatives, checks, bills, envelope, omotegaki, names, daiji, returnGift, joint }
        │
        ▼
app.js が textContent で描画（innerHTML に利用者の入力を入れない）
```

記録機能:

```
[記録する] → engine.validateRecord() → localStorage["tsutsumu.records.v1"]
[読み込み] → FileReader → engine.parseRecords()（不正な行は捨てる・最大500件） → 保存
[書き出し] → JSON → Blob → ダウンロード
```

## 2. engine.js の公開関数

| 関数 | 役割 |
|---|---|
| `OCCASIONS` / `RELATIONS` / `CHILD_AGES` / `RELIGIONS` | 選択肢の定義（ラベル・慶弔の種別） |
| `relationsFor(occasion)` | 場面で選べる関係の一覧 |
| `sobaRange(occasion, relation)` | 目安の範囲 `[min, max]` |
| `suggestAmount({occasion, relation, age})` | おすすめ金額と代わりの候補 |
| `checkAmount(yen, occasion, range?)` | 金額の点検結果（`ng` / `caution` / `info`） |
| `nearestSafeAmount(yen, occasion)` | 避けるべき金額のとき、近い代わりの金額 |
| `billPlan(yen, occasion)` | お札の内訳・新札か否か・向き |
| `envelope(occasion, yen)` | 水引・色・のし・袋の格 |
| `omotegaki(occasion, religion)` | 表書き・別案・墨の濃さ・注意 |
| `nameGuide(occasion, people)` | 名前の書き方 |
| `toDaiji(yen)` | 中袋の大字表記（例: 30000 → 金参萬圓也） |
| `jointPlan(occasion, people, perPerson)` | 連名の合計額と1人あたりの負担 |
| `returnGift(occasion, yen)` | お返しの要否と目安 |
| `validateRecord(raw)` / `parseRecords(json)` | 記録の検査・取り込み |
| `plan(input)` | 上をまとめて呼ぶ入口 |

## 3. ルールの考え方

- 金額は「包みやすい金額の列」（場面の種類ごと）から選ぶ。
  - 慶事（結婚）: 5千 / 1万 / 2万 / 3万 / 5万 / 7万 / 10万
  - 一般の祝い・お見舞い: 3千 / 5千 / 1万 / 2万 / 3万 / 5万 / 10万
  - 弔事: 3千 / 5千 / 1万 / 3万 / 5万 / 10万（2万は「偶数を避ける」考えから列に入れない）
  - お年玉: 1千 / 2千 / 3千 / 5千 / 1万
- 年代で範囲内の位置を決める（20代=下限、30代=中央、40代以上=上限）→ 列の中で最も近い金額（同距離なら高い方）。
- 4・9 は「死」「苦」を連想させるため、万の位・千の位の枚数が 4 か 9 のときは「避ける」。
- 結婚の偶数（2・6・8万）は「注意」または「参考」（8は末広がりとして好まれることもある）。10万は1束として可。

## 4. セキュリティ方針

| 脅威 | 対策 |
|---|---|
| 入力内容の外部送信・漏えい | 通信を行うコードを持たない。CSP `default-src 'none'; connect-src 'none'`。外部フォント・解析タグなし |
| XSS（記録の名前・メモ、読み込んだ JSON） | DOM 生成は `textContent` / `createElement` のみ。`innerHTML` に利用者由来の値を入れない。CSP で inline script を禁止（`script-src 'self'`） |
| 不正な JSON の読み込み | `parseRecords` で型・長さ・日付・金額範囲・場面キーを検査し、不正な行は捨てる。最大 500 件、ファイルは 1MB まで |
| プロトタイプ汚染 | 取り込み時に既知のキーだけを新しいオブジェクトへ写す（`__proto__` などは無視） |
| 制御文字・なりすまし文字 | 名前・メモから制御文字と双方向制御文字（U+202A–U+202E, U+2066–U+2069）を除去 |
| 意図しない保存 | 既定では保存しない。保存は「記録する」ボタンのみ。全件削除は確認ダイアログつき |
| クリックジャッキング | ルートの `vercel.json` の `X-Frame-Options: SAMEORIGIN` を継承 |
| 秘密情報 | API キー等は使わない。ハードコードする秘密情報なし |

## 5. テスト方針

- `engine.js` の全公開関数を `node --test` で検査（`tsutsumu/tests/engine.test.mjs`）。
- ルートの `npm test` から実行される（ルート `package.json` の test スクリプトに追加）。
- 画面は Playwright による手動スモーク（主要フローの表示・コンソールエラーなし）で確認する。
