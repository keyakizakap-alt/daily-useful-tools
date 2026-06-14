import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 資格一覧（F004）
export default async function CertificationsPage() {
  const [certs, progresses] = await Promise.all([
    prisma.certification.findMany({
      orderBy: { studyOrder: "asc" },
      include: { services: { select: { serviceId: true } } },
    }),
    prisma.serviceProgress.findMany({ where: { status: "LEARNED" } }),
  ]);
  const learnedIds = new Set(progresses.map((p) => p.serviceId));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">AWS認定資格</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          AWS全冠を見据えた推奨受験順に並んでいます
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {certs.map((c) => {
          const total = c.services.length;
          const learned = c.services.filter((s) => learnedIds.has(s.serviceId)).length;
          const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
          return (
            <Link
              key={c.id}
              href={`/certifications/${c.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                  {c.studyOrder}
                </span>
                <span className="text-lg font-bold">{c.code}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {c.level}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{c.name}</p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                {c.description}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {learned}/{total}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
