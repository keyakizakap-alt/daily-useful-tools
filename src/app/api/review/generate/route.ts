import { z } from "zod";
import { requireEntitledUser, json, error } from "@/lib/api";
import { canRunAiReview, incrementUsage } from "@/lib/entitlements";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLLMProvider, AI_DISCLAIMER } from "@/lib/ai/provider";
import { buildWeeklyReviewMessages } from "@/lib/ai/prompts";

const Body = z.object({ goalId: z.string().uuid() });

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

export async function POST(req: Request) {
  const { user, ent, response } = await requireEntitledUser();
  if (response) return response;

  const gate = canRunAiReview(ent);
  if (!gate.ok) return error(gate.reason, 403, { upsell: gate.upsell });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("入力値が不正です", 422);

  const supabase = createSupabaseServerClient();
  const { data: goal } = await supabase
    .from("user_certification_goals")
    .select("*, certification:certifications(*)")
    .eq("id", parsed.data.goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return error("学習目標が見つかりません", 404);

  // --- 集計（個人を特定する自由記述メモはAIに渡さない。数値と分野名のみ集計）---
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: logs } = await supabase
    .from("study_logs")
    .select("minutes")
    .eq("goal_id", goal.id)
    .gte("studied_at", weekAgo);
  const weeklyMinutes = (logs ?? []).reduce((s, l: any) => s + (l.minutes ?? 0), 0);

  const { data: tasks } = await supabase
    .from("study_tasks")
    .select("status")
    .eq("goal_id", goal.id)
    .gte("task_date", weekAgo)
    .lte("task_date", new Date().toISOString().slice(0, 10));
  const total = (tasks ?? []).length;
  const done = (tasks ?? []).filter((t: any) => t.status === "done").length;
  const taskCompletionRate = total ? done / total : 0;

  const { data: mocks } = await supabase
    .from("mock_exam_results")
    .select("correct_rate, weak_domains_json")
    .eq("goal_id", goal.id)
    .order("taken_at", { ascending: false })
    .limit(3);
  const latestCorrectRate = mocks?.[0]?.correct_rate ?? null;
  const weakDomains = Array.from(
    new Set((mocks ?? []).flatMap((m: any) => (m.weak_domains_json ?? []) as string[])),
  ).slice(0, 5);

  const daysToExam = goal.exam_date
    ? daysBetween(new Date(), new Date(goal.exam_date))
    : null;

  const provider = getLLMProvider();
  const messages = buildWeeklyReviewMessages({
    certName: goal.certification?.name ?? "資格",
    daysToExam,
    weeklyMinutes,
    taskCompletionRate,
    latestCorrectRate,
    weakDomains,
    recentLogSummary: `週間学習${weeklyMinutes}分 / タスク${done}/${total}完了`,
  });

  let review: any;
  try {
    review = JSON.parse(await provider.completeJSON(messages));
  } catch {
    return error("AIの応答を解析できませんでした。", 502);
  }

  // 合格可能性スコアはPro限定機能。Freeには返さない（サーバー側でマスク）。
  const passProbability = ent.plan.features.passProbability
    ? (typeof review.pass_probability === "number" ? review.pass_probability : null)
    : null;

  const content = [
    review.progress_summary,
    "",
    "▼ 来週の重点",
    ...(review.next_week_focus ?? []).map((s: string) => `・${s}`),
    "",
    "▼ リスク",
    ...(review.risks ?? []).map((s: string) => `・${s}`),
    "",
    review.encouragement,
  ].join("\n");

  const { data: saved, error: e } = await supabase
    .from("ai_reviews")
    .insert({
      user_id: user.id,
      goal_id: goal.id,
      review_type: "weekly",
      content,
      pass_probability: passProbability,
      weak_domains_json: review.weak_domains ?? weakDomains,
      next_actions_json: review.next_actions ?? [],
    })
    .select()
    .single();
  if (e) return error(e.message, 500);

  // Free のみ usage 消費
  if (ent.plan.limits.aiReviews !== null) {
    await incrementUsage(user.id, "ai_review_count");
  }

  return json({
    review: saved,
    passProbability,
    nextActions: review.next_actions ?? [],
    weakDomains: review.weak_domains ?? weakDomains,
    disclaimer: AI_DISCLAIMER,
  }, 201);
}
