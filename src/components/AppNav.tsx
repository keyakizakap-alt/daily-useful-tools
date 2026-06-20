"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "ホーム", icon: "🏠" },
  { href: "/certifications", label: "資格", icon: "🎓" },
  { href: "/study-plan", label: "計画", icon: "🗓️" },
  { href: "/logs", label: "ログ", icon: "📝" },
  { href: "/mock-exams", label: "模試", icon: "📊" },
  { href: "/weakness", label: "弱点", icon: "🎯" },
  { href: "/review", label: "レビュー", icon: "🤖" },
  { href: "/billing", label: "プラン", icon: "💳" },
];

export default function AppNav({ planLabel }: { planLabel: string }) {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-black/5 px-3 py-5 md:block">
        <Link href="/dashboard" className="px-2 text-lg font-bold">🐾 ポチパス</Link>
        <p className="px-2 pt-1 text-xs text-ink-300">{planLabel}プラン</p>
        <nav className="mt-5 space-y-1">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${
                  active ? "bg-brand-50 font-medium text-brand-700" : "text-ink-700 hover:bg-black/[0.03]"
                }`}>
                <span>{n.icon}</span>{n.label}
              </Link>
            );
          })}
        </nav>
        <form action="/auth/signout" method="post" className="mt-6 px-2">
          <button className="text-sm text-ink-300 hover:text-ink-700">ログアウト</button>
        </form>
      </aside>

      {/* Mobile bottom tab */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-black/5 bg-white/95 backdrop-blur md:hidden">
        {NAV.slice(0, 6).map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-brand-600" : "text-ink-500"
              }`}>
              <span className="text-base">{n.icon}</span>{n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
