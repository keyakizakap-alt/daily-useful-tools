"use client";

import { useState } from "react";

export default function TaskToggle({ task }: { task: any }) {
  const [status, setStatus] = useState(task.status);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = status === "done" ? "todo" : "done";
    setLoading(true);
    setStatus(next);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) setStatus(status); // 失敗時ロールバック
    } catch {
      setStatus(status);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex w-full items-start gap-3 rounded-xl border border-black/5 px-3 py-2.5 text-left hover:bg-black/[0.02]"
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
        status === "done" ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300"
      }`}>
        {status === "done" ? "✓" : ""}
      </span>
      <span>
        <span className={`block text-sm ${status === "done" ? "text-ink-300 line-through" : ""}`}>{task.title}</span>
        {task.domain && <span className="text-xs text-ink-500">{task.domain} ・ {task.estimated_minutes}分</span>}
      </span>
    </button>
  );
}
