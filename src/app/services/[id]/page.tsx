import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseList } from "@/lib/json";
import { DEFAULT_PROGRESS, type ProgressInfo } from "@/lib/progress";
import ProgressControls from "@/components/ProgressControls";

export const dynamic = "force-dynamic";

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-amber-500">●</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ServiceLinks({ title, ids }: { title: string; ids: string[] }) {
  if (ids.length === 0) return null;
  const services = await prisma.service.findMany({ where: { id: { in: ids } } });
  if (services.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {services.map((s) => (
          <Link
            key={s.id}
            href={`/services/${s.id}`}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-amber-100 hover:text-amber-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-amber-900/40 dark:hover:text-amber-300"
          >
            {s.abbreviation}
          </Link>
        ))}
      </div>
    </section>
  );
}

// AWSサービス詳細（F002）
export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = await prisma.service.findUnique({
    where: { id },
    include: {
      progress: true,
      certEntries: { include: { certification: true }, orderBy: { importance: "desc" } },
    },
  });
  if (!service) notFound();

  const progress: ProgressInfo = service.progress
    ? {
        status: service.progress.status as ProgressInfo["status"],
        favorite: service.progress.favorite,
        reviewFlag: service.progress.reviewFlag,
      }
    : DEFAULT_PROGRESS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{service.abbreviation}</h1>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {service.category}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{service.name}</p>
        </div>
        <Link href="/services" className="text-sm text-amber-600 hover:underline dark:text-amber-400">
          ← サービス一覧
        </Link>
      </div>

      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
        {service.shortDescription}
      </p>

      <ProgressControls serviceId={service.id} initial={progress} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-bold">詳細説明</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {service.description}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="主な用途" items={parseList(service.useCases)} />
        <Section title="利用シーン" items={parseList(service.scenarios)} />
        <Section title="試験ポイント" items={parseList(service.examPoints)} />
        <Section title="注意点" items={parseList(service.cautions)} />
      </div>

      <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
        <h2 className="font-bold text-amber-800 dark:text-amber-300">💡 覚え方</h2>
        <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">{service.mnemonic}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ServiceLinks title="関連サービス" ids={parseList(service.relatedServices)} />
        <ServiceLinks title="類似サービス" ids={parseList(service.similarServices)} />
      </div>

      {service.certEntries.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-bold">出題される資格</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {service.certEntries.map((e) => (
              <Link
                key={e.certificationId}
                href={`/certifications/${e.certificationId}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-amber-100 hover:text-amber-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-amber-900/40 dark:hover:text-amber-300"
              >
                {e.certification.code} {"★".repeat(e.importance)}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
