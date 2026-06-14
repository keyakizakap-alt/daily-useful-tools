// サーバーコンポーネント用の読み取りクエリ（RLS適用のユーザーセッションで実行）。
import { createSupabaseServerClient } from "./supabase/server";

export async function listGoals() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("user_certification_goals")
    .select("*, certification:certifications(*)")
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listCertifications() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("certifications")
    .select("*")
    .eq("is_active", true)
    .order("category");
  return data ?? [];
}

export async function getGoalDetail(goalId: string) {
  const supabase = createSupabaseServerClient();
  const { data: goal } = await supabase
    .from("user_certification_goals")
    .select("*, certification:certifications(*)")
    .eq("id", goalId)
    .maybeSingle();
  return goal;
}

/** ダッシュボード用の集計を一括取得。 */
export async function getDashboardData() {
  const supabase = createSupabaseServerClient();
  const goals = await listGoals();
  const primary = goals[0] ?? null;
  if (!primary) return { goals, primary: null as any, today: [], weekProgress: 0, weakTop3: [], passProbability: null };

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [{ data: today }, { data: weekTasks }, { data: mocks }, { data: review }] = await Promise.all([
    supabase.from("study_tasks").select("*").eq("goal_id", primary.id).eq("task_date", todayStr).order("estimated_minutes"),
    supabase.from("study_tasks").select("status").eq("goal_id", primary.id).gte("task_date", weekAgo).lte("task_date", todayStr),
    supabase.from("mock_exam_results").select("weak_domains_json, domain_breakdown_json").eq("goal_id", primary.id).order("taken_at", { ascending: false }).limit(3),
    supabase.from("ai_reviews").select("pass_probability").eq("goal_id", primary.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const total = (weekTasks ?? []).length;
  const done = (weekTasks ?? []).filter((t: any) => t.status === "done").length;
  const weekProgress = total ? Math.round((done / total) * 100) : 0;

  const weakCount: Record<string, number> = {};
  (mocks ?? []).forEach((m: any) =>
    (m.weak_domains_json ?? []).forEach((d: string) => (weakCount[d] = (weakCount[d] ?? 0) + 1)),
  );
  const weakTop3 = Object.entries(weakCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);

  return {
    goals,
    primary,
    today: today ?? [],
    weekProgress,
    weakTop3,
    passProbability: (review as any)?.pass_probability ?? null,
  };
}
