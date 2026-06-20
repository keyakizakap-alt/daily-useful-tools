// ===========================================================================
// サーバーサイドの権限解決 (Feature Gate のコア)
// 「いまこのユーザーが実際に使えるプラン/上限/残回数」を一元的に返す。
// API Route とサーバーコンポーネントの両方からここを通す。
// ===========================================================================
import { createSupabaseAdminClient } from "./supabase/admin";
import {
  PLANS,
  resolveEffectivePlan,
  remaining,
  type Plan,
  type PlanId,
  type SubStatus,
} from "./plans";

export interface UsageRow {
  ai_review_count: number;
  plan_generation_count: number;
  mock_exam_count: number;
  period_start: string;
  period_end: string;
}

export interface Entitlements {
  userId: string;
  plan: Plan; // 実効プラン（解約・支払い失敗を反映済み）
  rawPlan: PlanId; // DB上のプラン
  status: SubStatus | string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  usage: UsageRow;
  goalsCount: number;
  paymentIssue: boolean; // past_due / unpaid 等の支払い警告フラグ
}

function monthPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** 当月の usage 行を取得（無ければ作成）。service_role で操作。 */
async function getOrCreateUsage(userId: string): Promise<UsageRow> {
  const admin = createSupabaseAdminClient();
  const { start, end } = monthPeriod();

  const { data: existing } = await admin
    .from("usage_limits")
    .select("ai_review_count, plan_generation_count, mock_exam_count, period_start, period_end")
    .eq("user_id", userId)
    .eq("period_start", start)
    .maybeSingle();

  if (existing) return existing as UsageRow;

  const { data: inserted } = await admin
    .from("usage_limits")
    .insert({ user_id: userId, period_start: start, period_end: end })
    .select("ai_review_count, plan_generation_count, mock_exam_count, period_start, period_end")
    .single();

  return (inserted as UsageRow) ?? {
    ai_review_count: 0,
    plan_generation_count: 0,
    mock_exam_count: 0,
    period_start: start,
    period_end: end,
  };
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const admin = createSupabaseAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan, status, cancel_at_period_end, current_period_end")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawPlan = (sub?.plan as PlanId) ?? "free";
  const status = (sub?.status as SubStatus) ?? "active";
  const currentPeriodEnd = sub?.current_period_end ?? null;

  const plan = resolveEffectivePlan({ plan: rawPlan, status, currentPeriodEnd });

  const usage = await getOrCreateUsage(userId);

  const { count: goalsCount } = await admin
    .from("user_certification_goals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "archived");

  return {
    userId,
    plan,
    rawPlan,
    status,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    currentPeriodEnd,
    usage,
    goalsCount: goalsCount ?? 0,
    paymentIssue: ["past_due", "unpaid", "incomplete"].includes(status),
  };
}

// --------------------------- ゲート判定 ---------------------------

export type GateResult = { ok: true } | { ok: false; reason: string; upsell: boolean };

export function canAddGoal(ent: Entitlements): GateResult {
  const max = ent.plan.limits.maxCertGoals;
  if (max === null) return { ok: true };
  if (ent.goalsCount < max) return { ok: true };
  return {
    ok: false,
    reason: `Freeプランで登録できる資格は${max}件までです。Proにアップグレードすると無制限に登録できます。`,
    upsell: true,
  };
}

export function canGeneratePlan(ent: Entitlements, isRegeneration: boolean): GateResult {
  const limit = ent.plan.limits.planRegenerations;
  if (limit === null) return { ok: true }; // Pro: 無制限
  if (!isRegeneration) return { ok: true }; // 初回生成は常に許可
  if (remaining(limit, ent.usage.plan_generation_count) > 0) return { ok: true };
  return {
    ok: false,
    reason: "Freeプランでは学習計画の再生成はできません。Proにアップグレードすると何度でも作り直せます。",
    upsell: true,
  };
}

export function canRunAiReview(ent: Entitlements): GateResult {
  const limit = ent.plan.limits.aiReviews;
  if (limit === null) return { ok: true };
  if (remaining(limit, ent.usage.ai_review_count) > 0) return { ok: true };
  return {
    ok: false,
    reason: `Freeプランのai週次レビューは月${limit}回までです。Proで毎週のレビューを受け取れます。`,
    upsell: true,
  };
}

export function canAddMockExam(ent: Entitlements): GateResult {
  const limit = ent.plan.limits.mockExams;
  if (limit === null) return { ok: true };
  if (remaining(limit, ent.usage.mock_exam_count) > 0) return { ok: true };
  return {
    ok: false,
    reason: `Freeプランの模試結果登録は月${limit}回までです。Proで無制限に記録できます。`,
    upsell: true,
  };
}

export function requireFeature(
  ent: Entitlements,
  feature: keyof Plan["features"],
): GateResult {
  if (ent.plan.features[feature]) return { ok: true };
  return { ok: false, reason: "この機能はProプラン限定です。", upsell: true };
}

/** usage カウンタを原子的に+1する（service_role）。 */
export async function incrementUsage(
  userId: string,
  field: "ai_review_count" | "plan_generation_count" | "mock_exam_count",
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { start } = monthPeriod();
  // 既存行を取得して +1 で update（RPCが無い前提のシンプル実装）
  const { data } = await admin
    .from("usage_limits")
    .select(`id, ${field}`)
    .eq("user_id", userId)
    .eq("period_start", start)
    .maybeSingle();
  if (!data) {
    await getOrCreateUsage(userId);
  }
  const current = (data as any)?.[field] ?? 0;
  await admin
    .from("usage_limits")
    .update({ [field]: current + 1 })
    .eq("user_id", userId)
    .eq("period_start", start);
}

export { PLANS };
