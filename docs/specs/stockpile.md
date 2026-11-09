# そなえ帳（家庭の防災備蓄ノート）

- ステータス: 完了
- 関連: `stockpile/docs/requirements.md` / `stockpile/docs/architecture.md`

## 目的

家族構成から防災備蓄の必要量を出し、在庫と賞味期限を端末内で管理して、不足分と「今月食べて買い足す物」を示す。

## スコープ

- やること: 必要量の計算、在庫の追加・数量変更・削除、期限アラート、買い物リストのコピー、JSON の書き出し・読み込み、全消去
- やらないこと: 通知、家族間の共有・同期、バーコード読み取り、購入リンク、サーバーへの保存

## 完了条件

- [x] `npm test` が終了コード0で終わる（`stockpile/tests/engine.test.mjs` を含む）
- [x] `stockpile/index.html` と `stockpile/src/engine.js` `stockpile/src/app.js` `stockpile/src/styles.css` が存在する
- [x] `node -e "const S=require('./stockpile/src/engine.js');console.log(S.calcRequirements({adults:2,days:7}).find(r=>r.id==='water').required)"` の出力が `42`
- [x] `grep -rnE "innerHTML|fetch\(|XMLHttpRequest" stockpile/src` の出力が0行
- [x] `stockpile/index.html` の CSP に `connect-src 'none'` を含む
- [x] `stockpile/feedback/review_report.md` が存在し、指摘ごとの対応欄がある
