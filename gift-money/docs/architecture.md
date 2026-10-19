# 設計書 — 「つつみかた」

- 日付: 2026-10-19
- 関連文書: [requirements.md](./requirements.md)

## 1. システム構成

ビルド不要・依存ゼロの静的 Web アプリ。サーバーは静的配信のみで、処理はすべてブラウザ内で完結する。

```
gift-money/
├── index.html          … 画面の骨組み（エントリポイント。src/ を相対パスで読む）
├── src/
│   ├── engine.js       … 判定エンジン（DOM 非依存の純粋関数 + 相場データ）
│   ├── app.js          … DOM 層（入力の受け取りと描画のみ）
│   └── styles.css      … スタイル（外部フォントなし）
├── tests/
│   ├── engine.test.js  … 判定エンジンの単体テスト（node:test）
│   ├── static.test.js  … 静的解析（危険な API・通信コード・秘密情報の混入検査）
│   └── smoke.mjs       … ブラウザ結合テスト（playwright。無い環境ではスキップ）
├── docs/ feedback/
├── package.json        … npm scripts のみ（dependencies なし）
├── vercel.json / .vercelignore … 単独プロジェクトとして配信する場合の設定
```

```
 [利用者の入力] ──► app.js（値の取得・型変換） ──► engine.js（純粋関数）
                                                      │
 [画面] ◄── app.js（textContent / createElement で描画）◄┘
```

- **engine.js** は UMD 形式。ブラウザでは `<script src>` でグローバル `Tsutsumi` に、Node では `require()` で読める。
- **app.js** は engine の戻り値（プレーンなオブジェクト）を DOM に描画するだけ。判定ロジックを持たない。

## 2. データモデル

### 2.1 場面（EVENTS）

```js
{
  id: 'wedding',
  label: '結婚式に出席',
  kind: 'celebration' | 'condolence' | 'sympathy',
  evenRule: 'strict' | 'soft' | 'none',   // 偶数の扱い（慶事は strict）
  relationPrompt: '新郎新婦は、あなたの',
  modifier: 'age' | 'school',            // 推奨額の選び方
  relations: [{ id, label, range: [min, max] | null, note? }],
  manners: { mizuhiki, omote[], fukusa, bills, ink, timing, notes[] },
  religious: true                        // 宗派で表書きを出し分けるか
}
```

### 2.2 推奨額の算出

1. 関係の `range` に含まれる「推奨に使う額」（3千・5千・1万・3万・5万・10万）を候補にする。
   2万・7万など判断が割れる額は推奨候補に入れない（入力すれば判定はする）。
2. 年代（20代／30代／40代以上）または進学先（小／中高／大学）で、候補の 下端／中央／上端 を選ぶ。

### 2.3 金額判定（checkAmount）

戻り値は `{ level: 'error'|'warn'|'info'|'ok', code, message }` の配列。

| code | level | 条件 |
|---|---|---|
| `invalid` | error | 整数でない・1円未満 |
| `too-large` | error | 1億円以上（大字変換の対象外） |
| `fraction` | warn | 千円未満の端数がある |
| `imikazu` | warn | 千円単位の数字に 4・9 を含む（死・苦） |
| `even` | warn | 慶事（strict）で、1万円単位（1万円未満は千円単位）が偶数（2・8 を除く） |
| `even-pair` | info | 慶事で 2万円（ペア）／ 8万円（末広がり） |
| `even-soft` | info | 弔事・お見舞いで偶数 |
| `below` | warn / info | 相場の下限を下回る（結婚式出席は warn） |
| `above` | info | 相場の上限の 1.5 倍を超える（弔事は香典返しの負担に言及） |
| `ok` | ok | 上記に何も当たらない |

### 2.4 その他の純粋関数

| 関数 | 役割 |
|---|---|
| `recommend(eventId, relationId, modifierValue)` | 推奨額・幅・関係の注記を返す |
| `getManners(eventId, religionId)` | 包み方（表書きは宗派で出し分け） |
| `bills(amount, eventId)` | お札の組み合わせ（`[{ value, count }]`） |
| `toDaiji(amount)` / `toKansuji(amount)` | 大字（壱萬・参阡…）／漢数字（一万三千） |
| `envelopeText(amount)` | 中袋表の文言（`金 参萬圓` など） |
| `addressToVertical(text)` | 住所の算用数字（半角・全角）を漢数字に、ハイフンを長音符に |
| `groupGift(perPerson, people, eventId)` | 連名の合計・判定・無難な合計の提案 |

## 3. セキュリティ方針

| 脅威 | 対策 |
|---|---|
| 入力由来の XSS | DOM への出力は `textContent` / `createElement` のみ。`innerHTML`・`insertAdjacentHTML`・`document.write`・`eval`・`new Function` を使わない（`tests/static.test.js` で機械的に検査） |
| 個人情報（氏名・住所）の流出 | 通信コードを持たない（`fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` なし。静的解析で検査）。CSP `connect-src 'none'` |
| 個人情報の端末内残留 | `localStorage` / `sessionStorage` / `IndexedDB` / Cookie を使わない（静的解析で検査）。入力欄に `autocomplete="off"` |
| 外部スクリプトの改ざん | CDN・外部フォントを使わない。CSP `default-src 'none'; script-src 'self'; style-src 'self'` |
| クリックジャッキング | 配信時ヘッダ `X-Frame-Options: SAMEORIGIN`（直下 `vercel.json`）／ CSP `frame-ancestors` は meta では効かないためヘッダで担保 |
| フォーム送信による漏えい | `<form>` を使わず、CSP `form-action 'none'` |
| 異常値による停止 | 金額は `Number` 変換後に整数・範囲を検証。人数は 1〜50 に制限。不正値は error として表示し例外を投げない |
| 依存パッケージの脆弱性 | `dependencies` / `devDependencies` なし。`npm audit` で検証 |
| 機密情報のハードコード | API キー等を一切持たない（静的解析で代表的なパターンを検査） |

## 4. UI 設計

- 1 画面・上から順に「① 目安を調べる」「② 金額を確かめる」「③ 中袋の書き方」「④ 連名で包む」。
- ① の推奨額を選ぶと、② ③ の金額欄に自動で入る（入力し直しも可）。
- 結果領域は `aria-live="polite"` で更新を読み上げる。
- 中袋見本は CSS の `writing-mode: vertical-rl` で縦書き表示。数字は漢数字化して縦中横を避ける。
- 判定のレベルは色だけでなく、ラベル（「注意」「確認」「問題なし」）でも伝える。

## 5. テスト方針

| 種別 | 内容 | 実行 |
|---|---|---|
| 単体 | 推奨額（全場面×全関係×全年代で忌み数・慶事偶数が出ない）、判定コード、大字・漢数字、お札、住所変換、連名 | `npm test` |
| 静的解析 | 構文チェック、危険 API・通信 API・ストレージ API・秘密情報パターンの不在 | `npm test`（static.test.js）／ `npm run lint` |
| 結合 | 実ブラウザで入力 → 表示、XSS 文字列が実行されない、通信 0 件、コンソールエラー 0 件 | `npm run smoke` |
| 依存 | `npm audit` | `npm run audit` |
