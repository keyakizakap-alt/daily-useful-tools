"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Badge, Disclaimer, EmptyState } from "@/components/ui";

const AI_DISCLAIMER =
  "※この内容はあなたの学習ログ・公式シラバスの分野情報をもとにAIが作成した参考情報です。実際の出題範囲・配点は必ず公式シラバスでご確認ください。";

type GoalOpt = { id: string; name: string; domains: string[] };
type Task = {
  id: string;
  title: string;
  domain?: string | null;
  task_date: string | null;
  estimated_minutes?: number | null;
  status?: string | null;
};

function groupByDate(tasks: Task[]): [string, Task[]][] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.task_date ?? "未設定";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return Array.from(map.entries());
}

export default function StudyPlanView({
  goals,
  selectedGoalId,
  tasks,
  plan,
  hasPlan,
  canRegenerate,
}: {
  goals: GoalOpt[];
  selectedGoalId: string;
  tasks: Task[];
  plan: { notes?: string | null; priority_domains_json?: string[] | null } | null;
  hasPlan: boolean;
  canRegenerate: boolean;
}) {
  const router = useRouter();
  const [weakDomains, setWeakDomains] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);

  const selected = goals.find((g) => g.id === selectedGoalId) ?? goals[0];
  // 既存計画があり、かつ再生成不可（Free）の場合はボタンを抑止
  const blockedRegen = hasPlan && !canRegenerate;
  const grouped = groupByDate(tasks);

  function changeGoal(id: string) {
    router.push(`/study-plan?goal=${id}`);
  }

  async function generate() {
    setError(null);
    setShowUpsell(false);
    setLoading(true);
    try {
      const res = await fetch("/api/study-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId: selectedGoalId,
          weakDomains: weakDomains
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "計画の生成に失敗しました。");
        if (res.status === 403 || data.upsell) setShowUpsell(true);
        return;
      }
      setWeakDomains("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {goals.length > 1 && (
        <div>
          <label className="label" htmlFor="goal">資格を選択</label>
          <select
            id="goal"
            className="input max-w-md"
            value={selectedGoalId}
            onChange={(e) => changeGoal(e.target.value)}
          >
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      <Card>
        <h2 className="font-semibold">
          {hasPlan ? "計画を再生成" : "計画を生成"}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          苦手な分野があれば入力すると、その分野を重点的に組み込みます（カンマ区切り・任意）。
        </p>

        {selected?.domains?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selected.domains.map((d) => (
              <Badge key={d} tone="gray">{d}</Badge>
            ))}
          </div>
        ) : null}

        <input
          type="text"
          className="input mt-3"
          placeholder="例: セキュリティ, ネットワーク"
          value={weakDomains}
          onChange={(e) => setWeakDomains(e.target.value)}
        />

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{error}</p>
            {showUpsell && (
              <Link href="/billing" className="btn-outline mt-2">プランを見る</Link>
            )}
          </div>
        )}

        {blockedRegen ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Freeプランでは学習計画の再生成はできません。Proにアップグレードすると何度でも作り直せます。
            <Link href="/billing" className="btn-outline mt-2">プランを見る</Link>
          </div>
        ) : (
          <button onClick={generate} disabled={loading} className="btn-primary mt-3">
            {loading ? "生成中…" : hasPlan ? "計画を再生成する" : "計画を生成する"}
          </button>
        )}

        <Disclaimer text={AI_DISCLAIMER} />
      </Card>

      {plan?.notes && (
        <Card className="bg-brand-50 border-brand-100">
          <h2 className="font-semibold text-brand-700">AIからのメモ</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{plan.notes}</p>
        </Card>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title="まだタスクがありません"
          desc="上のボタンから学習計画を生成しましょう。"
        />
      ) : (
        <div className="space-y-3">
          {grouped.map(([date, dayTasks]) => (
            <Card key={date}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{date}</h3>
                <span className="text-xs text-ink-500">
                  {dayTasks.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0)}分
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {dayTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-3 rounded-xl border border-black/5 px-3 py-2.5"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        t.status === "done"
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-ink-300"
                      }`}
                    >
                      {t.status === "done" ? "✓" : ""}
                    </span>
                    <span>
                      <span
                        className={`block text-sm ${
                          t.status === "done" ? "text-ink-300 line-through" : ""
                        }`}
                      >
                        {t.title}
                      </span>
                      {t.domain && (
                        <span className="text-xs text-ink-500">
                          {t.domain} ・ {t.estimated_minutes}分
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
