# もしもしガード 設計ドキュメント

## 1. 画面構成

本ツールは4つのHTMLページから構成される、複数ページ構成の静的サイトとする（SPA化はせず、ページ遷移はブラウザ標準の遷移を用いる。データはlocalStorage経由で共有するためページをまたいでも保持される）。

```
index.html (ホーム画面)
  │
  ├─ [電話中チェックを始める] → check.html (チェック画面)
  │                                   │
  │                                   └─ [チェックを終了して保存] → 保存後 index.html へ戻る
  │
  ├─ [チェック履歴を見る] → history.html (履歴一覧画面)
  │                              └─ [詳細を見る] → 詳細表示（同一ページ内モーダル/展開）
  │                              └─ [印刷する] → ブラウザ印刷ダイアログ (window.print)
  │
  └─ [家族の連絡先を設定] → settings.html (設定画面)
```

### 1.1 ホーム画面（index.html）

- 画面上部: アプリ名・簡単な説明
- 中央: 「電話中チェックを始める」大型ボタン（最も目立たせる）
- 最優先の緊急連絡先を常時カード表示（登録がなければ「設定」への誘導を表示）
- 下部: 「チェック履歴を見る」「設定」への導線ボタン

### 1.2 チェック画面（check.html）

- 画面最上部: 現在の危険度スコア・判定レベル（低/中/高）をゲージ・色付きバナーで常時表示（スクロールしても追従、position: sticky）
- 判定レベルに応じた「次の行動」メッセージを大きな文字で表示
- カテゴリ別の要注意フレーズボタン一覧（アコーディオンまたはカテゴリ見出し付きリストで表示、選択状態を色反転で表現）
- 通話メモ入力欄（相手の名前・電話番号・要求内容・メモ、入力毎に自動保存）
- 「高」判定時は緊急連絡先ボタン（tel:リンク）を画面内に大きく表示
- 「チェックを終了して保存」ボタンで履歴に保存しホームへ戻る／「保存せず終了」も選択可能

### 1.3 履歴一覧画面（history.html）

- 過去のチェックセッションを新しい順に一覧表示（日時・判定レベル・スコアをカード形式で表示）
- 各カードをクリックすると詳細（選択したフレーズ全部・メモ全文・相手情報）を展開表示
- 「印刷する」ボタンで印刷用スタイルに切り替えて `window.print()` を呼び出す
- 各履歴に「削除」ボタン（確認ダイアログあり）

### 1.4 設定画面（settings.html）

- 家族の緊急連絡先の登録フォーム（名前・続柄・電話番号・最優先フラグ）
- 登録済み連絡先の一覧・編集・削除
- （任意）文字サイズ設定

## 2. データモデル

すべてJSONとして `localStorage` に文字列化して保存する。キー名は他アプリとの衝突を避けるため `moshimoshiGuard.` プレフィックスを付与する。

### 2.1 PhraseDefinition（要注意フレーズ定義、静的データ／`src/phrases.js`にハードコード）

```js
{
  id: "atm_visit",              // string, 一意なID
  category: "money",             // "money" | "personalInfo" | "urgency" | "impersonation" | "refund"
  text: "ATM・コンビニのATMに行くように言われた", // ボタン表示文言
  weight: 5,                     // number, 1〜5の危険度重み
  critical: true                 // boolean, trueなら単独選択で自動的に危険度「高」
}
```

初期データとして以下17件程度を `src/phrases.js` に定義する（カテゴリ・重み・critical指定は実装時にこの表を基準とする）。

| カテゴリ | 文言例 | 重み | critical |
|---|---|---|---|
| money | ATM・コンビニのATMに行くように言われた | 5 | true |
| money | コンビニでプリペイドカード・電子マネーを買うように言われた | 5 | true |
| money | 現金を自宅まで取りに行く、または宅配便で送るように言われた | 5 | true |
| money | 指定された口座にお金を振り込むように言われた | 4 | false |
| personalInfo | キャッシュカードの暗証番号を聞かれた | 5 | true |
| personalInfo | キャッシュカードや通帳を渡す・預けるように言われた | 5 | true |
| personalInfo | マイナンバーや保険証番号を聞かれた | 3 | false |
| urgency | 「今すぐ」「今日中に」などと急がされた | 3 | false |
| urgency | 「誰にも言わないで」「家族には内緒で」と言われた | 4 | false |
| urgency | 「もう時間がない」などと焦らされた | 3 | false |
| impersonation | 電話番号（携帯・自宅）が変わったと言われた | 3 | false |
| impersonation | 息子・孫・親族を名乗るが、こちらから名前を聞くまで名乗らない | 3 | false |
| impersonation | 警察官・銀行員・市役所職員などを名乗っている | 2 | false |
| impersonation | 一度電話を切って、指定された番号にかけ直すように言われた | 3 | false |
| refund | 医療費や税金の還付金がある、手続きが必要と言われた | 4 | false |
| refund | 保険料や年金の払い戻しがあると言われた | 4 | false |
| refund | 懸賞・宝くじ・保険などに当選したと言われた | 3 | false |

### 2.2 Contact（緊急連絡先）

```js
{
  id: "c_1699999999999",  // string, 生成時タイムスタンプ等によるID
  name: "長男 太郎",       // string
  relation: "息子",        // string（任意）
  phone: "090-1234-5678", // string
  isPrimary: true          // boolean, 最優先連絡先か
}
```

保存先: `localStorage["moshimoshiGuard.contacts"]` = `Contact[]` のJSON文字列

### 2.3 CheckSession（1回の通話チェック記録）

```js
{
  id: "s_1699999999999",
  startedAt: "2026-08-09T10:00:00.000+09:00", // ISO8601
  finishedAt: "2026-08-09T10:07:32.000+09:00", // null なら進行中
  callerName: "",          // 相手が名乗った名前
  callerPhone: "",         // 相手の電話番号
  requestContent: "",      // 要求内容の自由記述
  memo: "",                // その他メモ
  selectedPhraseIds: ["atm_visit", "urgency_secret"], // 選択済みフレーズID配列
  score: 9,                 // 合計スコア
  level: "high"              // "low" | "mid" | "high"
}
```

- 保存先（確定済み履歴）: `localStorage["moshimoshiGuard.sessions"]` = `CheckSession[]` のJSON文字列
- 保存先（進行中セッション、ページリロード対策）: `localStorage["moshimoshiGuard.currentSession"]` = `CheckSession | null`

## 3. 主要アルゴリズム・ロジック（`src/` 内の純粋関数として実装）

### 3.1 `src/scoring.js`

```js
// 選択されたフレーズIDから合計スコアを算出する純粋関数
export function calcScore(selectedPhraseIds, phrases) { ... } // -> number

// スコアとクリティカルフラグから危険度レベルを判定する純粋関数
export function calcLevel(selectedPhraseIds, phrases) { ... } // -> "low" | "mid" | "high"

// 危険度レベルに応じた「次の行動」メッセージを返す純粋関数
export function nextActionMessage(level) { ... } // -> string
```

判定ロジック:

1. `selectedPhraseIds` の中に `critical: true` のフレーズが1件でも含まれる場合、レベルは無条件で `"high"` とする。
2. それ以外の場合、`score = 選択されたフレーズのweightの合計` を計算し、以下の閾値で判定する。
   - `score < 5` → `"low"`
   - `5 <= score < 10` → `"mid"`
   - `score >= 10` → `"high"`

次の行動メッセージ（`nextActionMessage`が返す文言、UI側で表示）:

- `low`: 「今のところ大きな危険は見られません。引き続き注意しながら会話を続けましょう。」
- `mid`: 「注意が必要です。『家族に確認してからかけ直します』と伝えて、一度電話を切りましょう。」
- `high`: 「危険度が非常に高い通話です。今すぐ電話を切ってください。折り返さず、下の緊急連絡先へすぐ連絡しましょう。」

### 3.2 `src/session.js`

```js
// 新規セッションを生成する純粋関数（idやstartedAtは引数として渡し、内部でnew Date()等は呼ばない設計とし、テスト容易性を確保する）
export function createSession({ id, startedAt }) { ... } // -> CheckSession

// フレーズ選択のトグルを行い、スコア・レベルを再計算した新しいセッションオブジェクトを返す純粋関数
export function togglePhrase(session, phraseId, phrases) { ... } // -> CheckSession

// メモ系フィールドを更新した新しいセッションオブジェクトを返す純粋関数
export function updateSessionField(session, field, value) { ... } // -> CheckSession

// セッションを終了状態にする純粋関数
export function finishSession(session, { finishedAt }) { ... } // -> CheckSession
```

### 3.3 `src/contacts.js`

```js
// 連絡先の簡易バリデーション（名前・電話番号必須など）
export function validateContact(contact) { ... } // -> { valid: boolean, errors: string[] }

// 複数の連絡先の中から最優先連絡先を1件返す純粋関数
export function pickPrimaryContact(contacts) { ... } // -> Contact | null

// isPrimaryフラグの整合性を保つ（新たに1件をprimaryにしたら他は解除）純粋関数
export function setPrimaryContact(contacts, contactId) { ... } // -> Contact[]
```

### 3.4 `src/format.js`

```js
// ISO8601文字列を「2026年8月9日 10:00」のような日本語表記に変換する純粋関数
export function formatDateTimeJa(isoString) { ... } // -> string

// 電話番号表示用の簡易整形（すでに整形済み文字列をそのまま返す想定、将来拡張用）
export function formatPhone(phone) { ... } // -> string
```

### 3.5 `src/storage.js`

`localStorage` はNode.js環境に存在しないグローバルオブジェクトであるため、テスト容易性を確保するために「ストレージ実装（`getItem`/`setItem`を持つオブジェクト）を引数として受け取る」設計とし、ブラウザ実行時のみデフォルト値として `window.localStorage` を使用する。

```js
const STORAGE_KEYS = {
  contacts: "moshimoshiGuard.contacts",
  sessions: "moshimoshiGuard.sessions",
  currentSession: "moshimoshiGuard.currentSession",
};

// storeにはlocalStorage互換オブジェクト（getItem/setItemを持つ）を渡す。省略時はブラウザのwindow.localStorageを使用する。
export function loadContacts(store = getDefaultStore()) { ... } // -> Contact[]
export function saveContacts(contacts, store = getDefaultStore()) { ... } // -> void
export function loadSessions(store = getDefaultStore()) { ... } // -> CheckSession[]
export function saveSessions(sessions, store = getDefaultStore()) { ... } // -> void
export function loadCurrentSession(store = getDefaultStore()) { ... } // -> CheckSession | null
export function saveCurrentSession(session, store = getDefaultStore()) { ... } // -> void
export function clearCurrentSession(store = getDefaultStore()) { ... } // -> void
```

JSON parseに失敗した場合や未保存の場合は、安全なデフォルト値（空配列やnull）を返すようにし、例外でアプリが停止しないようにする。

## 4. ファイル構成

```
apps/moshimoshi-guard/
├── index.html            # ホーム画面
├── check.html             # 通話中チェック画面
├── history.html            # チェック履歴一覧画面
├── settings.html            # 設定画面（家族連絡先）
├── css/
│   └── style.css            # 共通スタイル（大きな文字・高コントラスト・印刷用スタイル含む）
├── src/                     # ロジック層（純粋関数、DOM非依存）
│   ├── phrases.js             # 要注意フレーズの定義データ・取得関数
│   ├── scoring.js              # スコア計算・危険度判定ロジック
│   ├── session.js               # CheckSessionの生成・更新ロジック
│   ├── contacts.js               # 連絡先のバリデーション・整形ロジック
│   ├── storage.js                 # localStorage読み書き（DI可能なラッパー）
│   └── format.js                   # 日時等のフォーマットユーティリティ
├── js/                      # 画面ごとのDOM結線コード（ロジックをsrc/から呼び出す）
│   ├── app-home.js
│   ├── app-check.js
│   ├── app-history.js
│   └── app-settings.js
├── tests/                   # node:testによるユニットテスト
│   ├── scoring.test.js
│   ├── session.test.js
│   ├── contacts.test.js
│   ├── format.test.js
│   └── storage.test.js
└── docs/
    ├── requirements.md
    ├── design.md
    └── plan.md
```

HTML側はビルド不要とするため、`<script type="module" src="./js/app-home.js"></script>` のようにブラウザネイティブのESモジュールとして読み込む。`src/` 内の各モジュールも同様にESモジュール（`export function ...`）として実装し、Node.jsの `node:test` からも `import { calcScore } from "../src/scoring.js"` の形でそのままテスト可能とする。

## 5. MVP実装に関する補足

初回のMVP実装（`ideas/2026-08-09-moshimoshi-guard/`）では、上記の複数ページ構成・複数ファイル構成を前提としつつも、実装コストを抑えるため以下の簡略版構成を採用した。将来的に本構成へ拡張する余地を残す。

```
ideas/2026-08-09-moshimoshi-guard/
├── README.md            # アプリの概要と使い方
├── src/
│   ├── index.html         # ホーム・チェック・履歴・設定を1ページ内で切り替えるMVP版UI
│   ├── style.css           # 共通スタイル（大きな文字・高コントラスト・印刷用スタイル含む）
│   ├── app.js                # 画面のDOM結線コード（core.jsのロジックを呼び出す）
│   └── core.js                 # phrases/scoring/session/contacts/format/storageを集約した純粋関数群
└── tests/
    └── core.test.js          # core.jsに対するnode:testユニットテスト
```

`core.js` は本設計書 3章・2章のデータモデルとロジック（フレーズ定義、スコア計算、危険度判定、セッション管理、連絡先管理、日時フォーマット、`localStorage` 読み書きのDIラッパー）をすべて集約したモジュールとして実装し、Node.jsからは `require("../src/core.js")` で、ブラウザからは `<script src="core.js"></script>` で読み込める形（UMD風のエクスポート）にする。
