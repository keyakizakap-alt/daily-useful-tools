# もしもしガード 実装計画

## 1. 前提・方針

- 依存パッケージのインストール（`npm install`等）は行わない。Node.js標準の `node:test` と `node:assert` のみでユニットテストを実行する。
- ビルドステップなし。ブラウザネイティブのESモジュール（`<script type="module">`）をそのまま使用する。
- 外部通信は一切行わない（フォント・CDN・API呼び出しなし）。
- すべて `apps/moshimoshi-guard/` 配下に実装する。

## 2. 実装するファイル一覧

| # | ファイル | 種別 | 概要 |
|---|---|---|---|
| 1 | `apps/moshimoshi-guard/docs/requirements.md` | ドキュメント | 要件定義書（本タスクで確定済み） |
| 2 | `apps/moshimoshi-guard/docs/design.md` | ドキュメント | 設計ドキュメント（本タスクで確定済み） |
| 3 | `apps/moshimoshi-guard/docs/plan.md` | ドキュメント | 本実装計画 |
| 4 | `apps/moshimoshi-guard/src/phrases.js` | ロジック | 要注意フレーズ定義データと取得関数（`getAllPhrases()`, `getPhraseById(id)`） |
| 5 | `apps/moshimoshi-guard/src/scoring.js` | ロジック | `calcScore`, `calcLevel`, `nextActionMessage` |
| 6 | `apps/moshimoshi-guard/src/format.js` | ロジック | `formatDateTimeJa`, `formatPhone` |
| 7 | `apps/moshimoshi-guard/src/contacts.js` | ロジック | `validateContact`, `pickPrimaryContact`, `setPrimaryContact` |
| 8 | `apps/moshimoshi-guard/src/session.js` | ロジック | `createSession`, `togglePhrase`, `updateSessionField`, `finishSession` |
| 9 | `apps/moshimoshi-guard/src/storage.js` | ロジック | localStorage読み書きラッパー（DI可能） |
| 10 | `apps/moshimoshi-guard/tests/scoring.test.js` | テスト | `scoring.js` のユニットテスト |
| 11 | `apps/moshimoshi-guard/tests/format.test.js` | テスト | `format.js` のユニットテスト |
| 12 | `apps/moshimoshi-guard/tests/contacts.test.js` | テスト | `contacts.js` のユニットテスト |
| 13 | `apps/moshimoshi-guard/tests/session.test.js` | テスト | `session.js` のユニットテスト |
| 14 | `apps/moshimoshi-guard/tests/storage.test.js` | テスト | `storage.js` のユニットテスト（インメモリのモックストレージを使用） |
| 15 | `apps/moshimoshi-guard/css/style.css` | 画面 | 共通スタイル。大きな文字・高コントラスト配色・印刷用（`@media print`）スタイルを含む |
| 16 | `apps/moshimoshi-guard/index.html` | 画面 | ホーム画面 |
| 17 | `apps/moshimoshi-guard/js/app-home.js` | 画面連携 | ホーム画面のDOM結線（緊急連絡先表示等） |
| 18 | `apps/moshimoshi-guard/check.html` | 画面 | 通話中チェック画面 |
| 19 | `apps/moshimoshi-guard/js/app-check.js` | 画面連携 | チェック画面のDOM結線（フレーズ選択・スコア表示・メモ自動保存） |
| 20 | `apps/moshimoshi-guard/settings.html` | 画面 | 設定画面（家族連絡先） |
| 21 | `apps/moshimoshi-guard/js/app-settings.js` | 画面連携 | 設定画面のDOM結線（連絡先CRUD） |
| 22 | `apps/moshimoshi-guard/history.html` | 画面 | 履歴一覧画面 |
| 23 | `apps/moshimoshi-guard/js/app-history.js` | 画面連携 | 履歴一覧画面のDOM結線（一覧・詳細・印刷・削除） |

## 3. 実装順序

ロジック層（テスト可能な純粋関数）を先に完成させ、テストで正しさを担保してからUI層を実装する方針とする。

1. **フレーズ定義データ作成**: `src/phrases.js` を実装（設計書の17件のフレーズ表をそのままデータ化）。
2. **スコアリングロジック**: `src/scoring.js` を実装 → `tests/scoring.test.js` を作成し、以下を検証する。
   - フレーズ未選択時はスコア0・レベル`low`
   - 重みの合計が閾値5・10の境界をまたぐ場合のレベル判定（4→low, 5→mid, 9→mid, 10→high）
   - `critical: true` のフレーズが1件でも含まれる場合、合計スコアが低くても`high`になること
   - `nextActionMessage` が各レベルに対応する文言を返すこと
3. **フォーマットユーティリティ**: `src/format.js` を実装 → `tests/format.test.js` を作成し、日時整形・不正入力時のフォールバックを検証する。
4. **連絡先ロジック**: `src/contacts.js` を実装 → `tests/contacts.test.js` を作成し、バリデーション（名前・電話番号必須）、`isPrimary`の排他制御を検証する。
5. **セッションロジック**: `src/session.js` を実装 → `tests/session.test.js` を作成し、フレーズのトグルによるスコア再計算、フィールド更新、終了処理（`finishedAt`設定）を検証する。
6. **ストレージ層**: `src/storage.js` を実装 → `tests/storage.test.js` を作成し、インメモリのモックストレージ（`{getItem, setItem}`を実装したプレーンオブジェクト）を注入して読み書き・JSON不正値時のフォールバックを検証する。
7. **共通スタイル**: `css/style.css` を実装（大きな文字サイズ、危険度レベルごとの配色トークン、印刷用スタイル）。
8. **ホーム画面**: `index.html` + `js/app-home.js` を実装（最優先連絡先表示、主要導線ボタン）。
9. **チェック画面**: `check.html` + `js/app-check.js` を実装（フレーズボタン一覧、スコア・次の行動のリアルタイム表示、メモ自動保存、進行中セッションの復元）。
10. **設定画面**: `settings.html` + `js/app-settings.js` を実装（連絡先の登録・編集・削除）。
11. **履歴画面**: `history.html` + `js/app-history.js` を実装（一覧・詳細表示・印刷・削除）。
12. **結合確認**: ブラウザで一連の操作（チェック実施→保存→履歴確認→印刷プレビュー→設定変更）を手動確認し、`docs/requirements.md` の各機能要件を満たしているかチェックする。

## 4. テスト方針

- テストランナーは Node.js 標準の `node:test`、アサーションは `node:assert/strict` のみを使用し、追加パッケージは導入しない。
- 実行コマンド（例）: `node --test apps/moshimoshi-guard/tests/`
- `src/` 内の全モジュールは副作用を持たない純粋関数として設計し、DOM・`localStorage`・`Date.now()` 等の非決定的要素は呼び出し元（`js/app-*.js`）から引数として注入することで、`tests/` からブラウザ環境なしにテストできるようにする。
  - 例: `createSession({ id, startedAt })` のように、IDや日時は呼び出し側が生成して渡す。
  - 例: `storage.js` の各関数は `store` 引数（`getItem`/`setItem`を持つオブジェクト）を省略可能な第2引数として受け取り、テスト時はインメモリのモックオブジェクトを渡す。
- カバレッジの目安:
  - `scoring.js`: 境界値（閾値ちょうど）、critical判定、空配列入力の3系統を最低限網羅する。
  - `session.js`: フレーズの選択・選択解除の往復、複数フィールド更新後もスコアが不変であること。
  - `contacts.js`: 必須項目欠落時のバリデーションエラー、`isPrimary`の排他制御（複数指定した場合に最後の指定のみ有効になること）。
  - `storage.js`: 保存→読み込みの往復一致、不正なJSON文字列が保存されていた場合に例外を投げずデフォルト値を返すこと。
  - `format.js`: 正常な日時文字列の変換、不正な文字列を渡した場合のフォールバック挙動。
- UI層（`js/app-*.js`、各`.html`）は自動テスト対象外とし、手動での結合確認（本計画 3章 12.）で担保する。将来的に自動化する場合も、外部通信を発生させないためNode.js標準機能の範囲（例: 簡易的なDOMスタブ）で完結させることを条件とする。

## 5. MVP実装に関する補足

実際の初回実装（`ideas/2026-08-09-moshimoshi-guard/`）では、開発コストを抑え早期に動くものを検証するため、上記の複数ファイル・複数ページ構成ではなく、以下のように簡略化したMVP構成を採用した。

- `src/phrases.js` `src/scoring.js` `src/format.js` `src/contacts.js` `src/session.js` `src/storage.js` の6ファイルは、`src/core.js` 1ファイルに集約した（純粋関数・DIによるテスト容易性の設計方針は変更していない）。
- `index.html` `check.html` `history.html` `settings.html` の4ページ構成は、`src/index.html` 1ページ内でホーム・チェック・履歴・設定をJavaScriptによる画面切り替え（タブ／セクション表示切り替え）で表現する構成に統合した。
- `js/app-home.js` `js/app-check.js` `js/app-history.js` `js/app-settings.js` の4ファイルは `src/app.js` 1ファイルに集約した。
- `css/style.css` は `src/style.css` として同様の役割を維持した。
- テストは `tests/core.test.js` 1ファイルに集約し、`node --test ideas/2026-08-09-moshimoshi-guard/tests/` で実行できるようにした。
- 上記はいずれもMVPとしての簡略化であり、要件定義書（`docs/requirements.md`）の機能要件はすべて満たすことを前提とする。将来的に画面数・利用者数が増える場合は、本ファイルの複数ページ・複数モジュール構成への分割を検討する。
