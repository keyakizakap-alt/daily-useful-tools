// ===========================================================================
// LLMプロバイダー抽象化層
// OpenAI / Mock を差し替え可能にする。将来 Anthropic 等を追加する場合も
// この LLMProvider インターフェースを実装すればよい。
// AI APIキーはサーバーサイドのみで読み込み、クライアントに露出しない。
// ===========================================================================

export interface LLMMessage {
  role: "system" | "user";
  content: string;
}

export interface LLMProvider {
  /** JSONモードでの生成。messages を渡し、文字列(JSON想定)を返す。 */
  completeJSON(messages: LLMMessage[]): Promise<string>;
}

// --------------------------- OpenAI 実装 ---------------------------
class OpenAIProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async completeJSON(messages: LLMMessage[]): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "{}";
  }
}

// --------------------------- Mock 実装 ---------------------------
// APIキー無しでもアプリが動くようにする開発用プロバイダー。
// 入力に含まれる構造化情報からそれっぽい計画/レビューを生成する。
import { mockComplete } from "./mock";

class MockProvider implements LLMProvider {
  async completeJSON(messages: LLMMessage[]): Promise<string> {
    return mockComplete(messages);
  }
}

let cached: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  const provider = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    cached = new OpenAIProvider(
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    );
  } else {
    cached = new MockProvider();
  }
  return cached;
}

/** AI出力に必ず添える免責。問題集ではなく学習支援であることを明示。 */
export const AI_DISCLAIMER =
  "※この内容はあなたの学習ログ・模試結果・公式シラバスの分野情報をもとにAIが作成した参考情報です。実際の出題範囲・配点・合格基準は必ず公式シラバスと公式試験ガイドでご確認ください。";
