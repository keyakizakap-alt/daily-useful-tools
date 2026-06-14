import { z } from "zod";
import { requireUser, json, error } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UpdateGoal = z.object({
  examDate: z.string().date().nullable().optional(),
  targetScore: z.number().int().min(0).max(1000).nullable().optional(),
  currentLevel: z.number().int().min(0).max(100).optional(),
  dailyAvailableMinutes: z.number().int().min(5).max(600).optional(),
  status: z.enum(["active", "paused", "done", "archived"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  const parsed = UpdateGoal.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("入力値が不正です", 422);

  const patch: Record<string, unknown> = {};
  if (parsed.data.examDate !== undefined) patch.exam_date = parsed.data.examDate;
  if (parsed.data.targetScore !== undefined) patch.target_score = parsed.data.targetScore;
  if (parsed.data.currentLevel !== undefined) patch.current_level = parsed.data.currentLevel;
  if (parsed.data.dailyAvailableMinutes !== undefined) patch.daily_available_minutes = parsed.data.dailyAvailableMinutes;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  const supabase = createSupabaseServerClient();
  // RLS により他人の行は更新できない（user_id一致が必須）
  const { data, error: e } = await supabase
    .from("user_certification_goals")
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", user!.id)
    .select()
    .maybeSingle();
  if (e) return error(e.message, 500);
  if (!data) return error("対象が見つかりません", 404);
  return json({ goal: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  const supabase = createSupabaseServerClient();
  const { error: e } = await supabase
    .from("user_certification_goals")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user!.id);
  if (e) return error(e.message, 500);
  return json({ ok: true });
}
