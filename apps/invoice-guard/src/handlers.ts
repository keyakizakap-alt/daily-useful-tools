/**
 * エンドポイントの中身。通信層（node:http / Vercel Functions）から独立させてある。
 *
 * ローカルは src/server.ts（node:http）、Vercel は api/*.ts（Serverless Functions）
 * から同じ関数を呼ぶ。どちらで動かしても判定結果が変わらないようにするため、
 * ロジックはここ1か所にしか置かない。
 */

import { auditInvoice } from './core/audit.ts';
import type { ExtractedInvoice } from './core/types.ts';
import { InvoiceExtractor } from './extract/claude.ts';
import { SAMPLES, findSample } from './extract/samples.ts';

/** ハンドラの戻り値。通信層はこれをそのまま JSON にして返すだけ。 */
export interface HandlerResult {
  status: number;
  body: unknown;
}

/** 受け付けるファイル形式。 */
export const ALLOWED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/**
 * アップロードの上限。
 *
 * Vercel の Serverless Functions はリクエストボディが 4.5MB に制限されている
 * （プラットフォーム側の制限で、設定では変えられない）。base64 は元データの
 * 約1.37倍になるため、実ファイルで約3MBが上限になる。
 * ローカルでも同じ上限にしておかないと「手元では通るのに本番で落ちる」ことになる。
 */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getConfig(): HandlerResult {
  return {
    status: 200,
    body: {
      aiAvailable: hasApiKey(),
      model: 'claude-opus-5',
      today: new Date().toISOString().slice(0, 10),
      maxUploadBytes: MAX_BODY_BYTES,
    },
  };
}

export function getSamples(): HandlerResult {
  return {
    status: 200,
    body: SAMPLES.map((s) => ({
      id: s.id,
      label: s.label,
      summary: s.summary,
      simplified: s.simplified ?? false,
    })),
  };
}

/** 外部入力を ExtractedInvoice として受け入れられる形に正規化する。 */
export function coerceInvoice(raw: unknown): ExtractedInvoice {
  if (typeof raw !== 'object' || raw == null) {
    throw Object.assign(new Error('invoice オブジェクトが必要です。'), { status: 400 });
  }
  const o = raw as Record<string, unknown>;
  const lines = Array.isArray(o.taxLines) ? o.taxLines : [];

  const asNumOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const asStrOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v : null;

  return {
    issuerName: asStrOrNull(o.issuerName),
    registrationNumber: asStrOrNull(o.registrationNumber),
    transactionDate: asStrOrNull(o.transactionDate),
    description: asStrOrNull(o.description),
    taxLines: lines.flatMap((l) => {
      if (typeof l !== 'object' || l == null) return [];
      const line = l as Record<string, unknown>;
      const rate = line.rate === 0.08 ? 0.08 : line.rate === 0.1 ? 0.1 : null;
      if (rate == null) return [];
      return [
        {
          rate,
          taxExcluded: asNumOrNull(line.taxExcluded),
          taxAmount: asNumOrNull(line.taxAmount),
          reducedRateMarked: line.reducedRateMarked === true,
        },
      ];
    }),
    recipientName: asStrOrNull(o.recipientName),
    totalIncludingTax: asNumOrNull(o.totalIncludingTax),
    extractionNotes: Array.isArray(o.extractionNotes)
      ? o.extractionNotes.filter((n): n is string => typeof n === 'string')
      : [],
  };
}

/** 抽出済みJSON または サンプルID を監査する。APIキー不要。 */
export function auditExtracted(body: Record<string, unknown>): HandlerResult {
  let invoice: ExtractedInvoice;
  let simplified = body.simplified === true;

  if (typeof body.sampleId === 'string') {
    const sample = findSample(body.sampleId);
    if (!sample) {
      return { status: 404, body: { error: `サンプル「${body.sampleId}」は存在しません。` } };
    }
    invoice = sample.invoice;
    simplified = sample.simplified ?? false;
  } else {
    invoice = coerceInvoice(body.invoice);
  }

  return { status: 200, body: { invoice, audit: auditInvoice(invoice, { simplified }) } };
}

/** 画像・PDF・テキストを Claude で読み取ってから監査する。APIキーが必要。 */
export async function auditWithAI(body: Record<string, unknown>): Promise<HandlerResult> {
  if (!hasApiKey()) {
    return {
      status: 503,
      body: {
        error:
          'ANTHROPIC_API_KEY が設定されていないため、請求書の読み取りは実行できません。サンプルでの動作確認は「サンプルで試す」から行えます。',
      },
    };
  }

  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : undefined;
  if (mediaType && !ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return {
      status: 400,
      body: {
        error: `対応していない形式です（${mediaType}）。PNG・JPEG・GIF・WebP・PDF に対応しています。`,
      },
    };
  }

  const extractor = new InvoiceExtractor();
  const invoice = await extractor.extract({
    base64: typeof body.base64 === 'string' ? body.base64 : undefined,
    mediaType: mediaType as never,
    text: typeof body.text === 'string' ? body.text : undefined,
  });

  return {
    status: 200,
    body: { invoice, audit: auditInvoice(invoice, { simplified: body.simplified === true }) },
  };
}
