#!/bin/sh
# AWS Learning Navigator - コンテナ起動スクリプト
# 永続ボリューム上に DB が無い初回のみ、シード済みテンプレートを展開する。
# 既存の DB（学習進捗・解答履歴）は上書きしない。
set -e

DB_PATH="${DATABASE_URL#file:}"
DB_DIR=$(dirname "$DB_PATH")

mkdir -p "$DB_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "entrypoint: DB が存在しないためテンプレートを展開します -> $DB_PATH"
  cp /app/prisma/template.db "$DB_PATH"
else
  echo "entrypoint: 既存の DB を使用します -> $DB_PATH"
fi

exec "$@"
