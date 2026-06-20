import { z } from "zod";
import { requireUser, json, error } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CreateLog = z.object({
  goalId: z.string().uuid(),
  studiedAt: z.string().date(),
  minutes: z.number().int().min(1).max(1440),
  content: z.string().max(500).optional(),
  understandingLevel: z.number().int().min(1).max(5).nullable().optional(),
  memo: z.string().max(1000).optional(),
  domain: z.string().max(100).optional(),
});

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const goalId = new URL(req.url).searchParams.get("goalId");
  const supabase = createSupabaseServerClient();
  let q = supabase.from("study_logs").select("*").eq("user_id", user!.id);
  if (goalId) q = q.eq("goal_id", goalId);
  const { data, error: e } = await q.order("studied_at", { ascending: false }).limit(200);
  if (e) return error(e.message, 500);
  return json({ logs: data });
}

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const parsed = CreateLog.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("入力値が不正です", 422, { issues: parsed.error.flatten() });

  const supabase = createSupabaseServerClient();
  const { data, error: e } = await supabase
    .from("study_logs")
    .insert({
      user_id: user!.id,
      goal_id: parsed.data.goalId,
      studied_at: parsed.data.studiedAt,
      minutes: parsed.data.minutes,
      content: parsed.data.content ?? null,
      understanding_level: parsed.data.understandingLevel ?? null,
      memo: parsed.data.memo ?? null,
      domain: parsed.data.domain ?? null,
    })
    .select()
    .single();
  if (e) return error(e.message, 500);
  return json({ log: data }, 201);
}
