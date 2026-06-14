"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STATUS_META, type ProgressStatus } from "@/lib/progress";

export type ServiceListItem = {
  id: string;
  name: string;
  abbreviation: string;
  category: string;
  shortDescription: string;
  keywords: string[];
  status: ProgressStatus;
  favorite: boolean;
  reviewFlag: boolean;
};

const STATUS_FILTERS = [
  { value: "ALL", label: "すべて" },
  { value: "UNLEARNED", label: "未学習" },
  { value: "LEARNED", label: "学習済" },
  { value: "WEAK", label: "苦手" },
  { value: "FAVORITE", label: "お気に入り" },
  { value: "REVIEW", label: "復習対象" },
];

export default function ServiceExplorer({
  services,
  categories,
  initialStatus,
  initialCategory,
}: {
  services: ServiceListItem[];
  categories: string[];
  initialStatus?: string;
  initialCategory?: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(
    STATUS_FILTERS.some((f) => f.value === initialStatus) ? (initialStatus as string) : "ALL"
  );
  const [category, setCategory] = useState(
    initialCategory && categories.includes(initialCategory) ? initialCategory : "ALL"
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      if (category !== "ALL" && s.category !== category) return false;
      if (status === "FAVORITE" && !s.favorite) return false;
      if (status === "REVIEW" && !s.reviewFlag) return false;
      if (["UNLEARNED", "LEARNED", "WEAK"].includes(status) && s.status !== status) return false;
      if (!q) return true;
      const haystack = [s.id, s.name, s.abbreviation, s.category, s.shortDescription, ...s.keywords]
        .join(" ")
        .toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [services, query, status, category]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="例: EC2 / コンテナ / 暗号化 / 監視"
        autoFocus
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-amber-900"
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-3 py-1 text-sm ${
              status === f.value
                ? "bg-amber-500 font-semibold text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="ALL">全カテゴリ</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length}件ヒット</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <Link
            key={s.id}
            href={`/services/${s.id}`}
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold">{s.abbreviation}</span>
              <span className="flex items-center gap-1">
                {s.favorite && <span title="お気に入り">⭐</span>}
                {s.reviewFlag && <span title="復習対象">🔁</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_META[s.status].className}`}>
                  {STATUS_META[s.status].label}
                </span>
              </span>
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{s.name}</div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
              {s.shortDescription}
            </p>
            <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {s.category}
            </span>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-slate-400">該当するサービスがありません</p>
      )}
    </div>
  );
}
