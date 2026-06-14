"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { CERTIFICATIONS } from "@/lib/certifications-data";

interface GoalOption {
  id: string;
  certification?: { code?: string; name?: string } | null;
}

function domainsFor(code?: string): string[] {
  return CERTIFICATIONS.find((c) => c.code === code)?.domains ?? [];
}

export default function LogForm({ goals }: { goals: GoalOption[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [studiedAt, setStudiedAt] = useState(today);
  const [minutes, setMinutes] = useState(30);
  const [content, setContent] = useState("");
  const [understanding, setUnderstanding] = useState<number | null>(null);
  const [domain, setDomain] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const domains = useMemo(() => {
    const g = goals.find((x) => x.id === goalId);
    return domainsFor(g?.certification?.code);
  }, [goalId, goals]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId,
          studiedAt,
          minutes,
          content: content || undefined,
          understandingLevel: understanding,
          domain: domain || undefined,
          memo: memo || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "記録に失敗しました。もう一度お試しください。");
        return;
      }
      setContent("");
      setMemo("");
      setUnderstanding(null);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">学習を記録する</h2>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
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
          <label className="label">日付</label>
          <input type="date" className="input" value={studiedAt} onChange={(e) => setStudiedAt(e.target.value)} max={today} />
        </div>

        <div>
          <label className="label">学習時間（分）</label>
          <input
            type="number"
            min={1}
            className="input"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label">学習した内容</label>
          <input
            className="input"
            placeholder="例：IAMのポリシー設計を復習"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        {domains.length > 0 && (
          <div>
            <label className="label">分野</label>
            <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">未選択</option>
              {domains.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">理解度</label>
          <div className="flex items-center gap-1 pt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setUnderstanding(understanding === n ? null : n)}
                className={`text-2xl leading-none transition ${
                  understanding != null && n <= understanding ? "text-amber-400" : "text-ink-300"
                }`}
                aria-label={`理解度${n}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="label">メモ（任意）</label>
          <textarea
            className="input"
            rows={2}
            placeholder="つまずいた点や次にやることなど"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

        <div className="sm:col-span-2">
          <button type="submit" disabled={loading || !goalId} className="btn-primary">
            {loading ? "記録中…" : "記録する"}
          </button>
        </div>
      </form>
    </Card>
  );
}
