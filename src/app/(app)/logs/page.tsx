import Link from "next/link";
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { listGoals } from "@/lib/queries";
import { Card, StatCard, Badge, SectionTitle, EmptyState } from "@/components/ui";
import LogForm from "./LogForm";

export const dynamic = "force-dynamic";

interface StudyLog {
  id: string;
  studied_at: string;
  minutes: number;
  content: string | null;
  understanding_level: number | null;
  memo: string | null;
  domain: string | null;
}

function startOfWeek(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 月曜始まり
  const mon = new Date(now);
  mon.setDate(now.getDate() - day);
  return mon.toISOString().slice(0, 10);
}

/** 連続記録日数（今日 or 昨日から遡って連続している日数）。 */
function calcStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  const cur = new Date();
  // 今日に記録が無ければ昨日から数え始める
  if (!set.has(cur.toISOString().slice(0, 10))) cur.setDate(cur.getDate() - 1);
  while (set.has(cur.toISOString().slice(0, 10))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export default async function LogsPage() {
  const user = (await getCurrentUser())!;
  const goals = await listGoals();

  if (goals.length === 0) {
    return (
      <EmptyState
        title="まずは目標の資格を登録しましょう"
        desc="資格を登録すると、毎日の学習を記録できるようになります。"
        cta={<Link href="/certifications" className="btn-primary">資格を登録する</Link>}
      />
    );
  }

  const primary = goals[0];
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("study_logs")
    .select("id, studied_at, minutes, content, understanding_level, memo, domain")
    .eq("user_id", user.id)
    .eq("goal_id", primary.id)
    .order("studied_at", { ascending: false })
    .limit(50);

  const logs = (data ?? []) as StudyLog[];

  const weekStart = startOfWeek();
  const weekMinutes = logs
    .filter((l) => l.studied_at >= weekStart)
    .reduce((s, l) => s + (l.minutes ?? 0), 0);
  const streak = calcStreak(logs.map((l) => l.studied_at));

  return (
    <div className="space-y-5">
      <SectionTitle
        title="学習ログ"
        desc="今日の頑張りをサッと記録しましょう。小さな積み重ねが合格につながります。"
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="今週の学習時間"
          accent
          value={`${Math.floor(weekMinutes / 60)}時間${weekMinutes % 60}分`}
        />
        <StatCard label="連続記録日数" value={`${streak}日`} sub={streak > 0 ? "この調子！" : "今日から始めましょう"} />
        <StatCard label="記録の数" value={`${logs.length}件`} />
      </div>

      <LogForm goals={goals as any} />

      <Card>
        <h2 className="font-semibold">最近の記録</h2>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">まだ記録がありません。上のフォームから記録してみましょう。</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {logs.slice(0, 20).map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{l.studied_at}</span>
                    <Badge tone="green">{l.minutes}分</Badge>
                    {l.domain && <Badge>{l.domain}</Badge>}
                  </div>
                  {l.content && <p className="mt-1 text-sm text-ink-700">{l.content}</p>}
                  {l.memo && <p className="mt-0.5 text-xs text-ink-500">{l.memo}</p>}
                </div>
                {l.understanding_level != null && (
                  <span className="shrink-0 text-sm text-amber-500" title={`理解度 ${l.understanding_level}/5`}>
                    {"★".repeat(l.understanding_level)}
                    <span className="text-ink-300">{"★".repeat(5 - l.understanding_level)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
