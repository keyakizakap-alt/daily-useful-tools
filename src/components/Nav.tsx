"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/", label: "ダッシュボード" },
  { href: "/services", label: "サービス" },
  { href: "/compare", label: "比較" },
  { href: "/certifications", label: "資格" },
  { href: "/quiz", label: "クイズ" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-sm text-white">AWS</span>
          <span className="hidden sm:inline">Learning Navigator</span>
          <span className="sm:hidden">Navigator</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto text-sm">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 ${
                  active
                    ? "bg-amber-100 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
