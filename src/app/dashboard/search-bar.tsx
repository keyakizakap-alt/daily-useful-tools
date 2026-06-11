"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface Props {
  initialQuery: string;
  tags: string[];
  activeTag: string;
}

export default function SearchBar({ initialQuery, tags, activeTag }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  function navigate(params: { q?: string; tag?: string }) {
    const next = new URLSearchParams(searchParams.toString());
    if (params.q !== undefined) {
      if (params.q) next.set("q", params.q);
      else next.delete("q");
    }
    if (params.tag !== undefined) {
      if (params.tag) next.set("tag", params.tag);
      else next.delete("tag");
    }
    router.push(`/dashboard?${next.toString()}`);
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ q: query });
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          placeholder="OCRテキスト・要約からキーワード検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          検索
        </button>
      </form>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activeTag && (
            <button
              onClick={() => navigate({ tag: "" })}
              className="rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-300"
            >
              ✕ 絞り込み解除
            </button>
          )}
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => navigate({ tag: tag === activeTag ? "" : tag })}
              className={`rounded-full px-3 py-1 text-xs ${
                tag === activeTag
                  ? "bg-blue-600 text-white"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
