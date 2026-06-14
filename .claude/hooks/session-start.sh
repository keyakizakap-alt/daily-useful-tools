#!/bin/bash
# AWS Learning Navigator - SessionStart hook
# Claude Code on the web のセッション開始時に開発環境を整える。
# 毎回まっさらなコンテナで起動するため、依存とローカルDB(SQLite)を用意する。
# 冪等（複数回実行しても安全）・非対話で動作する。
set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

# 0. DATABASE_URL を定義する .env を用意（schema.prisma が env("DATABASE_URL") を参照する）
[ -f .env ] || cp .env.example .env

# 1. 依存関係のインストール（コンテナのキャッシュを活かすため ci ではなく install）
npm install

# 2. Prisma Client生成 + SQLiteスキーマ反映 + シードデータ投入
#    dev.db は .gitignore 済みで毎セッション再生成される
npx prisma generate
npx prisma db push --skip-generate
npx prisma db seed

echo "session-start hook: 環境準備が完了しました（依存インストール + DB初期化）"
