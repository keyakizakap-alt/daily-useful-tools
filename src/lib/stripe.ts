import Stripe from "stripe";
import type { PlanId } from "./plans";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
  typescript: true,
});

/** price_id は環境変数で管理する。 */
export const PRICE_IDS: Record<"pro_monthly" | "pro_yearly", string | undefined> = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
};

/** Stripe price_id から内部 PlanId を逆引きする。 */
export function planFromPriceId(priceId: string | null | undefined): PlanId {
  if (!priceId) return "free";
  if (priceId === PRICE_IDS.pro_monthly) return "pro_monthly";
  if (priceId === PRICE_IDS.pro_yearly) return "pro_yearly";
  return "free";
}
