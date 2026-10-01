# 表記ゆれ統一チェッカー

日本語の文章を貼り付けると、全角/半角英数字の混在や、長音符号「ー」の
有無によるカタカナ表記ゆれ(例:「サーバ」/「サーバー」)を自動検出し、
ワンクリックで統一できるブラウザ完結型のツールです。

## 使い方

```sh
cd src
python3 -m http.server 8000
# ブラウザで http://localhost:8000/index.html を開く
```

サーバーサイド処理・ビルド不要。`src/index.html` を直接ブラウザで開いても
動作します。

## テスト

```sh
node --test tests/detector.test.js
```

## フォルダ構成

```
docs/
  design/        設計ドキュメント(brainstorm/ に候補案96件の記録)
  requirements/   要件定義
src/
  lib/detector.js 検出・統一ロジック(純粋関数、テスト対象)
  app.js          DOM操作
  index.html, style.css
tests/
  detector.test.js
feedback/
  review-01.md       模擬ユーザーレビュー
  iteration-notes.md 反映内容の記録
```
