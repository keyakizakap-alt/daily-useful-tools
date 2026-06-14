"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Disclaimer } from "@/components/ui";

type GoalOpt = { id: string; certification?: { name?: string | null } | null };

interface ReviewResult {
  content: string;
  passProbability: number | null;
  nextActions: string[];
  disclaimer: string;
}

export default function ReviewPanel({
  goals,
  showPassProbability,
}: {
  goals: GoalOpt[];
  showPassProbability: boolean;
}) {
  const router = useRouter();
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  async function generate() {
    setError(null);
    setShowUpsell(false);
    setLoading(true);
    try {
      const res = await fetch("/api/review/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "レビューの生成に失敗しました。");
        if (res.status === 403 || data.upsell) setShowUpsell(true);
        return;
      }
      setResult({
        content: data.review?.content ?? "",
        passProbability: data.passProbability ?? null,
        nextActions: data.nextActions ?? [],
        disclaimer: data.disclaimer ?? "",
      });
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">今週のレビューを生成</h2>
      <p className="mt-1 text-sm text-ink-500">
        学習ログ・タスクの進み具合・模試の結果をもとに、AIが振り返りと来週の作戦を提案します。
      </p>

      {goals.length > 1 && (
        <div className="mt-3">
          <label className="label" htmlFor="review-goal">資格を選択</label>
          <select
            id="review-goal"
            className="input max-w-md"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
          >
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.certification?.name ?? "資格"}
              </option>
            ))}
          </select>
        </div>
      )}

      <button onClick={generate} disabled={loading || !goalId} className="btn-primary mt-3">
        {loading ? "生成中…" : "今週のレビューを生成する"}
      </button>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error}</p>
          {showUpsell && (
            <Link href="/billing" className="btn-outline mt-2">プランを見る</Link>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <p className="text-xs text-ink-500">合格可能性スコア</p>
            {showPassProbability ? (
              <p className="mt-1 text-2xl font-bold tracking-tight text-brand-700">
                {result.passProbability != null ? `${Math.round(result.passProbability)}%` : "—"}
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-ink-500">
                🔒 Proで合格可能性スコアが見られます
              </p>
            )}
          </div>

          <div>
            <h3 className="font-semibold">今週の振り返り</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{result.content}</p>
          </div>

          {result.nextActions.length > 0 && (
            <div>
              <h3 className="font-semibold">来週やること</h3>
              <ul className="mt-2 space-y-1.5">
                {result.nextActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                    <span className="text-brand-500">→</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.disclaimer && <Disclaimer text={result.disclaimer} />}
        </div>
      )}
    </Card>
  );
}
