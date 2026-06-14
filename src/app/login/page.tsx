import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center text-lg font-bold">🐾 ポチパス</Link>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
