# としめくり（履歴書の学歴年表・年号早見）

- ステータス: 完了
- 関連: `rireki/docs/requirements.md` / `rireki/docs/architecture.md`

## 目的

生年月日と最終学歴から、履歴書の学歴欄（入学・卒業の年月）を和暦・西暦で出す。早生まれ・浪人・留年・改元の年を自動で扱い、記載ミスを防ぐ。

## スコープ

- やること: 学歴年表の計算と表示、和暦⇔西暦変換、満年齢、コピー
- やらないこと: 職歴欄、PDF 出力、入力内容の保存、明治以前の和暦

## 完了条件

- [x] `npm test` が終了コード0で終わる
- [x] `rireki/tests/engine.test.mjs` に早生まれ境界（4月1日・4月2日生まれ）と改元境界（2019年4月・5月）のテストがある
- [x] `rireki/tests/static.test.mjs` が `rireki/index.html` の CSP に `connect-src 'none'` があることを検査する
- [x] `rireki/src/` 配下に `fetch(` と `innerHTML` が出現しない（`grep -rE "fetch\(|innerHTML" rireki/src` の出力が空）
- [x] `rireki/feedback/review_report.md` と `rireki/PR_DESCRIPTION.md` が存在する
- [x] トップページ `index.html` に `href="rireki/"` のリンクがある
