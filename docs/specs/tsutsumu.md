# つつむ（冠婚葬祭のお金と袋の書き方ナビ）

- ステータス: 完了
- 関連: `tsutsumu/docs/requirements.md`、`tsutsumu/docs/architecture.md`、`PR_DESCRIPTION.md`

## 目的

ご祝儀・香典・お年玉を包むときに、金額・お札・袋・表書き・中袋・お返しを場面ごとに別々に調べ直す手間をなくす。
場面と相手を選ぶだけで、すべてを1画面に出す。

## スコープ

- やること: 9場面の目安金額とおすすめ、金額の点検（4・9・偶数・端数）、お札・袋・表書き・名前・中袋（大字）・お返し・連名の計算、端末内だけの贈答記録（書き出し・読み込み・削除）
- やらないこと: 地域別の相場、品物の提案、端末間の同期、通信を伴う機能

## 完了条件

- [x] `npm test` が終了コード0で終わる（`tsutsumu/tests/engine.test.mjs` を含む）
- [x] `npm run lint:specs` が終了コード0で終わる
- [x] `tsutsumu/index.html`、`tsutsumu/src/engine.js`、`tsutsumu/src/app.js`、`tsutsumu/src/styles.css` が存在する
- [x] `grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|innerHTML|eval\(" tsutsumu/src` の出力が0行
- [x] `tsutsumu/index.html` の CSP に `connect-src 'none'` と `script-src 'self'` を含む
- [x] `node tsutsumu/tests/smoke.mjs` が終了コード0で終わる（ブラウザで主要フローを操作し、コンソールエラー0件）
- [x] `tsutsumu/feedback/review_report.md` の「高」の指摘がすべて「対応済み」
