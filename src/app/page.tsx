import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ダッシュボード（F007）
export default async function DashboardPage() {
  const [totalServices, progresses, attempts, certs] = await Promise.all([
    prisma.service.count(),
    prisma.serviceProgress.findMany(),
    prisma.quizAttempt.findMany({ select: { correct: true } }),
    prisma.certification.findMany({
      orderBy: { studyOrder: "asc" },
      include: { services: { select: { serviceId: true } } },
    }),
  ]);

  const learnedIds = new Set(progresses.filter((p) => p.status === "LEARNED").map((p) => p.serviceId));
  const weakCount = progresses.filter((p) => p.status === "WEAK").length;
  const favoriteCount = progresses.filter((p) => p.favorite).length;
  const reviewCount = progresses.filter((p) => p.reviewFlag).length;
  const learnedCount = learnedIds.size;
  const learnRate = totalServices > 0 ? Math.round((learnedCount / totalServices) * 100) : 0;
  const weakRate = totalServices > 0 ? Math.round((weakCount / totalServices) * 100) : 0;
  const correctCount = attempts.filter((a) => a.correct).length;
  const accuracy = attempts.length > 0 ? Math.round((correctCount / attempts.length) * 100) : null;

  const stats = [
    { label: "総サービス数", value: String(totalServices), href: "/services" },
    { label: "学習済", value: `${learnedCount} (${learnRate}%)`, href: "/services?status=LEARNED" },
    { label: "苦手", value: `${weakCount} (${weakRate}%)`, href: "/services?status=WEAK" },
    { label: "お気に入り", value: String(favoriteCount), href: "/services?status=FAVORITE" },
    { label: "復習対象", value: String(reviewCount), href: "/services?status=REVIEW" },
    {
      label: "クイズ正答率",
      value: accuracy === null ? "—" : `${accuracy}% (${correctCount}/${attempts.length})`,
      href: "/quiz",
    },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          AWS全冠を目指す学習状況のサマリー
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
            <div className="mt-1 text-xl font-bold">{s.value}</div>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">資格別進捗</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {certs.map((c) => {
            const total = c.services.length;
            const learned = c.services.filter((s) => learnedIds.has(s.serviceId)).length;
            const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={`/certifications/${c.id}`}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold">{c.code}</span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{c.level}</span>
                  </div>
                  <span className="text-sm font-semibold">
                    {learned}/{total}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/services"
          className="rounded-xl bg-amber-500 p-5 font-bold text-white transition hover:bg-amber-600"
        >
          サービスを学ぶ →
        </Link>
        <Link
          href="/quiz"
          className="rounded-xl bg-slate-800 p-5 font-bold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          クイズに挑戦 →
        </Link>
        <Link
          href="/compare"
          className="rounded-xl border-2 border-amber-500 p-5 font-bold text-amber-600 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
        >
          サービスを比較 →
        </Link>
      </section>
    </div>
  );
}
