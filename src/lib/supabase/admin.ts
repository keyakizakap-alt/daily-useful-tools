// service_role を使うサーバー専用クライアント。RLSをバイパスする。
// Stripe Webhook や subscriptions / usage_limits の書き込みなど、
// 「ユーザーセッションでは権限がない」サーバー処理でのみ使用すること。
// 絶対にクライアントへ import しない（"use client" から参照禁止）。
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase admin client requires SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
