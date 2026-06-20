// Route Handler 共通ユーティリティ。
import { NextResponse } from "next/server";
import { getCurrentUser } from "./supabase/server";
import { getEntitlements, type Entitlements } from "./entitlements";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** 認証必須API用。未ログインなら401を投げる。 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: error("認証が必要です", 401) } as const;
  }
  return { user, response: null } as const;
}

/** ユーザー + 実効エンタイトルメントをまとめて取得。 */
export async function requireEntitledUser(): Promise<
  | { user: { id: string; email?: string }; ent: Entitlements; response: null }
  | { user: null; ent: null; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, ent: null, response: error("認証が必要です", 401) };
  }
  const ent = await getEntitlements(user.id);
  return { user: { id: user.id, email: user.email ?? undefined }, ent, response: null };
}
