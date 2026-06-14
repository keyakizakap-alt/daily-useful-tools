# デプロイ手順（Vercel + Supabase + Stripe）

## 1. Supabase 本番プロジェクト

1. [supabase.com](https://supabase.com) でプロジェクト作成。
2. SQL Editor で `supabase/migrations/0001_init.sql` を実行（テーブル + RLS）。
3. Authentication > Providers で **Email** と **Google** を有効化。
   - Google: OAuth クライアントを作成し、リダイレクト URL に
     `https://<your-domain>/auth/callback` と Supabase の
     `https://<project>.supabase.co/auth/v1/callback` を登録。
4. Project Settings > API から `URL` / `anon key` / `service_role key` を控える。
5. ローカルで資格マスタを投入：`SUPABASE_SERVICE_ROLE_KEY=... npm run db:seed`
   （または本番URLを指定して実行）。

## 2. Stripe 本番設定

1. 商品を2つ作成し price を発行：
   - Pro 月額 ¥680（recurring / monthly）→ `price_xxx`
   - Pro 年額 ¥5,980（recurring / yearly）→ `price_yyy`
2. Customer Portal を有効化（Settings > Billing > Customer portal）。
   - プラン変更・解約を許可する設定にする。
3. Webhook エンドポイントを追加：
   - URL: `https://<your-domain>/api/stripe/webhook`
   - 送信イベント:
     `checkout.session.completed`,
     `customer.subscription.created`,
     `customer.subscription.updated`,
     `customer.subscription.deleted`,
     `invoice.paid`,
     `invoice.payment_failed`
   - 発行された **Signing secret**（`whsec_...`）を控える。

## 3. Vercel

1. GitHub リポジトリを Vercel にインポート（Framework: Next.js）。
2. Environment Variables を設定（Production / Preview）：

   ```
   NEXT_PUBLIC_APP_URL=https://<your-domain>
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # Secret 扱い
   DATABASE_URL=...
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_PRICE_PRO_MONTHLY=price_xxx
   STRIPE_PRICE_PRO_YEARLY=price_yyy
   LLM_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```

3. Deploy 実行。
4. Supabase Authentication > URL Configuration の
   **Site URL** / **Redirect URLs** に本番ドメインを追加。

## 4. デプロイ後チェックリスト

- [ ] サインアップ → メール確認 → ダッシュボード遷移
- [ ] Google ログイン
- [ ] 資格登録（Freeは1件で上限）
- [ ] 学習計画生成（Freeは再生成不可）
- [ ] 学習ログ・模試結果登録（Freeの回数制限）
- [ ] AI週次レビュー生成
- [ ] Checkout で Pro 購入 → Webhook で `subscriptions` が更新される
- [ ] Pro 機能が解放される（合格可能性スコア等）
- [ ] Customer Portal で解約 → `cancel_at_period_end` 反映、期間内はPro維持
- [ ] 支払い失敗（テストカード `4000 0000 0000 0341`）→ `past_due` でPro停止
- [ ] Webhook 再送で重複処理されない（冪等性）

## コスト最適化メモ（個人開発）

- Supabase / Vercel / Stripe いずれも無料枠から開始可能。
- LLM コストは `gpt-4o-mini` 等の小型モデル + JSON モードで最小化。
- 初期は問題集DBを持たず、ユーザー入力と公式シラバス分野メタのみで運用。
