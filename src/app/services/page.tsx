import { prisma } from "@/lib/prisma";
import { parseList } from "@/lib/json";
import ServiceExplorer, { type ServiceListItem } from "@/components/ServiceExplorer";

export const dynamic = "force-dynamic";

// AWSサービス検索（F001）・進捗フィルタ（F005）
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const params = await searchParams;
  const [services, progresses] = await Promise.all([
    prisma.service.findMany({ orderBy: { abbreviation: "asc" } }),
    prisma.serviceProgress.findMany(),
  ]);

  const progressMap = new Map(progresses.map((p) => [p.serviceId, p]));

  const items: ServiceListItem[] = services.map((s) => {
    const p = progressMap.get(s.id);
    return {
      id: s.id,
      name: s.name,
      abbreviation: s.abbreviation,
      category: s.category,
      shortDescription: s.shortDescription,
      keywords: parseList(s.keywords),
      status: (p?.status ?? "UNLEARNED") as ServiceListItem["status"],
      favorite: p?.favorite ?? false,
      reviewFlag: p?.reviewFlag ?? false,
    };
  });

  const categories = [...new Set(items.map((i) => i.category))].sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">AWSサービス</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          サービス名・略称・日本語キーワードで検索できます（全{items.length}サービス）
        </p>
      </div>
      <ServiceExplorer
        services={items}
        categories={categories}
        initialStatus={params.status}
        initialCategory={params.category}
      />
    </div>
  );
}
