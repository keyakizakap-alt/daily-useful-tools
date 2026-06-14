"use client";

import Link from "next/link";
import { useState } from "react";
import type { Comparison } from "@/data/comparisons";

export default function ComparePicker({ comparisons }: { comparisons: Comparison[] }) {
  const [selectedId, setSelectedId] = useState(comparisons[0]?.id);
  const selected = comparisons.find((c) => c.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {comparisons.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              c.id === selectedId
                ? "bg-amber-500 font-semibold text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            {selected.summary}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[640px] bg-white text-sm dark:bg-slate-900">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="w-36 px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400">
                    比較項目
                  </th>
                  <th className="px-4 py-3 text-left font-bold">
                    {selected.aServiceId ? (
                      <Link
                        href={`/services/${selected.aServiceId}`}
                        className="text-amber-600 hover:underline dark:text-amber-400"
                      >
                        {selected.aName}
                      </Link>
                    ) : (
                      selected.aName
                    )}
                  </th>
                  <th className="px-4 py-3 text-left font-bold">
                    {selected.bServiceId ? (
                      <Link
                        href={`/services/${selected.bServiceId}`}
                        className="text-amber-600 hover:underline dark:text-amber-400"
                      >
                        {selected.bName}
                      </Link>
                    ) : (
                      selected.bName
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {selected.rows.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">
                      {row.label}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.a}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
