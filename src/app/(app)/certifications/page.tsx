import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { listGoals, listCertifications } from "@/lib/queries";
import { Card, Badge, SectionTitle, UpsellCard, EmptyState } from "@/components/ui";
import AddGoalForm from "./AddGoalForm";

export const dynamic = "force-dynamic";

function daysLeft(examDate: string | null): number | null {
  if (!examDate) return null;
  return Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000);
}

export default async function CertificationsPage() {
  const user = (await getCurrentUser())!;
  const ent = await getEntitlements(user.id);
  const [goals, certifications] = await Promise.all([listGoals(), listCertifications()]);

  const max = ent.plan.limits.maxCertGoals;
  const reachedLimit = max !== null && ent.goalsCount >= max;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="資格管理"
        desc="目標の資格を登録すると、AIが試験日までの学習計画を作ります。"
      />

      {goals.length === 0 ? (
        <EmptyState
          title="まだ登録した資格がありません"
          desc="下のフォームから最初の目標を追加しましょう。"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g: any) => {
            const left = daysLeft(g.exam_date);
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold leading-tight">{g.certification?.name}</h2>
                    <p className="mt-0.5 text-xs text-ink-500">{g.certification?.code}</p>
                  </div>
                  <Badge tone="green">{g.certification?.category}</Badge>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-ink-500">試験日</dt>
                    <dd>{g.exam_date ?? "未設定"}{left != null && left >= 0 ? `（残り${left}日）` : ""}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">目標スコア</dt>
                    <dd>{g.target_score ?? "未設定"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">現在の理解度</dt>
                    <dd>{g.current_level ?? 0}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">1日の学習時間</dt>
                    <dd>{g.daily_available_minutes ?? 0}分</dd>
                  </div>
                </dl>

                <Link href="/study-plan" className="btn-ghost mt-4 w-full">
                  学習計画を見る
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-700">資格を追加</h2>
        {reachedLimit ? (
          <UpsellCard
            message={`Freeプランで登録できる資格は${max}件までです。Proにアップグレードすると無制限に登録できます。`}
          />
        ) : (
          <AddGoalForm certifications={certifications} />
        )}
      </div>
    </div>
  );
}
