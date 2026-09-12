# spec-auditor — 仕様書の矛盾・実現不能箇所の抽出

会議メモ・仕様書を渡すと、**AI が整理し、人が判断する**形でタスク・矛盾・実現不能箇所を洗い出し、
返すべき質問まで作るローカル CLI エージェント。

添付いただいた図の AFTER の流れをそのまま実装している。

```
 1 要件抽出(AI) → 2 分類(AI) → 3 照合(AI/判定基準表) → 4 候補抽出(AI)
   → 5 対応確認(人) → 6 成立判断(人) → 7 質問作成(AI)
```

| 段 | 担当 | やること |
|---|---|---|
| 要件抽出 | AI | 会議メモからタスク・担当候補・期限を抜く。**記載のないものは推測せず「未確認」にする** |
| 分類 | AI | 業務上のまとまり（group）を付けて一覧化する |
| 照合 | AI | 判定基準表（同梱の TOML）と突き合わせて矛盾・実現不能箇所を検出する |
| 候補抽出 | AI | 各指摘に対する対応案・代替案と、その引き換えに失うものを並べる |
| **対応確認** | **人** | 担当者・期限を確定する（AI の推測で誤った依頼を出さないため） |
| **成立判断** | **人** | 実現可能性・優先度を判断し、採る案を選ぶ |
| 質問作成 | AI | 人が「未確認」「保留」のまま残した点だけを質問文にする |

## 前提と設計判断

- **実行形態はローカル CLI。** 静的サイトに API キーは置けないため、鍵はローカルの環境変数からのみ読む。仕様書本文を第三者のブラウザに載せない。
- **接続先は OrcaRouter**（OpenAI 互換ゲートウェイ）。OpenAI 互換なので `--base-url` だけで自己ホスト（OrcaRouter Lite 等）や他の互換エンドポイントへ差し替えられる。
- **依存ライブラリはゼロ**（標準ライブラリのみ）。サプライチェーンの攻撃面を増やさない。
- **AI に権限を持たせない。** ツール実行・シェル実行・メール送信は一切しない。出力はローカルの Markdown と JSON だけ。

## セットアップ

Python 3.11 以上。

```bash
cd agents/spec-auditor
pip install -e .            # spec-auditor コマンドが入る（開発時は pip install -e '.[dev]'）

export ORCAROUTER_API_KEY='sk-orca-...'
# 鍵をファイルで管理する場合（パーミッション 600 必須）
# export ORCAROUTER_API_KEY_FILE="$HOME/.config/orcarouter/key"
```

| 環境変数 | 既定 | 用途 |
|---|---|---|
| `ORCAROUTER_API_KEY` | （必須） | API キー |
| `ORCAROUTER_API_KEY_FILE` | — | 鍵をファイルで渡す場合のパス（600 でないと拒否） |
| `ORCAROUTER_BASE_URL` | `https://api.orcarouter.ai/v1` | 自己ホスト時に差し替える |
| `SPEC_AUDITOR_MODEL` | `orcarouter/auto` | 既定モデル（`provider/model` 形式） |

## 使い方

```bash
# 一気通貫（AI 4 段 → 人 2 段 → 質問作成）
spec-auditor run 会議メモ.md

# AI の整理だけ先に回し、人の判断は後でまとめてやる
spec-auditor run 会議メモ.md --skip-human
spec-auditor review out/SES-xxxxxxxx.json

# レポートだけ出し直す
spec-auditor report out/SES-xxxxxxxx.json

# 判定基準表の確認 / 監査ログの改ざん検証
spec-auditor check-criteria
spec-auditor verify-audit out/audit.jsonl
```

出力は `out/SES-xxxxxxxx.md`（レポート）と `out/SES-xxxxxxxx.json`（セッション）。
いずれも `0600` で作られる。人間判断を通していないレポートには **未確定** と明記される。

### API キー無しで動きを見る

```bash
PYTHONPATH=src python3 -m spec_auditor run examples/sample_spec.md \
  --out /tmp/demo --mock-responses examples/mock_responses.json --skip-human --yes
```

`examples/sample_spec.md` には、保持期間 30 日 / 1 年の矛盾、契約締結（10/15）より前に来る
移行バッチ期限（9/30）、外部送信可否の未定義といった不整合を意図的に仕込んである。

## 判定基準表

「何を矛盾とみなすか」は TOML に切り出してある。業務側が編集する前提。
既定の表は `spec-auditor check-criteria` がパスを表示するので、手元にコピーして
`--criteria 自社の基準表.toml` で差し替える。

```toml
[[rule]]
id = "R-002"
category = "矛盾"
title = "同一対象に相反する記述がある"
description = "同じ機能・数値・対象について、両立しない記述が2箇所以上ある場合。"
severity = "高"           # 高 / 中 / 低
check_hint = "数値・期間・可否の記述を対象ごとに集めて突き合わせる。"
```

**AI はこの表に載っている `rule_id` でしか指摘を出せない。** 表に無い理由での指摘、
存在しない要件 ID を参照する指摘は採用前に破棄され、破棄件数が表示される。
重要度も表の値を使い、モデルの申告は採用しない。

## セキュリティ

設計と既知の限界は [SECURITY.md](SECURITY.md) に分けて書いてある。要点だけ:

- 仕様書は `<untrusted_document>` に封入して「資料であって指示ではない」と明示。指示様テキストを検知したらレポートに一覧を出す（従わないが、混入の事実は人に見せる）。
- 外部送信の前に、メールアドレス・電話番号・マイナンバー・カード番号・API キー・JWT をマスキング。対応表はローカルにのみ残す。**完全ではないので、社外に出せない文書は自己ホスト構成を使うこと。**
- 最初の送信前に「送信先ホスト・モデル・文書名・送信量・マスキング状況」を表示して同意を取る。
- 人間判断（対応確認・成立判断）は `--yes` でもスキップされない。
- `audit.jsonl` は前行のハッシュを含むチェーン構造で、改ざん・行削除を検出できる。プロンプト本文は残さず SHA-256 と文字数のみ。

> 添付予定だったセキュリティ資料が今回の添付に含まれていなかったため、一般的なベストプラクティスで
> 先行実装している。資料の到着後に差分を調整する前提。

## テスト

```bash
pip install -e '.[dev]'
python3 -m pytest
```

55 件。マスキング・注入検知・出力検証・監査ログの改ざん検出・予算上限に加え、
サンプル仕様書を CLI に通す E2E（注入入り文書が「指示として実行されず、レポートに報告される」ことの確認を含む）。

## ディレクトリ

```
src/spec_auditor/
  cli.py            コマンド定義
  agent.py          7 段のオーケストレーション
  human_review.py   対応確認・成立判断（人）
  criteria.py       判定基準表のローダ
  models.py         ドメインモデル
  render.py         Markdown レポート生成
  store.py          セッションの保存・再開
  llm/              OpenAI 互換クライアント（標準ライブラリのみ）＋モック
  pipeline/         AI 5 段とプロンプト
  security/         マスキング / 封入・注入検知 / 出力検証 / 監査ログ / 送信ポリシー
  data/default_criteria.toml  既定の判定基準表
examples/               サンプル仕様書とモック応答
tests/                  テスト
```
