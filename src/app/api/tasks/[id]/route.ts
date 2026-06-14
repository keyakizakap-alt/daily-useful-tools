import { z } from "zod";
import { requireUser, json, error } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const Body = z.object({ status: z.enum(["todo", "done", "skipped"]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error("入力値が不正です", 422);

  const supabase = createSupabaseServerClient();
  const { data, error: e } = await supabase
    .from("study_tasks")
    .update({
      status: parsed.data.status,
      completed_at: parsed.data.status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", params.id)
    .eq("user_id", user!.id)
    .select()
    .maybeSingle();
  if (e) return error(e.message, 500);
  if (!data) return error("対象が見つかりません", 404);
  return json({ task: data });
}
