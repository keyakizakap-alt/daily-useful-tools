###############################################################################
# AWS Learning Navigator - 本番用 Dockerfile（マルチステージ / node:20-alpine）
#
# アプリは Next.js 15 (App Router) + Prisma(SQLite)。
# 本番イメージの最小化は Next.js standalone 出力で実現する:
#   - builder 段では全依存(devDependencies 含む)でビルド・シードを行う
#   - runner 段へは standalone が追跡した実行時依存のみをコピーするため、
#     devDependencies はランタイムイメージに一切含まれない
# ビルド時にシード済み SQLite をテンプレートとして焼き込み、起動時にボリュームへ展開する。
###############################################################################

# ---- 共通ベース（Prisma エンジンが必要とする openssl / musl 互換ライブラリ） ----
FROM node:20-alpine AS base
# node:20-alpine には Prisma の musl 向けクエリエンジンが必要とする
# libssl.so.3 / libcrypto.so.3 (libssl3 / libcrypto3) が既に含まれているため
# 追加の apk install は不要。
WORKDIR /app

# ---------------------------------------------------------------------------
# 1. deps: 依存インストール（ビルド・シードに devDependencies が必要なため全依存）
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2. builder: Prisma Client 生成 → Next.js ビルド → シード済みテンプレート DB 作成
# ---------------------------------------------------------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# インストール済みのローカル prisma を直接実行（npx のレジストリ確認を避ける）
RUN node_modules/.bin/prisma generate
RUN npm run build

# シード済みテンプレート DB を /app/prisma/template.db に作成
# （seed は tsx を直接実行。prisma db seed は PATH 上の tsx を要求するため避ける）
RUN DATABASE_URL="file:/app/prisma/template.db" node_modules/.bin/prisma db push --skip-generate \
    && DATABASE_URL="file:/app/prisma/template.db" node_modules/.bin/tsx prisma/seed.ts

# ---------------------------------------------------------------------------
# 3. runner: standalone サーバーのみを含む最小の本番ランタイム
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/data/prod.db"

# 非 root ユーザーで実行
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# standalone 出力（実行時依存のみを含む pruned node_modules + server.js）
# COPY --chown でコピー時に所有者を設定し、chown -R によるレイヤー肥大を防ぐ
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma Client とクエリエンジンを確実に同梱する
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
# シード済みテンプレート DB と起動スクリプト
COPY --from=builder --chown=nextjs:nodejs /app/prisma/template.db ./prisma/template.db
COPY --chown=nextjs:nodejs --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

# 永続化用ボリューム（SQLite DB を配置）
RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
