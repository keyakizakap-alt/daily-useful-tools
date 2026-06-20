"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { CERTIFICATIONS } from "@/lib/certifications-data";

interface GoalOption {
  id: string;
  certification?: { code?: string; name?: string } | null;
}

interface DomainRow {
  domain: string;
  correctRate: number;
}

function domainsFor(code?: string): string[] {
  return CERTIFICATIONS.find((c) => c.code === code)?.domains ?? [];
}

export default function MockExamForm({ goals }: { goals: GoalOption[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [takenAt, setTakenAt] = useState(today);
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);

  const certDomains = useMemo(() => {
    const g = goals.find((x) => x.id === goalId);
    return domainsFor(g?.certification?.code);
  }, [goalId, goals]);

  // 資格を切り替えたら分野行を初期化（全分野を0%で並べる）
  useEffect(() => {
    setRows(certDomains.map((d) => ({ domain: d, correctRate: 0 })));
  }, [certDomains]);

  function updateRow(i: number, patch: Partial<DomainRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowUpsell(false);
    try {
      const res = await fetch("/api/mock-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId,
          takenAt,
          score,
          maxScore,
          domainBreakdown: rows.filter((r) => r.domain),
          memo: memo || undefined,
        }),
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "今月の登録上限に達しました。");
        setShowUpsell(true);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "登録に失敗しました。もう一度お試しください。");
        return;
      }
      setMemo("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">模試の結果を登録する</h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.length > 1 && (
            <div className="sm:col-span-2">
              <label className="label">資格</label>
              <select className="input" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.certification?.name ?? "資格"}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">受験日</label>
            <input type="date" className="input" value={takenAt} max={today} onChange={(e) => setTakenAt(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">得点</label>
              <input type="number" min={0} className="input" value={score} onChange={(e) => setScore(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">満点</label>
              <input type="number" min={1} className="input" value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {rows.length > 0 && (
          <div>
            <p className="label">分野ごとの正答率（%）</p>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="input flex-1"
                    value={r.domain}
                    onChange={(e) => updateRow(i, { domain: e.target.value })}
                  >
                    {certDomains.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input w-24"
                    value={r.correctRate}
                    onChange={(e) => updateRow(i, { correctRate: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">メモ（任意）</label>
          <textarea className="input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="気づいたことなど" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {showUpsell && (
          <Link href="/billing" className="btn-outline">Proにアップグレードする</Link>
        )}

        <button type="submit" disabled={loading || !goalId} className="btn-primary">
          {loading ? "登録中…" : "結果を登録する"}
        </button>
      </form>
    </Card>
  );
}
