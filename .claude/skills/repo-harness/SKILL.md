---
name: repo-harness
description: 任意のリポジトリに「自動テスト（npm test / pytest）が終了コード0で通る最小テスト」「失敗時に直し方を出力する仕様書チェッカー」「docs/specs/ の仕様書に客観的な完了条件を書くルール」を、既存ファイルを上書きせずに導入する。新しいリポジトリの開発基盤を整えたい、テストが無いリポジトリにテストを入れたい、仕様書や完了条件の書き方を揃えたい、といった依頼で使う。Use when bootstrapping tests, spec templates, or done-criteria checks into a repository.
---

# repo-harness — テスト・直し方・完了条件を、どのリポジトリにも入れる

## 入るもの

| ファイル                                                                   | 役割                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `tests/harness.test.mjs`（TS リポジトリは `.ts`、Python は `test_harness.py`） | 最小テスト。既存の `npm test` / `unittest` / `pytest` に自動で含まれる     |
| `scripts/harness/check-specs.mjs`（Python は `check_specs.py`）             | 仕様書チェッカー。問題ごとに「問題」と「直し方」を出力し、終了コード1で終わる |
| `docs/specs/README.md` / `_TEMPLATE.md` / `harness.md`                     | 仕様書のルール・雛形・このハーネス自体の仕様書（完了条件つき）            |
| `package.json` の `lint:specs`（無ければ `test` も）                       | 実行の入口。既存スクリプトは書き換えない                                  |
| `CLAUDE.md` または `AGENTS.md` への追記                                    | エージェントへの指示（テスト実行・仕様書作成・assert に直し方を書く）     |
| `.vercelignore` への追記（ファイルがある場合のみ）                         | 開発用ファイルを配信対象から外す                                          |

依存パッケージは追加しない（Node 20 以上 / Python 3.9 以上の標準機能のみ）。

## 手順

1. ドライランで何が入るかを確認する。

   ```sh
   node <このスキルのフォルダ>/install.mjs <対象リポジトリ>
   ```

2. 内容に問題がなければ書き込む。書き込み後に最小テストと仕様書チェックを実行し、終了コードを表示する。

   ```sh
   node <このスキルのフォルダ>/install.mjs <対象リポジトリ> --apply
   ```

3. 対象リポジトリ本来のテスト（`npm test` など）・型チェック・フォーマット検査も実行し、既存の検査を壊していないことを確かめてからコミットする。

## 判定と上書きのルール

- 種類の判定: ルートに `package.json` があるか JS/TS ファイルがあれば node、Python ファイルだけなら python。`--flavor node|python` で上書きできる。
- テストファイル名は既存の `test` スクリプトが拾う形に合わせる（`tests/*.test.mjs` → `.mjs`、strip-types 付きの `tests/*.test.ts` → `.ts`）。拾われない形なら `test:harness` スクリプトを追加する。
- 同名ファイルがあればそのまま（スキップ）。指示ファイルへの追記は `<!-- repo-harness:start -->` の目印で1回だけ。何度実行しても結果は同じ。
- `CLAUDE.md` も `AGENTS.md` も無い場合だけ `CLAUDE.md` を作る。`AGENTS.md` だけのリポジトリに `CLAUDE.md` を作ると、Claude Code が `AGENTS.md` を読まなくなるため作らない。

## 完了条件の書き方（チェッカーの規則）

`docs/specs/*.md`（README.md と \_TEMPLATE.md を除く）の `## 完了条件` に、チェックボックス項目が1つ以上あり、各項目がバッククォートで囲んだコマンドかファイルパスを含み、主観的な言葉（適切・正しく・問題なく 等）を含まないこと。

## 雛形を直すとき

`templates/` の node 版と python 版は同じ規則を実装している。片方を直したらもう片方も直し、各リポジトリへは `--apply` ではなく手でコピーして反映する（`--apply` は既存ファイルを上書きしない）。
