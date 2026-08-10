# じぶん物価

日用品の価格を買うたびに記録するだけで、公式CPIとは違う「自分だけの体感インフレ率」を自動算出するパーソナル物価トラッカーです。外部API・サーバー・依存ライブラリなしの、完全クライアントサイドの単一ページWebアプリ（HTML/CSS/JavaScript）です。

## 使い方

`src/index.html` をブラウザで直接開くだけで動作します（ビルド不要）。

```
open apps/2026-08-10-jibun-bukka/src/index.html
```

1. 「価格を記録する」フォームで品目名・価格・購入日を入力して記録
2. 同じ品目を2回以上記録すると、「じぶん物価指数」と値上がりランキングが自動表示される
3. 品目を選択すると、価格推移の折れ線グラフが表示される
4. CSVエクスポート／インポートでデータのバックアップ・移行ができる

データはすべてブラウザの `localStorage` にのみ保存され、外部への送信は一切行われません。

## フォルダ構成

```
2026-08-10-jibun-bukka/
  design/design.md          ... 設計ドキュメント（コンセプト・アーキテクチャ・データモデル）
  requirements/requirements.md ... 要件定義書（機能要件・非機能要件・受け入れ基準）
  src/                      ... 実装（index.html / style.css / js/）
  tests/                    ... 単体テスト（node --test）
  feedback/                 ... レビューフィードバックと対応記録
```

## テストの実行

```
node --test apps/2026-08-10-jibun-bukka/tests/priceIndex.test.js
```

コアロジック（`src/js/priceIndex.js`）はDOMに依存しない純粋関数として実装されており、Node.jsの標準テストランナーで検証できます。
