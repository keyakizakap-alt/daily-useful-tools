import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseList } from "@/lib/json";
import { STATUS_META, type ProgressStatus } from "@/lib/progress";

export const dynamic = "force-dynamic";

const IMPORTANCE_LABEL: Record<number, string> = {
  3: "最重要",
  2: "重要",
  1: "押さえる",
};

// 資格別学習ページ（F004）
export default async function CertificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cert = await prisma.certification.findUnique({
    where: { id },
    include: {
      services: {
        orderBy: { order: "asc" },
        include: { service: { include: { progress: true } } },
      },
    },
  });
  if (!cert) notFound();

  const frequent = cert.services.filter((e) => e.frequency === 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{cert.code}</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {cert.level}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{cert.name}</p>
        </div>
        <Link
          href="/certifications"
          className="text-sm text-amber-600 hover:underline dark:text-amber-400"
        >
          ← 資格一覧
        </Link>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{cert.description}</p>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-bold">出題範囲</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
          {parseList(cert.examScope).map((scope) => (
            <li key={scope} className="flex gap-2">
              <span className="text-amber-500">●</span>
              <span>{scope}</span>
            </li>
          ))}
        </ul>
      </section>

      {frequent.length > 0 && (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <h2 className="font-bold text-amber-800 dark:text-amber-300">🔥 頻出サービス</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {frequent.map((e) => (
              <Link
                key={e.serviceId}
                href={`/services/${e.serviceId}`}
                className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-amber-700 hover:bg-amber-100 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                {e.service.abbreviation}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">重要サービスと推奨学習順</h2>
          <Link
            href={`/quiz?cert=${cert.id}`}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            この資格のクイズへ →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[560px] bg-white text-sm dark:bg-slate-900">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-2.5 font-semibold">学習順</th>
                <th className="px-4 py-2.5 font-semibold">サービス</th>
                <th className="px-4 py-2.5 font-semibold">優先度</th>
                <th className="px-4 py-2.5 font-semibold">頻出度</th>
                <th className="px-4 py-2.5 font-semibold">進捗</th>
              </tr>
            </thead>
            <tbody>
              {cert.services.map((e) => {
                const status = (e.service.progress?.status ?? "UNLEARNED") as ProgressStatus;
                return (
                  <tr
                    key={e.serviceId}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="px-4 py-2.5 text-slate-400">{e.order}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/services/${e.serviceId}`}
                        className="font-semibold text-amber-600 hover:underline dark:text-amber-400"
                      >
                        {e.service.abbreviation}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-amber-500">{"★".repeat(e.importance)}</span>
                      <span className="ml-1 text-xs text-slate-400">
                        {IMPORTANCE_LABEL[e.importance]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-rose-500">{"🔥".repeat(e.frequency)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_META[status].className}`}
                      >
                        {STATUS_META[status].label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
