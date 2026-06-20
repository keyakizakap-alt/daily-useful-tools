import { requireUser, json, error } from "@/lib/api";
import { stripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("users_profile")
    .select("stripe_customer_id")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return error("お客様情報が見つかりません。先にアップグレードしてください。", 400);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portal = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/billing`,
  });

  return json({ url: portal.url });
}
