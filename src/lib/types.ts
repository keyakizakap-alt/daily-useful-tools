export type ScreenshotStatus = "pending" | "analyzed" | "failed";

export interface Screenshot {
  id: string;
  user_id: string;
  storage_path: string;
  mime_type: string;
  status: ScreenshotStatus;
  ocr_text: string | null;
  summary: string | null;
  category: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/** Gemini から JSON で受け取る解析結果 */
export interface AnalysisResult {
  ocr_text: string;
  summary: string;
  category: string;
  tags: string[];
}

export const CATEGORIES = [
  "Web記事",
  "SNS",
  "店舗情報",
  "地図・経路",
  "チャット・メッセージ",
  "買い物・EC",
  "予定・チケット",
  "設定画面",
  "その他",
] as const;
