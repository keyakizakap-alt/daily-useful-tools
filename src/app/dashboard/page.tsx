import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Screenshot } from "@/lib/types";
import UploadForm from "./upload-form";
import SearchBar from "./search-bar";
import ScreenshotCard from "./screenshot-card";
import SignOutButton from "./signout-button";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; tag?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { q, tag } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // RLS により自分の行のみ返る（.eq("user_id") は不要だが明示しても害はない）
  let query = supabase
    .from("screenshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    // OCRテキスト・要約・カテゴリを横断してキーワード検索
    const escaped = q.replace(/[%_,()]/g, "");
    query = query.or(
      `ocr_text.ilike.%${escaped}%,summary.ilike.%${escaped}%,category.ilike.%${escaped}%`
    );
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;
  const screenshots = (data ?? []) as Screenshot[];

  // プライベートバケットなので署名付きURL（1時間有効）でサムネイルを表示
  const signedUrls = new Map<string, string>();
  if (screenshots.length > 0) {
    const { data: signed } = await supabase.storage
      .from("screenshots")
      .createSignedUrls(
        screenshots.map((s) => s.storage_path),
        3600
      );
    signed?.forEach((item, i) => {
      if (item.signedUrl) signedUrls.set(screenshots[i].id, item.signedUrl);
    });
  }

  // タグ絞り込み用に、表示中スクショのタグを集計
  const allTags = [...new Set(screenshots.flatMap((s) => s.tags))].sort();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            📸 スクショ・ナレッジベース
          </h1>
          <p className="mt-1 text-sm text-gray-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <UploadForm />

      <SearchBar initialQuery={q ?? ""} tags={allTags} activeTag={tag ?? ""} />

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          読み込みに失敗しました: {error.message}
        </p>
      )}

      {screenshots.length === 0 ? (
        <p className="mt-12 text-center text-sm text-gray-400">
          {q || tag
            ? "条件に一致するスクリーンショットがありません"
            : "まだスクリーンショットがありません。上のフォームからアップロードしてください。"}
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {screenshots.map((s) => (
            <ScreenshotCard
              key={s.id}
              screenshot={s}
              imageUrl={signedUrls.get(s.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
