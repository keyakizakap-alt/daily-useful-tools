# 共通スキル

このディレクトリのスキルは、以下4リポジトリで**同一内容**を維持している共通スキルです。
片方だけを編集せず、変更時は4リポジトリすべてに反映してください。

- keyakizakap-alt/game-apps
- keyakizakap-alt/daily-useful-tools
- keyakizakap-alt/web-sites
- keyakizakap-alt/dxworkrepository

## 一覧

| スキル | 用途 | 発動タイミング |
|---|---|---|
| `review-triage` | レビュー指摘のトリアージと沼（修正→再指摘ループ）の回避 | レビュー指摘を受けて**修正に着手する前** |

## このリポジトリだけに置いているスキル

| スキル | 用途 | 発動タイミング |
|---|---|---|
| `repo-harness` | 任意のリポジトリに最小テスト・直し方つき仕様書チェック・完了条件のルールを入れる（配布元） | 新しいリポジトリの開発基盤を整えるとき |

他のリポジトリへ入れるときは、このリポジトリと対象リポジトリを同じセッションで開き、
`node daily-useful-tools/.claude/skills/repo-harness/install.mjs <対象> --apply` を実行する。
