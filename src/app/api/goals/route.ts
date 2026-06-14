import { z } from "zod";
import { requireEntitledUser, json, error } from "@/lib/api";
import { canAddGoal } from "@/lib/entitlements";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CreateGoal = z.object({
  certificationId: z.string().uuid(),
  examDate: z.string().date().nullable().optional(),
  targetScore: z.number().int().min(0).max(1000).nullable().optional(),
  currentLevel: z.number().int().min(0).max(100).default(0),
  dailyAvailableMinutes: z.number().int().min(5).max(600).default(30),
});

export async function GET() {
  const { user, response } = await requireEntitledUser();
  if (response) return response;
  const supabase = createSupabaseServerClient();
  const { data, error: e } = await supabase
    .from("user_certification_goals")
    .select("*, certification:certifications(*)")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (e) return error(e.message, 500);
  return json({ goals: data });
}

export async function POST(req: Request) {
  const { user, ent, response } = await requireEntitledUser();
  if (response) return response;

  // サーバーサイドの権限チェック（フロント制御に依存しない）
  const gate = canAddGoal(ent);
  if (!gate.ok) return error(gate.reason, 403, { upsell: gate.upsell });

  const parsed = CreateGoal.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("入力値が不正です", 422, { issues: parsed.error.flatten() });

  const supabase = createSupabaseServerClient();
  const { data, error: e } = await supabase
    .from("user_certification_goals")
    .insert({
      user_id: user.id,
      certification_id: parsed.data.certificationId,
      exam_date: parsed.data.examDate ?? null,
      target_score: parsed.data.targetScore ?? null,
      current_level: parsed.data.currentLevel,
      daily_available_minutes: parsed.data.dailyAvailableMinutes,
    })
    .select("*, certification:certifications(*)")
    .single();

  if (e) return error(e.message, 500);
  return json({ goal: data }, 201);
}
