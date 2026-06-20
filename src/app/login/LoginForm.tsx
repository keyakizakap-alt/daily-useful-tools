"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const params = useSearchParams();
  const initialSignup = params.get("mode") === "signup";
  const redirect = params.get("redirect") ?? "/dashboard";

  const [isSignup, setIsSignup] = useState(initialSignup);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createSupabaseBrowserClient();

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback?redirect=${redirect}` },
        });
        if (error) throw error;
        setMsg("確認メールを送信しました。メール内のリンクから登録を完了してください。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = redirect;
      }
    } catch (err: any) {
      setMsg(err?.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?redirect=${redirect}` },
    });
  }

  return (
    <div className="card mt-6">
      <h1 className="text-lg font-bold">{isSignup ? "新規登録" : "ログイン"}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {isSignup ? "メールアドレスで無料アカウントを作成" : "おかえりなさい"}
      </p>

      <button onClick={handleGoogle} className="btn-outline mt-4 w-full">
        Googleで{isSignup ? "登録" : "ログイン"}
      </button>

      <div className="my-4 flex items-center gap-3 text-xs text-ink-300">
        <span className="h-px flex-1 bg-black/10" />または<span className="h-px flex-1 bg-black/10" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        <div>
          <label className="label">メールアドレス</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
        </div>
        <div>
          <label className="label">パスワード</label>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="6文字以上" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "処理中…" : isSignup ? "登録する" : "ログイン"}
        </button>
      </form>

      {msg && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{msg}</p>}

      <button onClick={() => setIsSignup((v) => !v)} className="mt-4 w-full text-center text-sm text-ink-500 hover:text-ink-700">
        {isSignup ? "アカウントをお持ちですか？ ログイン" : "アカウントがない方は 新規登録"}
      </button>
    </div>
  );
}
