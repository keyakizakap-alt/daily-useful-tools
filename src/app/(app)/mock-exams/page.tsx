import Link from "next/link";
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { listGoals } from "@/lib/queries";
import { remaining } from "@/lib/plans";
import { Card, StatCard, Badge, SectionTitle, UpsellCard, EmptyState } from "@/components/ui";
import MockExamForm from "./MockExamForm";

export const dynamic = "force-dynamic";

interface DomainBreakdown {
  domain: string;
  correctRate: number;
}

interface MockResult {
  id: string;
  taken_at: string;
  score: number;
  max_score: number;
  correct_rate: number;
  domain_breakdown_json: DomainBreakdown[] | null;
  weak_domains_json: string[] | null;
  memo: string | null;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export default async function MockExamsPage() {
  const user = (await getCurrentUser())!;
  const ent = await getEntitlements(user.id);
  const goals = await listGoals();

  if (goals.length === 0) {
    return (
      <EmptyState
        title="まずは目標の資格を登録しましょう"
        desc="資格を登録すると、模試の結果を記録して弱点を分析できます。"
        cta={<Link href="/certifications" className="btn-primary">資格を登録する</Link>}
      />
    );
  }

  const primary = goals[0];
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("mock_exam_results")
    .select("id, taken_at, score, max_score, correct_rate, domain_breakdown_json, weak_domains_json, memo")
    .eq("user_id", user.id)
    .eq("goal_id", primary.id)
    .order("taken_at", { ascending: false })
    .limit(50);

  const results = (data ?? []) as MockResult[];

  const limit = ent.plan.limits.mockExams;
  const left = remaining(limit, ent.usage.mock_exam_count);
  const limitReached = limit !== null && left <= 0;
  const latest = results[0];

  return (
    <div className="space-y-5">
      <SectionTitle
        title="模試の記録"
        desc="模試のスコアを残すと、分野ごとの弱点が見えてきます。"
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="最新の正答率" accent value={latest ? pct(latest.correct_rate) : "—"} />
        <StatCard label="記録した模試" value={`${results.length}回`} />
        <StatCard
          label="今月の残り登録"
          value={limit === null ? "無制限" : `${left}回`}
          sub={limit === null ? "Pro特典" : `Freeは月${limit}回まで`}
        />
      </div>

      {limitReached ? (
        <UpsellCard message="今月の模試登録の上限に達しました。Proにアップグレードすると無制限に記録できます。" />
      ) : (
        <MockExamForm goals={goals as any} />
      )}

      <Card>
        <h2 className="font-semibold">過去の結果</h2>
        {results.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">まだ模試の記録がありません。最初の1回を登録してみましょう。</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {results.map((r) => (
              <li key={r.id} className="rounded-xl border border-black/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.taken_at}</span>
                    <Badge tone={r.correct_rate >= 70 ? "green" : r.correct_rate >= 50 ? "amber" : "red"}>
                      正答率 {pct(r.correct_rate)}
                    </Badge>
                  </div>
                  <span className="text-sm text-ink-500">{r.score} / {r.max_score} 点</span>
                </div>

                {Array.isArray(r.domain_breakdown_json) && r.domain_breakdown_json.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {r.domain_breakdown_json.map((d) => (
                      <div key={d.domain} className="flex items-center gap-2">
                        <span className="w-40 shrink-0 truncate text-xs text-ink-600">{d.domain}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                          <div
                            className={`h-full rounded-full ${
                              d.correctRate >= 70 ? "bg-brand-500" : d.correctRate >= 50 ? "bg-amber-400" : "bg-red-400"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, d.correctRate))}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-500">{pct(d.correctRate)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {r.memo && <p className="mt-2 text-xs text-ink-500">{r.memo}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
