// OAuth / メール確認後のコールバック。codeをセッションに交換し、
// 初回ログイン時に users_profile と subscriptions(free) を用意する。
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await ensureUserRecords(user.id, user.email ?? null);
      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

async function ensureUserRecords(userId: string, email: string | null) {
  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from("users_profile")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    await admin.from("users_profile").insert({
      user_id: userId,
      display_name: email?.split("@")[0] ?? "ゲスト",
    });
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!sub) {
    await admin.from("subscriptions").insert({
      user_id: userId,
      plan: "free",
      status: "active",
    });
  }
}
