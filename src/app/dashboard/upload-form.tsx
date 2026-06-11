"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("セッションが切れています。再ログインしてください。");
      setUploading(false);
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`${i + 1}/${files.length} 件目をアップロード中...`);

      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name}: 対応していない形式です (PNG/JPEG/WebP/HEIC)`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(`${file.name}: 10MB を超えています`);
        continue;
      }

      try {
        const ext = file.name.split(".").pop() ?? "png";
        // RLS のパス規約: 先頭フォルダ = 自分のユーザーID
        const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("screenshots")
          .upload(storagePath, file, { contentType: file.type });
        if (uploadError) throw new Error(uploadError.message);

        const { data: row, error: insertError } = await supabase
          .from("screenshots")
          .insert({ storage_path: storagePath, mime_type: file.type })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);

        setProgress(`${i + 1}/${files.length} 件目をAIで解析中...`);
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenshotId: row.id }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "解析に失敗しました");
        }
      } catch (err) {
        setError(
          `${file.name}: ${err instanceof Error ? err.message : "エラーが発生しました"}`
        );
      }
    }

    setProgress(null);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-6 text-center">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        multiple
        disabled={uploading}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        id="screenshot-input"
      />
      <label
        htmlFor="screenshot-input"
        className={`inline-block cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 ${
          uploading ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {uploading ? "処理中..." : "スクリーンショットを選択"}
      </label>
      <p className="mt-2 text-xs text-gray-400">
        PNG / JPEG / WebP / HEIC、10MBまで。アップロード後にAIが自動でタグ付けします。
      </p>
      {progress && <p className="mt-3 text-sm text-blue-600">{progress}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
