# AGENTS.md

AIコーディングエージェント向けの作業ガイド。人間向けの説明は `README.md` を参照。

## プロジェクト概要

日常で使える小さな Web ツールを集めたリポジトリ。**ビルド不要の静的サイト**で、リポジトリ全体をそのまま配信する。

| パス | アプリ | 概要 |
|---|---|---|
| `index.html` | こいのかたち | 15問で12タイプの恋愛観を表示する診断アプリ |
| `weather/index.html` | そらならべ | 全国56地点＋任意地点の天気を並べて比較するダッシュボード |
| `assets/characters/` | — | こいのかたち用キャラクター画像 `char-01.webp`〜`char-12.webp` |
| `tools/build_standalone.py` | — | 画像を data URI で埋め込んだ単一ファイル版を生成 |
| `.claude/skills/` | — | 共通スキル（`review-triage`） |

## 技術スタックと制約

- **依存ライブラリなしの単一 HTML**（HTML / CSS / vanilla JS）。npm・フレームワーク・バンドラは導入しない。
- 外部リソースは Google Fonts のみ。グラフ・アイコンはコード生成の inline SVG。
- 外部 API（そらならべのみ）: ブラウザから直接呼ぶ。APIキーは使わない・置かない。
  - Open-Meteo Forecast / Geocoding API（非商用無料枠）
  - 気象庁 防災情報 JSON（**非公式ルート**。取得失敗時は予報値からの独自判定にフォールバックし、画面上でソースを明示する挙動を維持する）
- ユーザー設定は `localStorage` のみに保存し、外部に送信しない。
- Python ツールは標準ライブラリのみ（Python 3）。

## 開発・確認手順

```bash
# ローカル確認（ファイルを直接開いてもよいが、fetch を使う weather は HTTP 経由が確実）
python3 -m http.server 8000
# → http://localhost:8000/ と http://localhost:8000/weather/

# 単一ファイル版の生成（index.html の `const ASSETS = null;` に画像を差し込む）
python3 tools/build_standalone.py out.html
python3 tools/build_standalone.py out.html --fragment   # Artifact 用の断片
```

自動テスト・リンターは未整備。変更後は最低限、以下をブラウザで確認する:

- ライト／ダーク両テーマ（OS 追従と手動切り替えの両方）
- スマホ幅（〜375px）と PC 幅でレイアウトが崩れない・横スクロールが出ない
- キーボード操作、ボタン・リンクが実際に動作する
- 開発者ツールのコンソールにエラーが出ない
- そらならべ: API 失敗時（オフライン等）にキャッシュ表示・フォールバックが効く

## コーディング規約

- 既存ファイルの書き方（インデント、命名、コメントの密度・言語）に合わせる。コメント・UI 文言は日本語。
- テーマ色は `:root` のCSS変数で定義し、ダークは `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` と `:root[data-theme="dark"]` の両方に書く既存パターンに従う。
- `index.html` の `const ASSETS = null;` は `build_standalone.py` の差し込み位置なので、文字列を変えない。
- 画像は `assets/` 配下に置き、相対パスで参照する（`vercel.json` で長期キャッシュされるため、差し替え時はファイル名を変える）。
- こいのかたち: 設問・結果文は性別・性的指向・交際形態・年齢・結婚観を前提にしない。12タイプの記述量・構成を揃える（README「中立性のための設計」参照）。
- 仕様・機能を変えたら `README.md` の該当節も更新する。

## デプロイ

- `main` への push で GitHub Pages に自動デプロイ（`.github/workflows/pages.yml`）。**main へ直接 push しない**。作業ブランチ → PR で反映する。
- Vercel 設定は `vercel.json`（静的配信・`cleanUrls`・セキュリティヘッダ・キャッシュ制御）。本番デプロイ（`vercel --prod`）は人間の確認なしに実行しない。
- 新しいツールを追加する場合は `<tool-name>/index.html` として配置し、README の「収録ツール」に追記する。

## レビュー指摘への対応

観点別レビュワー（sub-agent / CI / bot / 人間）から指摘を受けたら、コードを編集する前に
`.claude/skills/review-triage/SKILL.md` の手順でトリアージする。

- 指摘された「問題」は信じる。指摘された「修正方法」は仮説として扱う。
- Done の定義は「Issue の解決＋リグレッションなし」であり、「レビュワー全員の合格」ではない。
- 同一テーマの指摘が3ラウンド周回したら、実装を止めて人間に判断を仰ぐ。

## 共通スキルの扱い

`.claude/skills/` 配下は他リポジトリ（game-apps / web-sites / dxworkrepository）と**同一内容**を維持している。
このリポジトリだけで編集しない。変更が必要な場合は人間に確認する。

## 確認が必要な操作

次は実行前に人間に確認する: ファイルの削除・大規模な書き換え、`main` への push、本番デプロイ、
外部サービスの追加、APIキー等の認証情報を扱う変更。
