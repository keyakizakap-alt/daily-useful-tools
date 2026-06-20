import { redirect } from "next/navigation";
import AppNav from "@/components/AppNav";
import { getCurrentUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ent = await getEntitlements(user.id);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl">
      <AppNav planLabel={ent.plan.label} />
      <main className="flex-1 px-4 py-5 pb-24 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
