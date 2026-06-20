import { describe, it, expect } from "vitest";
import {
  canAddGoal, canGeneratePlan, canRunAiReview, canAddMockExam, requireFeature,
  type Entitlements,
} from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";

function ent(overrides: Partial<Entitlements> = {}): Entitlements {
  return {
    userId: "u1",
    plan: PLANS.free,
    rawPlan: "free",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    usage: { ai_review_count: 0, plan_generation_count: 0, mock_exam_count: 0, period_start: "", period_end: "" },
    goalsCount: 0,
    paymentIssue: false,
    ...overrides,
  };
}

describe("canAddGoal", () => {
  it("Freeは1件まで登録可", () => {
    expect(canAddGoal(ent({ goalsCount: 0 })).ok).toBe(true);
  });
  it("Freeで上限到達なら拒否", () => {
    const r = canAddGoal(ent({ goalsCount: 1 }));
    expect(r.ok).toBe(false);
  });
  it("Proは無制限", () => {
    expect(canAddGoal(ent({ plan: PLANS.pro_monthly, goalsCount: 50 })).ok).toBe(true);
  });
});

describe("canGeneratePlan", () => {
  it("Freeでも初回生成は許可", () => {
    expect(canGeneratePlan(ent(), false).ok).toBe(true);
  });
  it("Freeの再生成は拒否", () => {
    expect(canGeneratePlan(ent(), true).ok).toBe(false);
  });
  it("Proは再生成し放題", () => {
    expect(canGeneratePlan(ent({ plan: PLANS.pro_monthly }), true).ok).toBe(true);
  });
});

describe("canAddMockExam", () => {
  it("Free 月2回まで", () => {
    expect(canAddMockExam(ent({ usage: { ...ent().usage, mock_exam_count: 1 } })).ok).toBe(true);
    expect(canAddMockExam(ent({ usage: { ...ent().usage, mock_exam_count: 2 } })).ok).toBe(false);
  });
});

describe("canRunAiReview", () => {
  it("Free 月1回まで", () => {
    expect(canRunAiReview(ent({ usage: { ...ent().usage, ai_review_count: 0 } })).ok).toBe(true);
    expect(canRunAiReview(ent({ usage: { ...ent().usage, ai_review_count: 1 } })).ok).toBe(false);
  });
});

describe("requireFeature", () => {
  it("Freeは合格可能性スコア不可", () => {
    expect(requireFeature(ent(), "passProbability").ok).toBe(false);
  });
  it("ProはCSV出力可", () => {
    expect(requireFeature(ent({ plan: PLANS.pro_monthly }), "csvExport").ok).toBe(true);
  });
});
