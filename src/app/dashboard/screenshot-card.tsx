"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Screenshot } from "@/lib/types";

interface Props {
  screenshot: Screenshot;
  imageUrl?: string;
}

const STATUS_LABEL: Record<Screenshot["status"], string> = {
  pending: "解析待ち",
  analyzed: "解析済み",
  failed: "解析失敗",
};

export default function ScreenshotCard({ screenshot, imageUrl }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("このスクリーンショットを削除しますか？")) return;
    setDeleting(true);
    const supabase = createClient();
    // RLS により自分のデータしか削除できない
    await supabase.storage
      .from("screenshots")
      .remove([screenshot.storage_path]);
    await supabase.from("screenshots").delete().eq("id", screenshot.id);
    router.refresh();
  }

  async function handleRetry() {
    await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenshotId: screenshot.id }),
    });
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {imageUrl ? (
        // 署名付きURL（有効期限付き）のため next/image ではなく img を使用
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={screenshot.summary ?? "スクリーンショット"}
          className="h-48 w-full bg-gray-100 object-cover object-top"
        />
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-gray-100 text-xs text-gray-400">
          画像を読み込めません
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {screenshot.category ?? STATUS_LABEL[screenshot.status]}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(screenshot.created_at).toLocaleDateString("ja-JP")}
          </span>
        </div>

        {screenshot.summary && (
          <p className="mt-2 text-sm text-gray-800">{screenshot.summary}</p>
        )}

        {screenshot.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {screenshot.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {screenshot.ocr_text && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            {expanded ? "OCRテキストを隠す" : "OCRテキストを表示"}
          </button>
        )}
        {expanded && screenshot.ocr_text && (
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
            {screenshot.ocr_text}
          </pre>
        )}

        <div className="mt-3 flex justify-end gap-2">
          {screenshot.status === "failed" && (
            <button
              onClick={handleRetry}
              className="text-xs text-blue-600 hover:underline"
            >
              再解析
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-500 hover:underline disabled:opacity-50"
          >
            {deleting ? "削除中..." : "削除"}
          </button>
        </div>
      </div>
    </div>
  );
}
