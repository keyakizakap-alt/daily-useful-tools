/**
 * サンプル請求書。
 *
 * APIキーがなくても監査エンジン全体を動かして評価できるようにするためのもの。
 * デモ用の飾りではなく、導入検討時に「自社の請求書がどう判定されるか」を
 * 事前に確かめるための入口として置いている。
 *
 * 登録番号はいずれも架空の事業者のものだが、法人番号のチェックディジットは
 * 正しく計算した値を入れてある（検証ロジックの挙動を正しく再現するため）。
 */

import type { ExtractedInvoice } from '../core/types.ts';

export interface Sample {
  id: string;
  label: string;
  /** この例で何が起きるかの一言 */
  summary: string;
  invoice: ExtractedInvoice;
  simplified?: boolean;
}

export const SAMPLES: readonly Sample[] = [
  {
    id: 'qualified',
    label: '① 要件を満たした適格請求書',
    summary: '6要件すべてを満たし、税額計算も整合。全額を控除できる。',
    invoice: {
      issuerName: '株式会社ミドリ電機',
      registrationNumber: 'T4010001012345',
      transactionDate: '2026-08-20',
      description: 'サーバー保守運用費（2026年8月分）',
      taxLines: [{ rate: 0.1, taxExcluded: 480_000, taxAmount: 48_000 }],
      recipientName: '株式会社サンプル',
      totalIncludingTax: 528_000,
      extractionNotes: [],
    },
  },
  {
    id: 'no_registration',
    label: '② 登録番号がない請求書（免税事業者等）',
    summary:
      '登録番号の記載がないため経過措置の割合しか控除できない。2026年10月1日を境に控除額が減る。',
    invoice: {
      issuerName: '田中デザイン事務所',
      registrationNumber: null,
      transactionDate: '2026-09-25',
      description: 'Webサイト デザイン制作費',
      taxLines: [{ rate: 0.1, taxExcluded: 300_000, taxAmount: 30_000 }],
      recipientName: '株式会社サンプル',
      totalIncludingTax: 330_000,
      extractionNotes: [],
    },
  },
  {
    id: 'defective',
    label: '③ 登録番号はあるが記載不備',
    summary:
      '本来は全額控除できるのに、宛名と軽減税率の明示が欠けているため根拠書類として不十分。再交付を依頼すべき典型例。',
    invoice: {
      issuerName: '有限会社カワセ商店',
      registrationNumber: 'T2020002054321',
      transactionDate: '2026-08-05',
      description: '会議用弁当・飲料、事務用品',
      taxLines: [
        { rate: 0.1, taxExcluded: 40_000, taxAmount: 4_000 },
        { rate: 0.08, taxExcluded: 60_000, taxAmount: 4_800, reducedRateMarked: false },
      ],
      recipientName: null,
      totalIncludingTax: 108_800,
      extractionNotes: [],
    },
  },
  {
    id: 'tax_mismatch',
    label: '④ 消費税額が合わない請求書',
    summary: '税抜額と消費税額が整合しない。転記ミスや改ざんの検出例。',
    invoice: {
      issuerName: '株式会社ハヤブサ物流',
      registrationNumber: 'T8030003098765',
      transactionDate: '2026-08-12',
      description: '配送業務委託費',
      taxLines: [{ rate: 0.1, taxExcluded: 250_000, taxAmount: 20_000 }],
      recipientName: '株式会社サンプル',
      totalIncludingTax: 270_000,
      extractionNotes: [],
    },
  },
  {
    id: 'receipt',
    label: '⑤ レシート（適格簡易請求書）',
    summary: '小売店のレシート。宛名がなくても適格簡易請求書として要件を満たす。',
    simplified: true,
    invoice: {
      issuerName: 'スーパーあおぞら 中央店',
      registrationNumber: 'T4010001012345',
      transactionDate: '2026-08-28',
      description: '飲料・菓子（軽減税率対象 ※）、日用品',
      taxLines: [
        { rate: 0.1, taxExcluded: 1_200, taxAmount: 120 },
        { rate: 0.08, taxExcluded: 2_500, taxAmount: 200, reducedRateMarked: true },
      ],
      recipientName: null,
      totalIncludingTax: 4_020,
      extractionNotes: [],
    },
  },
] as const;

export function findSample(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}
