# フィードバック: コード品質観点でのセルフレビュー

レビュー対象: `apps/2026-08-11-kanjo-post/src/`(実装コード)、`design/design.md`・`design/plan.md`、`requirements/requirements.md`
レビュー方法: 実装コード(`index.html`, `js/*.js`, `css/*.css`)を全て読み、`tests/`(`node tests/run-all.js`、全42件成功)を実行した上で、設計・要件ドキュメントとの整合性、保守性、DRY、テスト容易性、アクセシビリティ、データ整合性の観点から確認しました。ユーザー体験寄りの指摘は既存の `feedback-casual-user.md` / `feedback-family-user.md` と重複するため、本ドキュメントは**コードの作り方そのもの**に絞っています。

---

## 総評

`storage.js` / `letters.js` / `dashboard.js` / `backup.js` を「純粋関数中心・UMDパターンでNode/ブラウザ両対応」に切り出し、`tests/` から機械的に検証できる構造にしている点は、ビルドツール禁止という制約下でのテスト容易性の確保として非常に良い設計判断です。実際に42件のテストは全て成功しており、データ層のロジックには目立った欠陥がありません。

一方で、DOM描画・画面遷移を担う `main.js`(約970行の単一ファイル)はテスト対象外であり、そこに**実際に動作がおかしいバグ**が1件見つかりました。加えて、`letters.js` が公開している `STATUS` 定数や `filterLetters` のような再利用可能なAPIを `main.js` 側が生文字列・独自ロジックで再実装している箇所が複数あり、DRY違反・仕様とのズレ・保守性低下の温床になっています。

---

## 良い点

1. **データ層の関数型設計とテスト可能性**
   `letters.js` の `checkDelivery` / `addReflection` / `openLetter` はいずれも引数を破壊せず新しいオブジェクト・配列を返す設計(`Object.assign({}, letter, {...})`、`.concat()`)になっており、副作用がなくテストしやすい・状態管理のバグが混入しにくい作りです。`tests/letters.test.js` 等でこの純粋関数群がしっかり検証されているのも良い設計判断です。

2. **UMDパターンによるNode/ブラウザ二重実行**
   `storage.js` `letters.js` `dashboard.js` `backup.js` の冒頭にある `(function(root, factory) {...})` は、ビルドツールを使わないという制約の中で「ブラウザの `<script>` からも `node tests/xxx.test.js` からも同じソースをそのまま読み込める」ようにする工夫として的確です。

3. **XSS対策が徹底している**
   ユーザー入力(本文・振り返りテキスト)の描画は一貫して `textContent` / `createTextNode` を使っており、`innerHTML` に生の文字列を差し込んでいる箇所は見当たりません(`innerHTML = ""` によるクリアのみ)。個人の内面を書く前提のアプリとして、この徹底は評価できます。

4. **CSSカスタムプロパティによるテーマ管理**
   `base.css` のライト/ダーク切り替えが `:root` → `@media (prefers-color-scheme: dark)` → `:root[data-theme="dark"]` の3層で一貫してトークン化されており、色の重複定義や漏れがありません。

---

## 改善すべき点・バグ

### 1.【バグ】ホーム画面「届いた手紙」タイルが、ラベルと矛盾した一覧を表示する
`main.js` L827-832:
```js
document.getElementById("homeDeliveredTile").addEventListener("click", function () {
  state.mailboxFilters = { status: null, relation: null };
  navigate("mailbox");
});
```
「届いた手紙 N通」というラベルなのに、実際には `status: null`(フィルタなし = 配達待ちも含む全件)で手紙一覧に遷移します。隣の「配達待ち」タイル(L822-826)は `status: "sealed"` を正しくセットしているため、この非対称性はコピペミスに近い実装バグに見えます。

根本原因は `filterLetters`(`letters.js` L249-262)が `status` の**単一値の完全一致**しかサポートしておらず、「`sealed` 以外(= delivered + opened)」のようなクエリを表現できない点です。`STATUS_FILTERS`(`main.js` L20-25)にも「届いた手紙(未読+既読)」に相当する選択肢がありません。
- 改善案: `filterLetters` の `status` を配列も受け付けるようにする(例: `{status: ["delivered", "opened"]}`)か、`isSealed`/`isArrived` のような専用フラグを用意する。
- この種の「タイルのラベルと遷移先フィルタの対応」は `main.js` のDOM配線コードにしか存在せず、テスト対象外(後述の点5参照)のため自動テストで検出できませんでした。

### 2.【DRY違反】ステータス文字列 `"sealed"` / `"delivered"` / `"opened"` が `main.js` 全体に生文字列でハードコードされている
`letters.js` は `STATUS = { SEALED: "sealed", DELIVERED: "delivered", OPENED: "opened" }` を公開しているにもかかわらず、`main.js` では終始 `letter.status === "sealed"` のような生文字列比較を使っています(例: L165, 168, 178, 397-421, 430, 440, 454, 568, 576 など、10箇所以上)。
- タイプミス(例: `"seald"`)をしても構文エラーにならず、実行時に静かに条件不一致として振る舞うため、バグが発見しづらくなります。
- `KP.Letters.STATUS.SEALED` を使うよう統一すべきです。せっかく定数をエクスポートしているので、その恩恵を呼び出し側が受けられていないのは非常にもったいないです。

### 3.【DRY違反・保守性】「選択可能なボタン群」のUIロジックが3箇所で独立に再実装されている
以下はいずれも「クリックで選択状態をトグルし、`.is-selected` 系のクラスを付け替える」という同じ性質のコンポーネントですが、それぞれ別々に実装されています。
- `buildChips` / `updateChipSelection`(関係性・感情・配達タイミングのチップ、L207-232)
- `renderFilterRow`(手紙一覧のフィルタ行、L377-391)
- `updateThemeSegmentedUI`(テーマの segmented control、L779-786)

見た目のクラス名(`chip`/`filter-chip`/segmented の `button`)が違うだけで構造はほぼ同一のため、共通の「選択可能ボタングループ」ヘルパーに統合できます。統合すれば、後述のARIA属性追加も1箇所直すだけで全箇所に反映されるようになります。

### 4.【DRY違反】`renderBarList` と `renderPeriodBars` がほぼ同一のコードを重複実装している
`main.js` L690-718 の `renderBarList` と L720-758 の `renderPeriodBars` は、`label`/`count` から棒グラフの行(`bar-row` → `bar-track` → `bar-fill` → 件数)を組み立てる処理がほぼ1行単位で一致しています(唯一の違いは `item.label` か `d.key` かというプロパティ名だけ)。
- 改善案: `renderPeriodBars` 側で `KP.Dashboard.aggregateByPeriod(...)` の結果を `{label: d.key, count: d.count}` に詰め替えてから `renderBarList("periodBars", data)` を呼べば、20行以上を削減できます。

### 5.【設計】ロジックが濃い部分ほど自動テストの対象外になっている
`tests/run-all.js` がテストするのは `storage.js` / `letters.js` / `dashboard.js` / `backup.js` の4ファイルのみで、`main.js` はコメント(L4-5)で明示的にテスト対象外とされています。ビルドツールなしという制約下では現実的な判断ですが、実際に見つかった上記1のバグは、まさに「テストされていない `main.js` 側の分岐処理」で発生していました。
- 改善案: 「どのタイル/フィルタボタンがどの `filters` オブジェクトを生成するか」のようなマッピング処理そのものは、DOMに依存しない純粋関数(例: `resolveMailboxFilters(tileId)`)として `letters.js` 側に切り出せば、Node側のテストでカバーできます。DOM操作(`addEventListener`)と「どんなフィルタを組み立てるか」というロジックを分離する余地があります。

### 6.【データ整合性】バックアップのインポート検証が「型」しかチェックしておらず、「値の妥当性」を見ていない
`backup.js` の `isValidLetterShape`(L36-49)は `relation` が `string` であること、`emotionTags` が配列であることまでは確認しますが、その値が `RELATIONS` / `EMOTIONS` の定義済みID(`boss`, `anger` 等)に含まれるかどうかは検証していません。
- 手で編集した、あるいは破損した(しかし型としては合法な)JSONをインポートすると、`relationLabel`/`emotionLabel` が該当タグを見つけられず「その他」ラベルや素のID文字列にフォールバックし(`letters.js` L48-60)、ダッシュボードの集計(`aggregateByRelation`/`aggregateByEmotion`)からも静かに漏れます。エラーにもならず気づきにくい形で数字がズレるため、`isValidLetterShape` に `isValidRelation`/`isValidEmotion`(既に `letters.js` に実装済み)を使った値検証を足すべきです。

### 7.【デッドコード気味のロジック】`state.announcedIds` の実効性が薄い
`main.js` L27-33 の `state.announcedIds`(`Set`)と `runDeliveryCheck`(L96-114)は、「同一セッション内で同じ手紙の配達チャイムを2回鳴らさないため」の重複排除に見えますが、実際には不要です。理由: `checkDelivery`(`letters.js` L185-197)は `status === "sealed"` の手紙だけを対象にしており、1回目の呼び出しで `state.letters` が更新・永続化された時点で該当手紙は `"delivered"` になるため、同一セッション内で2回目以降 `runDeliveryCheck` を呼んでも、その手紙は最初から対象外になります(`newlyDeliveredIds` に再度乗ることがありません)。
- `announcedIds` を除去しても挙動は変わらないはずで、意図が伝わりにくいコードを残すよりは削除するか、コメントで「何を防いでいるつもりか」を明記すべきです。

### 8.【アクセシビリティ / コード品質】状態変化がARIA属性に反映されていない箇所が複数ある
- `toast`(`index.html` L212)に `aria-live` が設定されておらず、`showToast()`(`main.js` L68-76)で表示される保存成否メッセージ等はスクリーンリーダーに通知されません。
- チップ(`chip`)、フィルタチップ(`filter-chip`)、segmented control(`themeSegmented`)は、いずれも選択状態を視覚(CSSクラス)のみで表現しており、`aria-pressed` / `aria-selected` / `aria-checked` を持っていません(唯一 `soundSwitch` だけ `role="switch"` + `aria-checked` を正しく実装しています/L791)。同じアプリ内で実装パターンが統一されていないのも気になる点です。
- 上記3のコンポーネント統合を行えば、この修正も1箇所で完結します。

### 9.【要件と実装の乖離】`filterLetters` が対応している「感情タグでの絞り込み」がUIから使われていない
`plan.md` 3.1 では手紙一覧の機能として「フィルタ(関係性タグ・感情タグ・配達状況)」と明記されていますが、`index.html` の手紙一覧画面(L128-134)には `statusFilterRow` と `relationFilterRow` しかなく、感情タグでのフィルタ行が存在しません。`letters.js` の `filterLetters` は `filters.emotion` を受け付ける実装になっている(L255-259)ため、データ層は対応済みなのに配線されていない状態です。仕様通りに実装するか、対応しないと決めたなら `plan.md` を更新して意図を明記すべきです。

### 10.【バリデーションの分散】配達日の未来日チェックがHTML属性・JSどちらにも存在しない
`customDateInput`(`index.html` L115)に `min` 属性がなく、`computeDeliverAt`(`letters.js` L96-116)も `isNaN` の形式チェックのみで、過去日・当日を弾いていません。(ユーザー体験上の影響は他レビューで指摘済みのため詳細は割愛しますが、)コード品質の観点では「バリデーションをHTML側・JS側のどちらでも行っていない」という漏れそのものが問題です。今後同様の日付入力を追加する際に同じ抜けを繰り返さないよう、`validateComposeInput` のようなロジック内で一元的にチェックする方針を決めておくとよいです。

### 11.【要件との不整合】オフライン動作の要件に対する実装が存在しない
`requirements.md` 6章は「一度読み込んだ後は、再訪時にオフラインでも動作することを目指す」としていますが、`index.html` はService Worker登録もキャッシュマニフェストも持たず、`<script src="...">` で毎回ネットワーク経由の読み込みに依存しています。ブラウザの通常キャッシュに偶然残っていない限り、オフライン再訪時は白画面になります。「目指す」という努力目標である点は踏まえつつ、最低限のオフライン対応(Service Workerでの静的アセットキャッシュ)をタスクとして計画に積むか、対応しない判断であれば要件側の記述を弱めるべきです。

---

## 細かい点

- `README.md` に、実装コードのテストの実行方法(`node tests/run-all.js`)が記載されていません。テストが存在すること自体、READMEを一読しただけでは気づけません。
- `filterLetters` は `if (filters.status && ...)` のように「falsy値なら未指定扱い」というパターンで判定しています。現状のステータス値はすべてtruthyな文字列なので問題は起きませんが、将来的に空文字列や `0` を正当な値として使うことになった場合に壊れる書き方です。`filters.status != null` のような明示的な判定の方が安全です。
- 複数タブでの同時利用(`storage` イベント未使用)については設計・要件ドキュメントのどこにも触れられておらず、後から利用者が「別タブで書いた手紙が消えた」と気づいた際に、意図的な仕様か実装漏れかが判別できません。既知の制約として `plan.md` の「今後の検討事項」あたりに一言書いておくと、将来の実装者(自分自身も含む)が迷わずに済みます。

---

## まとめ

データ層(`storage.js`/`letters.js`/`dashboard.js`/`backup.js`)は純粋関数・不変更新・UMD二重対応という設計方針が一貫しており、テストによる裏付けもあるため品質は高いです。一方で `main.js` に閉じたDOM配線コードは、
1. 実際に動作が仕様と食い違うバグ(「届いた手紙」タイル)を含んでおり、
2. `letters.js` が公開する定数・関数を使わず独自に再実装している箇所が多く、
3. その結果としてテストの網から漏れている、

という3点が連鎖しています。ボタングループUIの共通化とステータス定数の徹底利用を優先的に行うだけで、コードの重複が大きく減り、今回見つかったバグのような「コピペ起因の見落とし」も再発しにくくなると考えます。
