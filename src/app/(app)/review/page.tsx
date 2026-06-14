import Link from "next/link";
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { listGoals } from "@/lib/queries";
import { remaining } from "@/lib/plans";
import { Card, StatCard, Badge, SectionTitle, EmptyState } from "@/components/ui";
import ReviewPanel from "./ReviewPanel";

export const dynamic = "force-dynamic";

interface AiReview {
  id: string;
  content: string;
  pass_probability: number | null;
  created_at: string;
}

export default async function ReviewPage() {
  const user = (await getCurrentUser())!;
  const ent = await getEntitlements(user.id);
  const goals = await listGoals();

  if (goals.length === 0) {
    return (
      <EmptyState
        title="まずは目標の資格を登録しましょう"
        desc="資格を登録すると、毎週のAIレビューで学習を振り返れます。"
        cta={<Link href="/certifications" className="btn-primary">資格を登録する</Link>}
      />
    );
  }

  const primary = goals[0];
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("ai_reviews")
    .select("id, content, pass_probability, created_at")
    .eq("user_id", user.id)
    .eq("goal_id", primary.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = (data ?? []) as AiReview[];

  const limit = ent.plan.limits.aiReviews;
  const left = remaining(limit, ent.usage.ai_review_count);
  const showPassProbability = ent.plan.features.passProbability;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="AIレビュー"
        desc="この1週間の頑張りをAIが振り返り、来週の一歩を一緒に考えます。"
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="これまでのレビュー" value={`${history.length}件`} />
        <StatCard
          label="今月の残り生成"
          accent
          value={limit === null ? "無制限" : `${left}回`}
          sub={limit === null ? "Pro特典" : `Freeは月${limit}回まで`}
        />
      </div>

      <ReviewPanel
        goals={goals as any}
        showPassProbability={showPassProbability}
      />

      <Card>
        <h2 className="font-semibold">過去のレビュー</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">
            まだレビューはありません。上のボタンから今週のレビューを生成しましょう。
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {history.map((r) => (
              <li key={r.id} className="rounded-xl border border-black/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-ink-500">
                    {new Date(r.created_at).toLocaleDateString("ja-JP")}
                  </span>
                  {showPassProbability && r.pass_probability != null && (
                    <Badge tone="green">合格可能性 {Math.round(r.pass_probability)}%</Badge>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
