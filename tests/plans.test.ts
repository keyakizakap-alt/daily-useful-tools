import { describe, it, expect } from "vitest";
import { resolveEffectivePlan, remaining, PLANS } from "@/lib/plans";

const future = new Date(Date.now() + 5 * 86400000).toISOString();
const past = new Date(Date.now() - 5 * 86400000).toISOString();

describe("resolveEffectivePlan", () => {
  it("active な Pro はProのまま", () => {
    const p = resolveEffectivePlan({ plan: "pro_monthly", status: "active", currentPeriodEnd: future });
    expect(p.isPro).toBe(true);
  });

  it("trialing もProとして扱う", () => {
    const p = resolveEffectivePlan({ plan: "pro_yearly", status: "trialing", currentPeriodEnd: future });
    expect(p.isPro).toBe(true);
  });

  it("解約済みでも期間内ならProを維持する", () => {
    const p = resolveEffectivePlan({ plan: "pro_monthly", status: "canceled", currentPeriodEnd: future });
    expect(p.isPro).toBe(true);
  });

  it("解約済みで期間終了後はFreeに戻る", () => {
    const p = resolveEffectivePlan({ plan: "pro_monthly", status: "canceled", currentPeriodEnd: past });
    expect(p.id).toBe("free");
  });

  it("past_due はPro機能を停止しFree扱い", () => {
    const p = resolveEffectivePlan({ plan: "pro_monthly", status: "past_due", currentPeriodEnd: future });
    expect(p.id).toBe("free");
  });

  it("unpaid もFree扱い", () => {
    const p = resolveEffectivePlan({ plan: "pro_yearly", status: "unpaid", currentPeriodEnd: future });
    expect(p.id).toBe("free");
  });

  it("free プランは常にFree", () => {
    const p = resolveEffectivePlan({ plan: "free", status: "active", currentPeriodEnd: null });
    expect(p.id).toBe("free");
  });
});

describe("remaining", () => {
  it("無制限(null)は Infinity", () => {
    expect(remaining(null, 100)).toBe(Infinity);
  });
  it("残数を返す", () => {
    expect(remaining(2, 1)).toBe(1);
  });
  it("超過しても0未満にならない", () => {
    expect(remaining(2, 5)).toBe(0);
  });
});

describe("PLANS 定義", () => {
  it("Freeは資格1件・再生成0・模試2・レビュー1", () => {
    expect(PLANS.free.limits).toMatchObject({
      maxCertGoals: 1, planRegenerations: 0, mockExams: 2, aiReviews: 1,
    });
  });
  it("Proは全機能ON・上限なし", () => {
    expect(PLANS.pro_monthly.limits.maxCertGoals).toBeNull();
    expect(PLANS.pro_monthly.features.passProbability).toBe(true);
  });
});
