"use client";

import { useState } from "react";
import type { PlanId } from "@/lib/plans";

export default function BillingActions({
  plan,
  isPro,
}: {
  plan: PlanId;
  isPro: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(target: "pro_monthly" | "pro_yearly") {
    setError(null);
    setLoading(target);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "チェックアウトを開始できませんでした。");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(null);
    }
  }

  async function portal() {
    setError(null);
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "管理画面を開けませんでした。");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {isPro ? (
        <button
          onClick={portal}
          disabled={loading !== null}
          className="btn-outline w-full"
        >
          {loading === "portal" ? "読み込み中…" : "プラン変更・解約"}
        </button>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => checkout("pro_monthly")}
            disabled={loading !== null}
            className="btn-primary"
          >
            {loading === "pro_monthly" ? "読み込み中…" : "Pro月額 ¥680 にする"}
          </button>
          <button
            onClick={() => checkout("pro_yearly")}
            disabled={loading !== null}
            className="btn-ghost"
          >
            {loading === "pro_yearly" ? "読み込み中…" : "Pro年額 ¥5,980 にする"}
          </button>
        </div>
      )}

      {!isPro && (
        <p className="text-center text-xs text-ink-500">
          年額なら2ヶ月分以上おトクです🐾
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
