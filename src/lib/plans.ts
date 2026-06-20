// ===========================================================================
// プラン定義 & Feature Gate のソース・オブ・トゥルース
// フロント表示・サーバー権限チェックの両方でこの定義を参照する。
// ===========================================================================

export type PlanId = "free" | "pro_monthly" | "pro_yearly";

export type SubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";

/** 月あたりの利用上限。null = 無制限。 */
export interface PlanLimits {
  maxCertGoals: number | null; // 登録できる学習目標(資格)数
  planRegenerations: number | null; // 学習計画の再生成回数 / 月
  aiReviews: number | null; // AIレビュー回数 / 月
  mockExams: number | null; // 模試結果登録数 / 月
}

export interface PlanFeatures {
  passProbability: boolean; // 合格可能性スコア
  fullWeaknessAnalysis: boolean; // 詳細な弱点分析
  reviewSuggestions: boolean; // 復習提案
  notifications: boolean; // 通知
  csvExport: boolean; // CSVエクスポート
  multiCertDashboard: boolean; // 複数資格ダッシュボード
}

export interface Plan {
  id: PlanId;
  label: string;
  priceLabel: string;
  isPro: boolean;
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    priceLabel: "¥0",
    isPro: false,
    limits: {
      maxCertGoals: 1,
      planRegenerations: 0, // 初回生成のみ、再生成不可
      aiReviews: 1,
      mockExams: 2,
    },
    features: {
      passProbability: false,
      fullWeaknessAnalysis: false,
      reviewSuggestions: false,
      notifications: false,
      csvExport: false,
      multiCertDashboard: false,
    },
  },
  pro_monthly: {
    id: "pro_monthly",
    label: "Pro (月額)",
    priceLabel: "¥680 / 月",
    isPro: true,
    limits: {
      maxCertGoals: null,
      planRegenerations: null,
      aiReviews: null,
      mockExams: null,
    },
    features: {
      passProbability: true,
      fullWeaknessAnalysis: true,
      reviewSuggestions: true,
      notifications: true,
      csvExport: true,
      multiCertDashboard: true,
    },
  },
  pro_yearly: {
    id: "pro_yearly",
    label: "Pro (年額)",
    priceLabel: "¥5,980 / 年",
    isPro: true,
    limits: {
      maxCertGoals: null,
      planRegenerations: null,
      aiReviews: null,
      mockExams: null,
    },
    features: {
      passProbability: true,
      fullWeaknessAnalysis: true,
      reviewSuggestions: true,
      notifications: true,
      csvExport: true,
      multiCertDashboard: true,
    },
  },
};

/**
 * サブスクの状態とプランから「いま実際にProとして扱ってよいか」を判定する。
 * - 解約予約(cancel_at_period_end)中でも current_period_end まではProを維持。
 * - past_due / unpaid / incomplete は支払い未確定のためPro機能を停止。
 */
export function resolveEffectivePlan(args: {
  plan: PlanId;
  status: SubStatus | string;
  currentPeriodEnd: Date | string | null;
}): Plan {
  const planDef = PLANS[(args.plan as PlanId)] ?? PLANS.free;
  if (!planDef.isPro) return PLANS.free;

  const okStatuses = new Set(["active", "trialing"]);
  if (okStatuses.has(args.status)) return planDef;

  // canceled でも期間内ならProを維持する（解約後、請求期間終了まで）
  if (args.status === "canceled" && args.currentPeriodEnd) {
    const end = new Date(args.currentPeriodEnd);
    if (end.getTime() > Date.now()) return planDef;
  }

  // past_due / unpaid / incomplete / 期限切れ canceled → Free に落とす
  return PLANS.free;
}

export type LimitKey = keyof PlanLimits;

/** 残回数を計算。null(無制限)なら Infinity を返す。 */
export function remaining(limit: number | null, used: number): number {
  if (limit === null) return Infinity;
  return Math.max(0, limit - used);
}
