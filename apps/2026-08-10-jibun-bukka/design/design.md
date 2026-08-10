# 設計ドキュメント — じぶん物価

## 1. コンセプト

家計簿アプリの「支出総額」ではなく、「同一品目の単価推移」だけを追い続けることで、公式CPIとは異なる個人単位の体感インフレ率を可視化するパーソナル物価トラッカー。

## 2. アーキテクチャ

完全に静的なクライアントサイドSPA。ビルドツール・フレームワークは使用せず、素のHTML/CSS/JavaScriptで構成する。

```
src/
  index.html      画面構造（記録フォーム / サマリー / ランキング / 品目別グラフ / 一覧）
  style.css       スタイル（レスポンシブ、ライト基調）
  js/
    priceIndex.js 純粋関数のコアロジック（データ変換・指数計算・CSV変換）。
                  Node / ブラウザ双方から読み込み可能なUMD風エクスポート。
    storage.js    localStorage の読み書きラッパー
    app.js        DOM操作・イベントハンドリング（UI層）
```

ロジック層（priceIndex.js）とUI層（app.js）を分離することで、ロジックをNode.jsの `node:test` で単体テストできるようにする。

## 3. データモデル

localStorage キー: `jibunBukka.records.v1`

```json
[
  { "id": "uuid的な文字列", "item": "たまご(10個)", "price": 258, "date": "2026-08-10" },
  { "id": "...", "item": "たまご(10個)", "price": 298, "date": "2026-07-01" }
]
```

- フラットな配列で保存し、表示時に `item` ごとにグルーピングして日付昇順に並べる。
- 同一品目・同一日付の重複入力も許容する（同日に複数回買い物した場合を想定し、削除は個別レコード単位で行う）。

## 4. 画面構成

1. **ヘッダー**: アプリ名「じぶん物価」とサブタイトル
2. **記録フォーム**: 品目名（datalistでオートコンプリート）・価格・購入日（デフォルト今日）・追加ボタン
3. **サマリーカード**: 「じぶん物価指数」を大きく表示（例: `+7.2%`）。対象品目数も併記。データ不足時はメッセージ表示。
4. **値上がりランキング**: 変化率上位5品目をバーで表示
5. **品目別グラフ**: 品目セレクトボックスで選択→SVG折れ線グラフで価格推移を表示。初回価格からの変化率も表示。
6. **記録一覧**: 全記録をテーブル表示、行ごとに削除ボタン
7. **データ管理**: CSVエクスポート／インポートボタン

## 5. コアロジック（priceIndex.js）の関数設計

- `groupByItem(records)` → `{ [item]: record[]（date昇順） }`
- `computeItemChange(records)` → `{ item, first, last, changePercent }`（2件未満はnull）
- `computeJibunBukkaIndex(records)` → `{ indexPercent, sampleSize } | null`
- `computeRanking(records, topN=5)` → 変化率降順の配列
- `recordsToCSV(records)` / `csvToRecords(csvText)` → CSV相互変換（ヘッダー: id,item,price,date）

これらはDOMに依存しない純粋関数とし、`module.exports` と `window` 双方に公開する。

## 6. グラフ描画方針

外部グラフライブラリを使わず、価格の最小・最大値からSVGの `<polyline>` の座標を計算して描画する自前実装とする（依存追加なし要件を満たすため）。

## 7. エラー・エッジケース方針

- 品目名または価格が未入力の場合は追加不可（HTML5 `required` + JS側バリデーション）
- 価格は0以下を許容しない
- 記録1件のみの品目はグラフ・変化率計算の対象外とし、「もう1件記録すると推移がわかります」等のガイダンスを表示
- CSVインポート時は不正行をスキップし、件数をユーザーに通知する

## 8. テスト方針

`tests/priceIndex.test.js` にて `node --test` で以下を検証する:
- groupByItem のグルーピング・日付ソート
- computeItemChange の変化率計算（正常系・記録1件のケース）
- computeJibunBukkaIndex の平均計算・対象0件時の挙動
- computeRanking の降順ソート・件数制限
- CSV相互変換の往復一致（records → CSV → records）
