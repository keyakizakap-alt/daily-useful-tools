"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui";

type Cert = {
  id: string;
  code: string;
  name: string;
  category: string;
};

const CATEGORIES: { value: string; label: string }[] = [
  { value: "AWS", label: "AWS" },
  { value: "Azure", label: "Azure" },
  { value: "GoogleCloud", label: "Google Cloud" },
  { value: "IPA", label: "IPA（情報処理）" },
  { value: "Other", label: "その他" },
];

export default function AddGoalForm({ certifications }: { certifications: Cert[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("AWS");
  const [certificationId, setCertificationId] = useState("");
  const [examDate, setExamDate] = useState("");
  const [targetScore, setTargetScore] = useState("");
  const [currentLevel, setCurrentLevel] = useState(20);
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);

  const filtered = useMemo(
    () => certifications.filter((c) => c.category === category),
    [certifications, category],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowUpsell(false);
    if (!certificationId) {
      setError("資格を選択してください。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificationId,
          examDate: examDate || null,
          targetScore: targetScore ? Number(targetScore) : null,
          currentLevel,
          dailyAvailableMinutes: dailyMinutes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登録に失敗しました。");
        if (res.status === 403 || data.upsell) setShowUpsell(true);
        return;
      }
      setCertificationId("");
      setExamDate("");
      setTargetScore("");
      setCurrentLevel(20);
      setDailyMinutes(30);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="category">カテゴリ</label>
            <select
              id="category"
              className="input"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCertificationId("");
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="cert">資格</label>
            <select
              id="cert"
              className="input"
              value={certificationId}
              onChange={(e) => setCertificationId(e.target.value)}
            >
              <option value="">選択してください</option>
              {filtered.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {filtered.length === 0 && (
              <p className="mt-1 text-xs text-ink-500">このカテゴリの資格はまだありません。</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="examDate">試験日（任意）</label>
            <input
              id="examDate"
              type="date"
              className="input"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="targetScore">目標スコア（任意）</label>
            <input
              id="targetScore"
              type="number"
              inputMode="numeric"
              className="input"
              placeholder="例: 720"
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="level">
            現在の理解度: <span className="font-semibold text-ink-700">{currentLevel}%</span>
          </label>
          <input
            id="level"
            type="range"
            min={0}
            max={100}
            step={5}
            className="w-full accent-brand-500"
            value={currentLevel}
            onChange={(e) => setCurrentLevel(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="label" htmlFor="minutes">1日に使える学習時間（分）</label>
          <input
            id="minutes"
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            className="input"
            value={dailyMinutes}
            onChange={(e) => setDailyMinutes(Number(e.target.value))}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{error}</p>
            {showUpsell && (
              <Link href="/billing" className="btn-outline mt-2">プランを見る</Link>
            )}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "登録中…" : "この資格を登録する"}
        </button>
      </form>
    </Card>
  );
}
