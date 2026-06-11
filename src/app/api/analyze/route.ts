import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeScreenshot } from "@/lib/gemini";

export const maxDuration = 60; // Vercel Hobby の上限内で Gemini の応答を待つ

/**
 * POST /api/analyze
 * body: { screenshotId: string }
 *
 * アップロード済みスクショを Gemini で解析し、結果を DB に保存する。
 * Supabase クライアントはユーザーのセッション（Cookie）で動くため、
 * RLS により本人のレコード・画像にしかアクセスできない。
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let screenshotId: unknown;
  try {
    ({ screenshotId } = await request.json());
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (typeof screenshotId !== "string") {
    return NextResponse.json(
      { error: "screenshotId が必要です" },
      { status: 400 }
    );
  }

  // RLS により自分の行しか取得できない
  const { data: screenshot, error: fetchError } = await supabase
    .from("screenshots")
    .select("*")
    .eq("id", screenshotId)
    .single();

  if (fetchError || !screenshot) {
    return NextResponse.json(
      { error: "スクリーンショットが見つかりません" },
      { status: 404 }
    );
  }

  try {
    // ストレージも RLS（自分のフォルダのみ）で保護されている
    const { data: blob, error: downloadError } = await supabase.storage
      .from("screenshots")
      .download(screenshot.storage_path);

    if (downloadError || !blob) {
      throw new Error(`画像のダウンロードに失敗: ${downloadError?.message}`);
    }

    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const result = await analyzeScreenshot(base64, screenshot.mime_type);

    const { data: updated, error: updateError } = await supabase
      .from("screenshots")
      .update({
        ocr_text: result.ocr_text,
        summary: result.summary,
        category: result.category,
        tags: result.tags,
        status: "analyzed",
      })
      .eq("id", screenshotId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`DB 更新に失敗: ${updateError.message}`);
    }

    return NextResponse.json({ screenshot: updated });
  } catch (err) {
    console.error("analyze failed:", err);
    await supabase
      .from("screenshots")
      .update({ status: "failed" })
      .eq("id", screenshotId);

    return NextResponse.json(
      { error: "解析に失敗しました。後で再試行してください。" },
      { status: 500 }
    );
  }
}
