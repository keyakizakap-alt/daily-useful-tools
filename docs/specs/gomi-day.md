# あしたのごみ（gomi-day）

- ステータス: 完了
- 関連: `gomi-day/docs/requirements.md`, `gomi-day/docs/architecture.md`

## 目的

ごみ出しの規則（毎週・第n週・隔週）とお休み期間を一度入れれば、今日とあしたに出すごみが分かるようにする。家族とURLで共有でき、カレンダー（.ics）に書き出せる。

## スコープ

- やること: 規則の登録・削除、お休み期間、今日・あした・2週間の表示、共有リンク、.ics 書き出し、localStorage 保存
- やらないこと: 自治体データの取り込み、祝日の自動判定、サーバー・プッシュ通知

## 完了条件

- [x] `npm test` が終了コード0で終わる（`gomi-day/tests/*.test.mjs` を含む）
- [x] `npm run lint:specs` が終了コード0で終わる
- [x] `gomi-day/index.html` が存在し、`gomi-day/src/rules.js` と `gomi-day/src/app.js` を読み込む
- [x] `gomi-day/tests/static.test.mjs` が `innerHTML` / `eval` の不使用と CSP の `connect-src 'none'` を検査して合格する
- [x] `gomi-day/feedback/review_report.md` が存在し、指摘ごとの対応結果を含む
- [x] トップページ `index.html` に `gomi-day/` へのリンクがある
