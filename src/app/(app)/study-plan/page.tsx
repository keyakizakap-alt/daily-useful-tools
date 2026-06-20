import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { listGoals } from "@/lib/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SectionTitle, EmptyState } from "@/components/ui";
import StudyPlanView from "./StudyPlanView";

export const dynamic = "force-dynamic";

export default async function StudyPlanPage({
  searchParams,
}: {
  searchParams?: { goal?: string };
}) {
  const user = (await getCurrentUser())!;
  const ent = await getEntitlements(user.id);
  const goals = await listGoals();

  if (goals.length === 0) {
    return (
      <EmptyState
        title="まだ学習計画はありません"
        desc="まずは目標の資格を登録すると、AIが学習計画を作成します。"
        cta={<Link href="/certifications" className="btn-primary">資格を登録する</Link>}
      />
    );
  }

  const selectedId =
    goals.find((g: any) => g.id === searchParams?.goal)?.id ?? goals[0].id;

  const supabase = createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("study_plans")
    .select("*")
    .eq("goal_id", selectedId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: tasks } = await supabase
    .from("study_tasks")
    .select("*")
    .eq("goal_id", selectedId)
    .order("task_date", { ascending: true })
    .order("estimated_minutes", { ascending: true });

  const hasPlan = !!plan;
  // Free: planRegenerations === 0 → 既存計画がある場合は再生成不可
  const canRegenerate = ent.plan.limits.planRegenerations !== 0;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="学習計画"
        desc="試験日までの道のりを、週ごと・日ごとのタスクに分解します。"
      />
      <StudyPlanView
        goals={goals.map((g: any) => ({
          id: g.id,
          name: g.certification?.name ?? "資格",
          domains: g.certification?.domains ?? [],
        }))}
        selectedGoalId={selectedId}
        tasks={(tasks ?? []) as any[]}
        plan={plan as any}
        hasPlan={hasPlan}
        canRegenerate={canRegenerate}
      />
    </div>
  );
}
