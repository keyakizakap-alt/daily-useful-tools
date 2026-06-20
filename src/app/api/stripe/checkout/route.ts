import { z } from "zod";
import { requireUser, json, error } from "@/lib/api";
import { stripe, PRICE_IDS } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ plan: z.enum(["pro_monthly", "pro_yearly"]) });

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("プラン指定が不正です", 422);

  const priceId = PRICE_IDS[parsed.data.plan];
  if (!priceId) return error("price_id が設定されていません（環境変数を確認）", 500);

  const admin = createSupabaseAdminClient();

  // 既存の Stripe Customer を再利用、無ければ作成して紐付け
  const { data: profile } = await admin
    .from("users_profile")
    .select("stripe_customer_id")
    .eq("user_id", user!.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user!.email,
      metadata: { supabase_user_id: user!.id },
    });
    customerId = customer.id;
    await admin.from("users_profile").update({ stripe_customer_id: customerId }).eq("user_id", user!.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    // user_id を必ず metadata に載せ、Webhook で確実に紐付けできるようにする
    subscription_data: { metadata: { supabase_user_id: user!.id } },
    metadata: { supabase_user_id: user!.id },
    success_url: `${appUrl}/billing?status=success`,
    cancel_url: `${appUrl}/billing?status=cancel`,
  });

  return json({ url: session.url });
}
