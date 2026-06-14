import Link from "next/link";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "bg-brand-50 border-brand-100" : ""}>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </Card>
  );
}

export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "amber" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    gray: "bg-black/[0.05] text-ink-700",
    green: "bg-brand-50 text-brand-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function ProBadge() {
  return <Badge tone="green">Pro</Badge>;
}

export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-lg bg-black/[0.03] px-3 py-2 text-[11px] leading-relaxed text-ink-500">
      {text}
    </p>
  );
}

export function SectionTitle({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-ink-500">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function UpsellCard({ message }: { message?: string }) {
  return (
    <Card className="bg-gradient-to-br from-brand-50 to-white border-brand-100">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🐾</span>
        <div>
          <p className="font-semibold text-brand-700">Proでもっと伴走できます</p>
          <p className="mt-1 text-sm text-ink-700">
            {message ??
              "資格の登録無制限・毎週のAIレビュー・合格可能性スコア・弱点分析がすべて使えます。"}
          </p>
          <Link href="/billing" className="btn-primary mt-3">
            プランを見る
          </Link>
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  desc,
  cta,
}: {
  title: string;
  desc?: string;
  cta?: ReactNode;
}) {
  return (
    <Card className="text-center py-10">
      <p className="text-3xl">🐶</p>
      <p className="mt-2 font-semibold">{title}</p>
      {desc && <p className="mt-1 text-sm text-ink-500">{desc}</p>}
      {cta && <div className="mt-4 flex justify-center">{cta}</div>}
    </Card>
  );
}
