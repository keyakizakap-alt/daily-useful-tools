/**
 * Claude による請求書の読み取り。
 *
 * 画像・PDF・テキストのいずれも受け取り、ExtractedInvoice を返す。
 * 判定は一切させない（schema.ts の冒頭コメント参照）。
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ExtractedInvoiceSchema } from './schema.ts';
import type { ExtractedInvoice, TaxRate } from '../core/types.ts';

/** システムプロンプトは固定文字列にしておく（プロンプトキャッシュの前方一致を壊さないため）。 */
const SYSTEM_PROMPT = `あなたは日本の請求書を読み取る専門家です。渡された請求書から、指定されたスキーマのとおりに「紙面に書かれている事実」だけを抽出してください。

厳守すること:
- 書かれていないものは推測せず null または空配列にする。特に登録番号を推測で補完してはならない。
- 登録番号は紙面の表記のまま返す。ハイフンや全角が混じっていてもそのまま返してよい。
- 金額は円単位の整数で返す。カンマや「円」は除く。
- 和暦（令和・平成）は西暦に変換する。
- 税率ごとの区分が紙面にない場合、自分で按分計算して埋めてはならない。空配列にする。
- 「適格請求書として有効か」「控除できるか」の判断はしない。それは別の工程が行う。
- 判読できない箇所や自信のない箇所は extractionNotes に日本語で記録する。`;

export interface ExtractInput {
  /** 画像 or PDF の base64（データURLのプレフィックスは含めない） */
  base64?: string;
  /** base64 を渡す場合の MIME タイプ */
  mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'application/pdf';
  /** テキストで渡す場合の本文 */
  text?: string;
}

/** モデルの生出力を core の型へ寄せる。 */
function toExtractedInvoice(parsed: unknown): ExtractedInvoice {
  const p = ExtractedInvoiceSchema.parse(parsed);
  return {
    issuerName: p.issuerName,
    registrationNumber: p.registrationNumber,
    transactionDate: p.transactionDate,
    description: p.description,
    taxLines: p.taxLines.map((l) => ({
      rate: l.rate as TaxRate,
      taxExcluded: l.taxExcluded,
      taxAmount: l.taxAmount,
      reducedRateMarked: l.reducedRateMarked,
    })),
    recipientName: p.recipientName,
    totalIncludingTax: p.totalIncludingTax,
    extractionNotes: p.extractionNotes,
  };
}

/** 入力を Claude のコンテンツブロックに変換する。 */
function buildContent(input: ExtractInput): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];

  if (input.base64 && input.mediaType) {
    if (input.mediaType === 'application/pdf') {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: input.base64 },
      });
    } else {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: input.mediaType, data: input.base64 },
      });
    }
  }

  if (input.text && input.text.trim().length > 0) {
    blocks.push({ type: 'text', text: `請求書のテキスト:\n\n${input.text}` });
  }

  blocks.push({ type: 'text', text: 'この請求書から記載事項を抽出してください。' });
  return blocks;
}

export class InvoiceExtractor {
  private client: Anthropic;

  constructor(client?: Anthropic) {
    // 引数なしなら ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ant auth のプロファイルを解決する
    this.client = client ?? new Anthropic();
  }

  async extract(input: ExtractInput): Promise<ExtractedInvoice> {
    if (!input.base64 && !input.text) {
      throw new Error('画像・PDF・テキストのいずれかを渡してください。');
    }

    const response = await this.client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildContent(input) }],
      output_config: { format: zodOutputFormat(ExtractedInvoiceSchema) },
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(
        `モデルが応答を拒否しました（${response.stop_details?.category ?? '理由不明'}）。別の画像でお試しください。`,
      );
    }

    if (response.parsed_output == null) {
      throw new Error('請求書を構造化できませんでした。画像が不鮮明な可能性があります。');
    }

    return toExtractedInvoice(response.parsed_output);
  }
}

/** SDK の例外を利用者向けの日本語メッセージに変換する。 */
export function describeApiError(error: unknown): { status: number; message: string } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: 'APIキーが無効です。ANTHROPIC_API_KEY を確認してください。' };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: 'レート制限に達しました。少し待って再試行してください。' };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { status: 400, message: `リクエストが不正です: ${error.message}` };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 503, message: 'Claude API に接続できませんでした。' };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: error.status ?? 500, message: `Claude API エラー: ${error.message}` };
  }
  return { status: 500, message: error instanceof Error ? error.message : String(error) };
}
