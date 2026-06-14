import { z } from "zod";
import { requireEntitledUser, json, error } from "@/lib/api";
import { canGeneratePlan, incrementUsage } from "@/lib/entitlements";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/ai/provider";
import { buildStudyPlanMessages } from "@/lib/ai/prompts";
import { CERTIFICATIONS } from "@/lib/certifications-data";

const Body = z.object({
  goalId: z.string().uuid(),
  weakDomains: z.array(z.string()).max(20).default([]),
});

export async function POST(req: Request) {
  const { user, ent, response } = await requireEntitledUser();
  if (response) return response;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("入力値が不正です", 422);

  const supabase = createSupabaseServerClient();

  // 目標を取得（RLSで自分のものだけ）
  const { data: goal } = await supabase
    .from("user_certification_goals")
    .select("*, certification:certifications(*)")
    .eq("id", parsed.data.goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return error("学習目標が見つかりません", 404);

  // 既存プランの有無で「再生成」かどうかを判定
  const { count: existingPlans } = await supabase
    .from("study_plans")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goal.id);
  const isRegeneration = (existingPlans ?? 0) > 0;

  // サーバーサイドの権限チェック
  const gate = canGeneratePlan(ent, isRegeneration);
  if (!gate.ok) return error(gate.reason, 403, { upsell: gate.upsell });

  // 公式シラバスの分野メタ
  const certMeta = CERTIFICATIONS.find((c) => c.code === goal.certification?.code);
  const domains = certMeta?.domains ?? [];

  // --- AI呼び出し（個人情報は渡さない：分野名と数値のみ）---
  const provider = getLLMProvider();
  const messages = buildStudyPlanMessages({
    certName: goal.certification?.name ?? "資格",
    domains,
    examDate: goal.exam_date,
    dailyMinutes: goal.daily_available_minutes,
    currentLevel: goal.current_level,
    weakDomains: parsed.data.weakDomains,
    targetScore: goal.target_score,
  });

  let plan: any;
  try {
    plan = JSON.parse(await provider.completeJSON(messages));
  } catch {
    return error("AIの応答を解析できませんでした。時間をおいて再度お試しください。", 502);
  }

  // 古いプランを置き換える（再生成時）
  if (isRegeneration) {
    await supabase.from("study_plans").delete().eq("goal_id", goal.id).eq("user_id", user.id);
  }

  const { data: savedPlan, error: planErr } = await supabase
    .from("study_plans")
    .insert({
      user_id: user.id,
      goal_id: goal.id,
      title: plan.title ?? "学習計画",
      start_date: plan.start_date,
      end_date: plan.end_date,
      generated_by_ai: true,
    })
    .select()
    .single();
  if (planErr || !savedPlan) return error(planErr?.message ?? "保存に失敗しました", 500);

  const tasks = (plan.daily_tasks ?? []).slice(0, 400).map((t: any) => ({
    study_plan_id: savedPlan.id,
    user_id: user.id,
    goal_id: goal.id,
    task_date: t.task_date,
    title: String(t.title ?? "学習タスク").slice(0, 200),
    description: t.description ? String(t.description).slice(0, 500) : null,
    estimated_minutes: Math.min(600, Number(t.estimated_minutes) || goal.daily_available_minutes),
    domain: t.domain ? String(t.domain).slice(0, 100) : null,
  }));
  if (tasks.length) await supabase.from("study_tasks").insert(tasks);

  // 再生成時のみ usage を消費（初回生成は無料）
  if (isRegeneration && ent.plan.limits.planRegenerations !== null) {
    await incrementUsage(user.id, "plan_generation_count");
  }

  return json({
    plan: savedPlan,
    weeklyPlan: plan.weekly_plan ?? [],
    priorityDomains: plan.priority_domains ?? [],
    notes: plan.notes ?? "",
    taskCount: tasks.length,
  }, 201);
}
