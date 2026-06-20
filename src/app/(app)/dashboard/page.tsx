import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { getDashboardData } from "@/lib/queries";
import { Card, StatCard, Badge, UpsellCard, EmptyState } from "@/components/ui";
import TaskToggle from "./TaskToggle";

export const dynamic = "force-dynamic";

function daysLeft(examDate: string | null): number | null {
  if (!examDate) return null;
  return Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000);
}

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const ent = await getEntitlements(user.id);
  const { primary, today, weekProgress, weakTop3, passProbability } = await getDashboardData();

  if (!primary) {
    return (
      <EmptyState
        title="まずは目標の資格を登録しましょう"
        desc="試験日と1日の学習時間を入れると、AIが学習計画を作ります。"
        cta={<Link href="/certifications" className="btn-primary">資格を登録する</Link>}
      />
    );
  }

  const left = daysLeft(primary.exam_date);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-ink-500">学習中の資格</p>
        <h1 className="text-2xl font-bold tracking-tight">{primary.certification?.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="試験日" value={primary.exam_date ?? "未設定"} />
        <StatCard label="残り日数" accent value={left != null ? `${left}日` : "—"} />
        <StatCard label="今週の進捗" value={`${weekProgress}%`} />
        <StatCard
          label="合格可能性"
          value={ent.plan.features.passProbability ? (passProbability != null ? `${Math.round(passProbability)}%` : "—") : "🔒 Pro"}
          sub={ent.plan.features.passProbability ? "目安スコア" : "Pro限定"}
        />
      </div>

      {ent.paymentIssue && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-700">⚠️ お支払いに問題があります</p>
          <p className="mt-1 text-sm text-red-600">Pro機能が一時停止しています。お支払い方法をご確認ください。</p>
          <Link href="/billing" className="btn-outline mt-3">課金管理へ</Link>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">今日の学習タスク</h2>
              <Link href="/study-plan" className="text-sm text-brand-600">計画を見る</Link>
            </div>
            {today.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">今日のタスクはありません。学習計画を作成しましょう。</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {today.map((t: any) => (
                  <li key={t.id}><TaskToggle task={t} /></li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">弱点トップ3</h2>
            {weakTop3.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">模試結果を登録すると弱点が見えてきます。</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {weakTop3.map((d, i) => (
                  <li key={d} className="flex items-center gap-3">
                    <Badge tone={i === 0 ? "red" : i === 1 ? "amber" : "gray"}>{i + 1}位</Badge>
                    <span className="text-sm">{d}</span>
                  </li>
                ))}
              </ol>
            )}
            <Link href="/weakness" className="mt-3 inline-block text-sm text-brand-600">弱点分析を見る</Link>
          </Card>
        </div>

        <div className="space-y-5">
          {!ent.plan.isPro && (
            <UpsellCard message="毎週のAIレビューと合格可能性スコアで、合格までの距離がはっきり見えます。" />
          )}
          <Card>
            <h2 className="font-semibold">クイック操作</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/logs" className="btn-ghost">学習を記録</Link>
              <Link href="/mock-exams" className="btn-ghost">模試を登録</Link>
              <Link href="/review" className="btn-ghost">AIレビュー</Link>
              <Link href="/study-plan" className="btn-ghost">計画を再生成</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
