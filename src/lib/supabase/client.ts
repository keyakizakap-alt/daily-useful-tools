// ブラウザ(クライアントコンポーネント)用 Supabase クライアント。
// anon key のみ使用。service role key は絶対に持ち込まない。
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
