/**
 * Claude に返させる構造化出力のスキーマ。
 *
 * ここで要求するのは「紙面に何と書いてあったか」だけ。
 * 「適格請求書か」「控除できるか」は一切聞かない。それは core/ の責務であり、
 * 法令判断をモデルの出力に委ねると、監査可能性（なぜその結論になったかを
 * 説明できること）と再現性が失われるため。
 */

import * as z from 'zod/v4';

export const TaxLineSchema = z.object({
  rate: z
    .union([z.literal(0.1), z.literal(0.08)])
    .describe('適用税率。10%なら0.1、軽減8%なら0.08'),
  taxExcluded: z
    .number()
    .nullable()
    .describe('この税率区分の税抜対価の合計額（円、整数）。記載がなければ null'),
  taxAmount: z
    .number()
    .nullable()
    .describe('この税率区分の消費税額等（円、整数）。記載がなければ null'),
  reducedRateMarked: z
    .boolean()
    .describe(
      '軽減税率の対象品目である旨（※印や「軽減」等）の記載があるか。8%区分以外では false',
    ),
});

export const ExtractedInvoiceSchema = z.object({
  issuerName: z
    .string()
    .nullable()
    .describe('請求書を発行した事業者の氏名又は名称。記載がなければ null'),
  registrationNumber: z
    .string()
    .nullable()
    .describe(
      '適格請求書発行事業者の登録番号。紙面の表記のまま返す（例 "T1234567890123"）。記載がなければ null。推測して補完してはならない',
    ),
  transactionDate: z
    .string()
    .nullable()
    .describe(
      '取引年月日を YYYY-MM-DD 形式で。和暦は西暦に直す。請求日と取引日が別にある場合は取引日を優先。記載がなければ null',
    ),
  description: z
    .string()
    .nullable()
    .describe('取引内容（資産又は役務の内容）。複数明細があれば要約してよい'),
  taxLines: z
    .array(TaxLineSchema)
    .describe('税率ごとの内訳。紙面に区分の記載がなければ空配列にする'),
  recipientName: z
    .string()
    .nullable()
    .describe('請求書の宛名（交付を受ける事業者の氏名又は名称）。記載がなければ null'),
  totalIncludingTax: z
    .number()
    .nullable()
    .describe('請求合計額（税込、円）。記載がなければ null'),
  extractionNotes: z
    .array(z.string())
    .describe(
      '読み取れなかった箇所や判読に自信がない箇所を日本語で列挙する。問題がなければ空配列',
    ),
});

export type ExtractedInvoiceFromModel = z.infer<typeof ExtractedInvoiceSchema>;
