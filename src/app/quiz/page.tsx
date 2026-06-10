import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseList } from "@/lib/json";
import QuizPlayer, { type QuizItem } from "@/components/QuizPlayer";

export const dynamic = "force-dynamic";

const TYPE_FILTERS = [
  { value: "", label: "すべて" },
  { value: "BASIC", label: "基本四択" },
  { value: "USECASE", label: "用途から選択" },
  { value: "COMPARISON", label: "使い分け" },
  { value: "CERT", label: "資格別" },
];

// クイズ機能（F006）
export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; cert?: string }>;
}) {
  const params = await searchParams;
  const type = TYPE_FILTERS.some((f) => f.value === params.type) ? params.type : undefined;
  const cert = params.cert;

  const [quizzes, certs] = await Promise.all([
    prisma.quiz.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(cert ? { certificationId: cert } : {}),
      },
    }),
    prisma.certification.findMany({ orderBy: { studyOrder: "asc" } }),
  ]);

  const items: QuizItem[] = quizzes.map((q) => ({
    id: q.id,
    type: q.type,
    question: q.question,
    choices: parseList(q.choices),
    answerIndex: q.answerIndex,
    explanation: q.explanation,
    serviceId: q.serviceId,
  }));

  const buildHref = (nextType?: string, nextCert?: string) => {
    const sp = new URLSearchParams();
    if (nextType) sp.set("type", nextType);
    if (nextCert) sp.set("cert", nextCert);
    const qs = sp.toString();
    return qs ? `/quiz?${qs}` : "/quiz";
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">クイズ</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          四択問題で理解度をチェックしましょう（対象: {items.length}問）
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">形式:</span>
        {TYPE_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={buildHref(f.value || undefined, cert)}
            className={`rounded-full px-3 py-1 ${
              (type ?? "") === f.value
                ? "bg-amber-500 font-semibold text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">資格:</span>
        <Link
          href={buildHref(type, undefined)}
          className={`rounded-full px-3 py-1 ${
            !cert
              ? "bg-amber-500 font-semibold text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          指定なし
        </Link>
        {certs.map((c) => (
          <Link
            key={c.id}
            href={buildHref(type, c.id)}
            className={`rounded-full px-3 py-1 ${
              cert === c.id
                ? "bg-amber-500 font-semibold text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {c.code}
          </Link>
        ))}
      </div>

      {items.length > 0 ? (
        <QuizPlayer key={`${type ?? ""}-${cert ?? ""}`} quizzes={items} />
      ) : (
        <p className="py-10 text-center text-slate-400">
          条件に一致する問題がありません。フィルタを変更してください。
        </p>
      )}
    </div>
  );
}
