# 開発手順（Development Guide）

AWS Learning Navigator を実装・拡張するための手順書です。ローカル開発と
Claude Code on the web（リモート実行環境）の両方を対象にしています。

---

## 1. 前提環境

| ツール | バージョン目安 |
|---|---|
| Node.js | 20 以上（推奨 22.x） |
| npm | 10 以上 |

技術スタック: TypeScript / Next.js 15 (App Router) / React 19 / Tailwind CSS v4 /
Prisma + SQLite。

---

## 2. セットアップ手順

### 2-1. ローカルで開発する場合

```bash
# 1. 依存関係のインストール
npm install

# 2. 環境変数ファイルを用意（schema.prisma が env("DATABASE_URL") を参照）
cp .env.example .env

# 3. DB（SQLite）作成 + シードデータ投入（41サービス / 10資格 / 41問）
npm run setup

# 4. 開発サーバー起動
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

### 2-2. Claude Code on the web で開発する場合

リモートのセッションは**毎回まっさらなコンテナ**で起動し、`node_modules` と
`prisma/dev.db` は残りません。これを自動で用意するために **SessionStart フック**
を用意しています（`.claude/hooks/session-start.sh`）。

- セッション開始時に自動で `.env` 生成 → `npm install` → `prisma generate`
  → `prisma db push` → `prisma db seed` が実行されます。
- フックは**同期実行**のため、準備完了後にセッションが使用可能になります。
- このフックは**デフォルトブランチにマージされて以降の全セッションで有効**になります。

> 手動でやり直したいときは次を実行します。
> ```bash
> CLAUDE_PROJECT_DIR="$PWD" ./.claude/hooks/session-start.sh
> ```

### 2-3. Docker で本番デプロイする場合

本番運用向けのコンテナ構成を同梱しています（`Dockerfile` / `docker-compose.yml`
/ `.dockerignore` / `docker-entrypoint.sh`）。

```bash
docker compose up --build -d   # ビルドして起動（ホスト 80 -> コンテナ 3000）
docker compose logs -f         # ログ確認
docker compose down            # 停止（DB ボリュームは保持）
```

構成の要点:

| 項目 | 内容 |
|---|---|
| ベースイメージ | `node:20-alpine`（マルチステージ: deps / builder / runner） |
| 本番最小化 | Next.js standalone 出力。runner に devDependencies を含めない |
| 公開ポート | ホスト `80` -> コンテナ `3000` |
| 自動再起動 | `restart: always` |
| DB 永続化 | 名前付きボリューム `aws-nav-data` を `/data` にマウント（`/data/prod.db`） |
| シード | ビルド時にシード済み DB を `prisma/template.db` として焼き込み、初回起動時に展開（既存は保持） |
| 実行ユーザー | 非 root（`nextjs`） |
| 接続先切替 | `DATABASE_URL` 環境変数（ローカル: `prisma/dev.db` / コンテナ: `/data/prod.db`） |

> `docker-compose.yml` は `.env` を `env_file` として読み込みますが、`DATABASE_URL`
> はボリューム上の本番 DB を指すよう `environment` で固定上書きしています。

---

## 3. 開発フロー

1. 開発ブランチで作業する（例: `claude/aws-learning-navigator-spec-enxaoj`）。
   `main` へ直接コミットしない。
2. 変更を加える。
3. 下記の**品質チェック**をローカルで通す。
4. 意味のある単位でコミットする（コミットメッセージは日本語で簡潔に）。
5. ブランチへプッシュし、必要に応じて Pull Request を作成する。

```bash
git checkout -b <作業ブランチ>     # 新規ブランチを作る場合
git add -A
git commit -m "<変更内容>"
git push -u origin <作業ブランチ>
```

---

## 4. 品質チェック（コミット前に実行）

```bash
npm run lint        # ESLint（next/core-web-vitals + next/typescript ルール）
npm run typecheck   # 型チェック（tsc --noEmit）
npm test            # ユニットテスト（Vitest）
npm run build       # 本番ビルド（型チェック込み）
```

- **lint**: `eslint.config.mjs`（フラット設定）。`.next` や生成物は除外済み。
- **typecheck**: 厳格モード（`tsconfig.json` の `strict: true`）。
- **test**: `src/**/*.test.ts` を対象。現状は純粋関数のユニットテスト。
  Reactコンポーネントの結合テストは将来追加予定。

---

## 5. データの追加・更新手順

学習コンテンツはコードとして管理しています。編集後は **再シード** が必要です
（比較データのみ再シード不要）。

| 対象 | 編集ファイル | 反映方法 |
|---|---|---|
| AWSサービス | `prisma/data/services-a.ts` / `services-b.ts` | `npm run db:seed` |
| 資格 | `prisma/data/certifications.ts` | `npm run db:seed` |
| クイズ | `prisma/data/quizzes.ts` | `npm run db:seed` |
| サービス比較 | `src/data/comparisons.ts` | 再シード不要（次回ビルドで反映） |

- 型定義は `prisma/data/types.ts` にあります。新項目を増やすときはここと
  `prisma/schema.prisma` を併せて更新します。
- シードは `upsert` で冪等です。既存の学習進捗・解答履歴は保持されます。
- スキーマ（`prisma/schema.prisma`）を変更した場合は `npm run db:push` を実行します。

---

## 6. ディレクトリ構成

```
.claude/
  hooks/session-start.sh  # Web セッションの環境準備フック
  settings.json           # フック登録
prisma/
  schema.prisma           # DBスキーマ（Service / Certification / Quiz / 進捗）
  seed.ts                 # シードスクリプト
  data/                   # サービス・資格・クイズの学習コンテンツ + 型定義
src/
  app/                    # 画面（App Router）と API ルート
  components/             # UI コンポーネント
  data/comparisons.ts     # サービス比較データ
  lib/                    # Prisma クライアント・共通ヘルパー（json, progress）
  lib/json.test.ts        # ユニットテスト例
docs/
  DEVELOPMENT.md          # 本書
  screenshots/            # 画面プレビュー
```

---

## 7. 機能と要件の対応

| 機能ID | 概要 | 主な実装 |
|---|---|---|
| F001 | サービス検索 | `src/app/services/page.tsx`, `components/ServiceExplorer.tsx` |
| F002 | サービス詳細 | `src/app/services/[id]/page.tsx` |
| F003 | サービス比較 | `src/app/compare/page.tsx`, `data/comparisons.ts` |
| F004 | 資格別学習 | `src/app/certifications/**` |
| F005 | 学習進捗管理 | `src/app/api/progress/route.ts`, `components/ProgressControls.tsx` |
| F006 | クイズ | `src/app/quiz/page.tsx`, `components/QuizPlayer.tsx` |
| F007 | ダッシュボード | `src/app/page.tsx` |

---

## 8. 将来構想（Phase 2 / 3）

- Phase 2: AWS全冠ロードマップ生成 / AI学習アシスタント / RAG検索 / Bedrock連携
- Phase 3: 学習コミュニティ / ランキング / 模擬試験生成 / 合格予測

PostgreSQL への移行を見据え、配列項目は JSON 文字列で保存しています
（SQLite 固有機能に依存しない設計）。移行時は `prisma/schema.prisma` の
`datasource` を変更し、`DATABASE_URL` を環境変数化します。
