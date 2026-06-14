"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProgressInfo, ProgressStatus } from "@/lib/progress";

// サービス詳細での学習進捗操作（F005）
export default function ProgressControls({
  serviceId,
  initial,
}: {
  serviceId: string;
  initial: ProgressInfo;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [, startTransition] = useTransition();

  async function update(patch: Partial<ProgressInfo>) {
    const next = { ...progress, ...patch };
    setProgress(next);
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, ...patch }),
    });
    startTransition(() => router.refresh());
  }

  function toggleStatus(status: ProgressStatus) {
    update({ status: progress.status === status ? "UNLEARNED" : status });
  }

  const base = "rounded-lg px-3 py-1.5 text-sm font-semibold transition";
  const off =
    "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => toggleStatus("LEARNED")}
        className={`${base} ${
          progress.status === "LEARNED"
            ? "bg-emerald-500 text-white"
            : off
        }`}
      >
        ✓ 学習済
      </button>
      <button
        onClick={() => toggleStatus("WEAK")}
        className={`${base} ${
          progress.status === "WEAK" ? "bg-rose-500 text-white" : off
        }`}
      >
        △ 苦手
      </button>
      <button
        onClick={() => update({ favorite: !progress.favorite })}
        className={`${base} ${
          progress.favorite ? "bg-amber-400 text-white" : off
        }`}
      >
        ⭐ お気に入り
      </button>
      <button
        onClick={() => update({ reviewFlag: !progress.reviewFlag })}
        className={`${base} ${
          progress.reviewFlag ? "bg-sky-500 text-white" : off
        }`}
      >
        🔁 復習対象
      </button>
    </div>
  );
}
