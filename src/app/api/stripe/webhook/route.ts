// ===========================================================================
// Stripe Webhook
//  - 署名検証(constructEvent)必須
//  - webhook_events テーブルで冪等性を担保（同一 event.id は1度だけ処理）
//  - subscriptions テーブルを真実の источник として更新（service_role）
//  - raw body が必要なので bodyParser を無効化（App Router は req.text() でOK）
// ===========================================================================
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { planFromPriceId } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return new Response("Missing signature/secret", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // --- 冪等性: 既に処理済みなら 200 で即終了 ---
  const { error: insertErr } = await admin
    .from("webhook_events")
    .insert({ stripe_event_id: event.id, type: event.type, payload_json: event as any });
  if (insertErr) {
    // unique 制約違反 = 重複イベント。再処理しない。
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(admin, sub, session.metadata?.supabase_user_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(admin, sub);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await upsertSubscription(admin, sub);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          // past_due へ落とし、Pro機能を停止させる
          await admin
            .from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", invoice.subscription as string);
        }
        break;
      }
      default:
        break;
    }
  } catch (err: any) {
    // 処理失敗時は冪等レコードを消し、Stripeに再送させる
    await admin.from("webhook_events").delete().eq("stripe_event_id", event.id);
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}

async function upsertSubscription(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sub: Stripe.Subscription,
  fallbackUserId?: string,
) {
  // user_id の解決: subscription.metadata → customer.metadata → 既存行 → fallback
  let userId =
    (sub.metadata?.supabase_user_id as string | undefined) ?? fallbackUserId ?? undefined;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  if (!userId) {
    const { data: profile } = await admin
      .from("users_profile")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = profile?.user_id;
  }
  if (!userId) return; // 紐付け不能なら何もしない

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = sub.status === "canceled" ? "free" : planFromPriceId(priceId);

  const record = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    plan,
    status: sub.status,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  // 既存 subscription 行があれば更新、無ければ作成
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await admin.from("subscriptions").update(record).eq("id", existing.id);
  } else {
    await admin.from("subscriptions").insert(record);
  }
}
