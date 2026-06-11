import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResult } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const PROMPT = `あなたはスマートフォンのスクリーンショットを整理するアシスタントです。
添付された画像を解析し、次の情報を抽出してください。

- ocr_text: 画像内に写っているテキストをできる限り正確にすべて書き起こす（OCR）。
- summary: このスクリーンショットが何の画面で、何が重要かを日本語で1〜2文に要約する。
- category: 次のいずれか1つ: ${CATEGORIES.join(" / ")}
- tags: 後から検索しやすい日本語の短いタグを3〜6個（例: "ラーメン", "渋谷", "セール情報"）。

個人情報（電話番号・住所など）が写っている場合も、書き起こしは行って構いませんが、
タグや要約には含めないでください。`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    ocr_text: { type: Type.STRING },
    summary: { type: Type.STRING },
    category: { type: Type.STRING, enum: [...CATEGORIES] },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["ocr_text", "summary", "category", "tags"],
} as const;

/**
 * 画像（base64）を Gemini に渡し、構造化された解析結果を返す。
 *
 * 注意: Google AI Studio の API キーを有料（Pay-as-you-go）プランに
 * 紐付けると、送信データがモデルの学習に使用されなくなります。
 * https://ai.google.dev/gemini-api/terms
 */
export async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini から空のレスポンスが返されました");
  }

  const parsed = JSON.parse(text) as AnalysisResult;
  return {
    ocr_text: parsed.ocr_text ?? "",
    summary: parsed.summary ?? "",
    category: parsed.category ?? "その他",
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 10) : [],
  };
}
