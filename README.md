# 🐾 ポチパス — 資格学習AIコーチ

ベンダー認定資格（AWS / Azure / Google Cloud）と IPA 資格の合格を目指す学習者向けの、
**進捗管理・弱点管理・学習習慣化** に特化したサブスク型 Web アプリです。

> ポチパスは問題集ではありません。実際の試験問題は扱わず、あなたの **学習ログ・模試結果・公式シラバスの分野情報** をもとに AI が学習計画・弱点分析・週次レビューで伴走します。

## ✨ 主な機能

- 🗓️ 試験日から逆算した学習計画（AI生成・再生成）
- ✅ 毎日の学習タスク提示と完了チェック
- 📝 学習ログ管理（時間・内容・理解度・メモ）
- 📊 模試結果の記録と分野別正答率
- 🎯 弱点カテゴリの可視化・復習優先度
- 🤖 AI による週次レビューと合格可能性スコア
- 💳 Stripe によるサブスク課金（プラン変更・解約・支払い失敗対応）

## 🧱 技術スタック

| 領域 | 採用技術 |
|---|---|
| フレームワーク | Next.js 14 (App Router) / TypeScript |
| スタイル | Tailwind CSS |
| 認証・DB | Supabase Auth / PostgreSQL / Row Level Security |
| ORM/スキーマ | Prisma（スキーマ管理） + Supabase Client（RLSクエリ） |
| 課金 | Stripe Billing（Checkout / Customer Portal / Webhook） |
| AI | LLM Provider 抽象化層（OpenAI / Mock を差し替え可能） |
| デプロイ | Vercel |

## 📁 ディレクトリ構成

```
src/
  app/
    page.tsx                LP（概要・対象資格・料金・FAQ）
    login/                  認証（メール / Google）
    auth/callback/          OAuth・メール確認コールバック
    auth/signout/           ログアウト
    (app)/                  認証必須エリア（共通ナビ）
      dashboard/            ダッシュボード
      certifications/       資格管理・学習目標登録
      study-plan/           学習計画（AI生成）
      logs/                 学習ログ
      mock-exams/           模試・演習結果
      weakness/             弱点分析
      review/               AI週次レビュー
      billing/              課金管理
    api/
      goals/                学習目標 CRUD（Feature Gate）
      study-plan/generate/  学習計画生成（AI + Gate）
      tasks/[id]/           タスク完了更新
      logs/                 学習ログ
      mock-exams/           模試結果（Gate）
      review/generate/      AI週次レビュー（AI + Gate）
      stripe/checkout/      Stripe Checkout
      stripe/portal/        Customer Portal
      stripe/webhook/       Webhook（署名検証・冪等性）
  components/               UI共通部品・ナビ
  lib/
    plans.ts               プラン定義・実効プラン解決
    entitlements.ts        サーバーサイド権限解決（Feature Gateの核）
    stripe.ts              Stripeクライアント・price_id管理
    ai/                    LLM抽象化層・プロンプト・モック
    supabase/              server / client / admin クライアント
    queries.ts             サーバー読み取りクエリ
    certifications-data.ts 資格マスタ + 公式シラバス分野メタ
prisma/schema.prisma       Prismaスキーマ
supabase/migrations/       テーブル + RLSポリシー SQL
scripts/seed-certifications.ts  資格マスタ投入
tests/                     Vitest（プラン解決・Feature Gate）
```

## 🚀 セットアップ

### 1. 依存インストール
```bash
npm install
```

### 2. 環境変数
```bash
cp .env.example .env.local
# 各値を埋める（下記「環境変数」参照）
```

### 3. Supabase（DB + RLS）
Supabase プロジェクトを作成し、SQL Editor で以下を実行：
```
supabase/migrations/0001_init.sql
```
（または Supabase CLI: `supabase db push`）

Prisma で型生成：
```bash
npm run prisma:generate
```

### 4. 資格マスタ投入
```bash
npm run db:seed
```

### 5. Stripe
- Stripe ダッシュボードで商品「Pro 月額(¥680)」「Pro 年額(¥5,980)」を作成し、
  それぞれの **price_id** を `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` に設定。
- ローカルで Webhook を受ける：
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# 表示される whsec_... を STRIPE_WEBHOOK_SECRET に設定
```

### 6. 開発サーバー
```bash
npm run dev   # http://localhost:3000
```
> `LLM_PROVIDER=mock` のままなら OpenAI のキー無しでも AI 機能が動作します（開発用）。

## 🔑 環境変数

`.env.example` を参照。主なもの：

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | Supabase 公開鍵（クライアント可） |
| `SUPABASE_SERVICE_ROLE_KEY` | **サーバー専用**。Webhook・課金更新に使用 |
| `DATABASE_URL` | Prisma 用 Postgres 接続 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe |
| `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` | price_id（環境変数管理） |
| `LLM_PROVIDER` | `openai` または `mock` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI 利用時 |

## 🔒 セキュリティ設計

- 全ユーザーテーブルで **RLS 有効**。`auth.uid() = user_id` のみ参照・更新可。
- `subscriptions` / `usage_limits` はユーザーは閲覧のみ。書き込みはサーバー（service_role）経由。
- Stripe Webhook は **署名検証**（`constructEvent`）必須。`webhook_events` で **冪等性** を担保。
- Service Role Key / OpenAI Key はサーバーサイドのみ。クライアントへ露出しない。
- Pro 限定機能は **API・DB 側でも** 権限チェック（`src/lib/entitlements.ts`）。フロント制御に依存しない。
- 全 API 入力を **zod** でバリデーション。
- AI には個人特定情報（メール・自由記述メモ等）を渡さず、分野名と統計値のみ送信。

## 🤖 AI 設計

- `src/lib/ai/provider.ts` の `LLMProvider` インターフェースでプロバイダーを抽象化。
  将来 Anthropic 等へ差し替え可能。
- プロンプト（`src/lib/ai/prompts.ts`）に **実試験問題を生成・転載しない** ガードレールを実装。
- AI 出力には常に「参考情報であり公式シラバス・公式試験ガイドを確認してください」という免責を表示。

## 🧪 テスト

```bash
npm run test       # Vitest
npm run typecheck  # tsc --noEmit
```
プラン解決ロジック（解約・支払い失敗時の挙動）と Feature Gate を中心にカバー。

## ☁️ デプロイ

[`DEPLOY.md`](./DEPLOY.md) を参照。

## ⚠️ 免責

本アプリが提示する学習計画・スコア・レビューはすべて参考情報です。
実際の出題範囲・配点・合格基準は必ず各資格の公式シラバス・公式試験ガイドをご確認ください。
