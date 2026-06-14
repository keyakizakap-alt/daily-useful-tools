import { z } from "zod";
import { requireEntitledUser, requireUser, json, error } from "@/lib/api";
import { canAddMockExam, incrementUsage } from "@/lib/entitlements";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DomainScore = z.object({ domain: z.string().max(100), correctRate: z.number().min(0).max(100) });

const CreateMock = z.object({
  goalId: z.string().uuid(),
  takenAt: z.string().date(),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  domainBreakdown: z.array(DomainScore).max(30).default([]),
  memo: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const goalId = new URL(req.url).searchParams.get("goalId");
  const supabase = createSupabaseServerClient();
  let q = supabase.from("mock_exam_results").select("*").eq("user_id", user!.id);
  if (goalId) q = q.eq("goal_id", goalId);
  const { data, error: e } = await q.order("taken_at", { ascending: false }).limit(100);
  if (e) return error(e.message, 500);
  return json({ results: data });
}

export async function POST(req: Request) {
  const { user, ent, response } = await requireEntitledUser();
  if (response) return response;

  // サーバーサイドのゲート: Freeは月2回まで
  const gate = canAddMockExam(ent);
  if (!gate.ok) return error(gate.reason, 403, { upsell: gate.upsell });

  const parsed = CreateMock.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("入力値が不正です", 422, { issues: parsed.error.flatten() });

  const { score, maxScore, domainBreakdown } = parsed.data;
  if (score > maxScore) return error("スコアが満点を超えています", 422);

  const correctRate = Math.round((score / maxScore) * 1000) / 10;
  // 正答率の低い分野を弱点として抽出
  const weakDomains = [...domainBreakdown]
    .sort((a, b) => a.correctRate - b.correctRate)
    .filter((d) => d.correctRate < 70)
    .slice(0, 5)
    .map((d) => d.domain);

  const supabase = createSupabaseServerClient();
  const { data, error: e } = await supabase
    .from("mock_exam_results")
    .insert({
      user_id: user.id,
      goal_id: parsed.data.goalId,
      taken_at: parsed.data.takenAt,
      score,
      max_score: maxScore,
      correct_rate: correctRate,
      domain_breakdown_json: domainBreakdown,
      weak_domains_json: weakDomains,
      memo: parsed.data.memo ?? null,
    })
    .select()
    .single();
  if (e) return error(e.message, 500);

  // Free のみ usage 消費（Proは無制限なのでカウント不要）
  if (ent.plan.limits.mockExams !== null) {
    await incrementUsage(user.id, "mock_exam_count");
  }

  return json({ result: data }, 201);
}
