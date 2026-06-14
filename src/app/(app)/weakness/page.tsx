import Link from "next/link";
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { listGoals } from "@/lib/queries";
import { Card, Badge, SectionTitle, UpsellCard, EmptyState } from "@/components/ui";
import WeaknessChart from "./WeaknessChart";

export const dynamic = "force-dynamic";

interface DomainBreakdown {
  domain: string;
  correctRate: number;
}

interface RankedDomain {
  domain: string;
  rate: number;
}

function priority(rate: number): { label: string; tone: "red" | "amber" | "green" } {
  if (rate < 50) return { label: "High", tone: "red" };
  if (rate < 70) return { label: "Med", tone: "amber" };
  return { label: "Low", tone: "green" };
}

export default async function WeaknessPage() {
  const user = (await getCurrentUser())!;
  const ent = await getEntitlements(user.id);
  const goals = await listGoals();

  if (goals.length === 0) {
    return (
      <EmptyState
        title="まずは目標の資格を登録しましょう"
        desc="模試を記録すると、弱点分野が自動で見えてきます。"
        cta={<Link href="/certifications" className="btn-primary">資格を登録する</Link>}
      />
    );
  }

  const primary = goals[0];
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("mock_exam_results")
    .select("domain_breakdown_json, taken_at")
    .eq("user_id", user.id)
    .eq("goal_id", primary.id)
    .order("taken_at", { ascending: false })
    .limit(5);

  // 直近5回の分野別正答率を平均
  const acc: Record<string, { sum: number; n: number }> = {};
  (data ?? []).forEach((row: any) => {
    const breakdown = (row.domain_breakdown_json ?? []) as DomainBreakdown[];
    breakdown.forEach((d) => {
      if (!d?.domain) return;
      acc[d.domain] = acc[d.domain] ?? { sum: 0, n: 0 };
      acc[d.domain].sum += d.correctRate;
      acc[d.domain].n += 1;
    });
  });

  const ranked: RankedDomain[] = Object.entries(acc)
    .map(([domain, v]) => ({ domain, rate: Math.round(v.sum / v.n) }))
    .sort((a, b) => a.rate - b.rate); // 弱点（低い正答率）が先頭

  const isPro = ent.plan.features.fullWeaknessAnalysis;

  if (ranked.length === 0) {
    return (
      <div className="space-y-5">
        <SectionTitle title="弱点分析" desc="模試の結果から、伸ばすべき分野を見つけます。" />
        <EmptyState
          title="まだ分析できる模試がありません"
          desc="模試の結果を登録すると、分野ごとの弱点ランキングが表示されます。"
          cta={<Link href="/mock-exams" className="btn-primary">模試を登録する</Link>}
        />
      </div>
    );
  }

  const visible = isPro ? ranked : ranked.slice(0, 1);
  const hidden = isPro ? [] : ranked.slice(1);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="弱点分析"
        desc={`直近${data?.length ?? 0}回の模試をもとに、分野ごとの正答率をまとめました。`}
      />

      <Card>
        <h2 className="font-semibold">分野別の正答率</h2>
        <p className="mt-1 text-xs text-ink-500">バーが短いほど復習の優先度が高い分野です。</p>
        <div className="mt-3">
          <WeaknessChart data={isPro ? ranked : visible} />
        </div>
        {!isPro && (
          <p className="mt-2 text-xs text-ink-500">Freeでは最も弱い1分野のみ表示されます。</p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">復習優先度ランキング</h2>
        <ol className="mt-3 space-y-2">
          {visible.map((d, i) => {
            const p = priority(d.rate);
            return (
              <li key={d.domain} className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2.5">
                <span className="w-6 text-center text-sm font-bold text-ink-500">{i + 1}</span>
                <span className="flex-1 text-sm">{d.domain}</span>
                <span className="text-sm tabular-nums text-ink-500">{d.rate}%</span>
                <Badge tone={p.tone}>{p.label}</Badge>
              </li>
            );
          })}
        </ol>

        {hidden.length > 0 && (
          <div className="relative mt-2">
            <ol className="space-y-2 blur-sm select-none" aria-hidden>
              {hidden.map((d, i) => (
                <li key={d.domain} className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2.5">
                  <span className="w-6 text-center text-sm font-bold text-ink-500">{i + 2}</span>
                  <span className="flex-1 text-sm">{d.domain}</span>
                  <span className="text-sm tabular-nums text-ink-500">{d.rate}%</span>
                </li>
              ))}
            </ol>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-medium text-brand-700 shadow-sm">
                🔒 残り{hidden.length}分野はProで
              </span>
            </div>
          </div>
        )}
      </Card>

      {!isPro && (
        <UpsellCard message="Proにすると全分野の弱点ランキングと、AIによる詳しいコメントが見られます。" />
      )}

      <Card className="bg-brand-50 border-brand-100">
        <h2 className="font-semibold">AIコメント</h2>
        <p className="mt-1 text-sm text-ink-700">
          {isPro
            ? "AIレビューでは、弱点分野に合わせた具体的な復習プランを受け取れます。"
            : "弱点に合わせた復習プランはAIレビューで受け取れます。"}
        </p>
        <Link href="/review" className="btn-primary mt-3">AIレビューを見る</Link>
      </Card>
    </div>
  );
}
