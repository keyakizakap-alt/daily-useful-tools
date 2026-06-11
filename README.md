# 📸 スクショ・ナレッジベース

スマートフォンのスクリーンショットをアップロードすると、AI（Gemini）が自動でテキスト（OCR）・カテゴリ・タグを解析して整理するナレッジベースです。

**ランニングコスト0円**（Vercel / Supabase / Google AI Studio の無料枠のみ）と、**RLSによるセキュアなデータ分離**を両立しています。

## 技術スタック

| レイヤー | 技術 | 無料枠 |
| --- | --- | --- |
| フロント / バックエンド | Next.js (App Router, TypeScript, Tailwind CSS) | Vercel Hobby |
| データベース | Supabase Database (Postgres) | 500MB |
| 画像ストレージ | Supabase Storage（プライベートバケット） | 1GB |
| 認証 | Supabase Auth（メール/パスワード・Google OAuth） | MAU 50,000 |
| AI解析 | Google AI Studio — Gemini 2.5 Flash（`@google/genai` SDK） | 無料枠あり |

> **Note:** 旧SDK `@google/generative-ai` と Gemini 1.5 Flash は提供終了したため、後継の公式SDK `@google/genai` + Gemini 2.5 Flash を使用しています（`GEMINI_MODEL` 環境変数で変更可）。

## セキュリティ設計

- **DBのRLS**: `screenshots` テーブルは `auth.uid() = user_id` のときのみ SELECT / INSERT / UPDATE / DELETE 可能。
- **StorageのRLS**: バケット `screenshots` は非公開。パス規約 `{user_id}/{uuid}.{ext}` の先頭フォルダ名と `auth.uid()` の一致を強制。画像表示は有効期限付きの署名付きURL。
- **APIルートの認可**: `/api/analyze` はユーザーのセッションCookieで動く Supabase クライアントを使用するため、RLSがサーバー側でもそのまま効く（Service Role Key は不使用）。
- **機密情報**: すべて `.env.local` / Vercel 環境変数で管理。`GEMINI_API_KEY` はサーバー側のみで参照され、クライアントには露出しない。
- **AI学習への不使用**: Google AI Studio のAPIキーを Pay-as-you-go（課金有効）プロジェクトに紐付けると、送信データはモデル学習に使用されません（無料枠の範囲内なら請求も発生しません）。

## セットアップ手順

### 1. Supabase プロジェクトの作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成（Freeプラン）。
2. ダッシュボードの **SQL Editor** で [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) を実行。
   - `screenshots` テーブル + RLSポリシー、プライベートバケット + Storageポリシーが作成されます。
3. Googleログインを使う場合: **Authentication > Providers > Google** を有効化し、Google Cloud Console で OAuth クライアントを作成して Client ID / Secret を設定。

### 2. Google AI Studio の APIキー取得

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) でAPIキーを作成。
2. （推奨）データを学習に使わせないため、課金を有効化したGoogle Cloudプロジェクトに紐付ける。

### 3. ローカル環境

```bash
cp .env.local.example .env.local
# .env.local に Supabase の URL / Anon Key と GEMINI_API_KEY を記入

npm install
npm run dev
```

http://localhost:3000 を開き、サインアップ → スクショをアップロードすると自動解析されます。

### 4. Vercel へのデプロイ

1. リポジトリを Vercel にインポート。
2. **Settings > Environment Variables** に以下を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
   - （任意）`GEMINI_MODEL`
3. Supabase の **Authentication > URL Configuration** で Site URL / Redirect URL に Vercel のドメイン（`https://xxx.vercel.app/auth/callback`）を追加。

## 主要な処理フロー

```
[ブラウザ] ─ 画像アップロード ─▶ Supabase Storage（RLS: 自分のフォルダのみ）
     │                              │
     ├─ レコード作成 ─────────▶ screenshots テーブル（status: pending）
     │
     └─ POST /api/analyze ─▶ [Route Handler]
                                │ 1. セッション検証（Cookie）
                                │ 2. 画像をストレージからダウンロード（RLS適用）
                                │ 3. Gemini に画像送信 → JSON（OCR/要約/カテゴリ/タグ）
                                └ 4. DBを status: analyzed に更新
```

## ディレクトリ構成

```
supabase/migrations/0001_init.sql  … スキーマ + RLSポリシー
src/
  proxy.ts                         … セッション更新・未ログインリダイレクト (旧 middleware)
  lib/
    types.ts                       … 共通型定義
    gemini.ts                      … Gemini 解析（構造化JSON出力）
    supabase/{client,server,middleware}.ts
  app/
    login/page.tsx                 … サインイン / サインアップ / Googleログイン
    auth/callback/route.ts         … OAuth コールバック
    api/analyze/route.ts           … AI解析エンドポイント
    dashboard/                     … 一覧・検索・タグ絞り込み・アップロード
```
