# のしるべ（ご祝儀・香典の包み方ナビ）

- ステータス: 完了
- 関連: `noshi/docs/requirements.md` / `noshi/docs/architecture.md` / `noshi/feedback/review_report.md`

## 目的

冠婚葬祭でお金を包むときの金額の目安・袋・書き方・お札の扱いを1画面にそろえ、包む金額の点検と中袋の大字表記を、通信・保存なしで提供する。

## スコープ

- やること: 11場面の目安と作法の表示、金額の点検、大字変換、お札の組み合わせ、縦書きの袋プレビュー
- やらないこと: 地域別の相場切り替え、品物の選定、印刷用テンプレート、データの保存

## 完了条件

- [x] `npm test` が終了コード0で終わる（`noshi/tests/engine.test.js` を含む）
- [x] `cd noshi && npm run smoke` の出力が `33/33 件成功` で終わる
- [x] `cd noshi && npm audit` の出力に `found 0 vulnerabilities` を含む
- [x] `node -e "console.log(require('./noshi/src/engine.js').toDaiji(30000))"` の出力が `金 参萬円`
- [x] `noshi/src/app.js` と `noshi/src/engine.js` に `innerHTML`・`fetch(`・`localStorage` が含まれない（`npm test` の静的検査で判定）
- [x] `noshi/index.html` の CSP に `connect-src 'none'` を含む
- [x] トップページ `index.html` に `href="noshi/"` のリンクがある
