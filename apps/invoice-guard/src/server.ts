/**
 * InvoiceGuard サーバー。
 *
 * 依存を増やさないため node:http で書いている。ルートは4つだけ。
 *   GET  /                    静的ファイル
 *   GET  /api/config          APIキーの有無など、クライアントが分岐に使う情報
 *   GET  /api/samples         サンプル請求書の一覧
 *   POST /api/audit           請求書を読み取って監査する（画像/PDF/テキスト）
 *   POST /api/audit-extracted 抽出済みJSONを監査する（サンプル・手入力用。APIキー不要）
 *
 * APIキーはサーバー側にのみ置く。ブラウザには絶対に渡さない。
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditInvoice } from './core/audit.ts';
import type { ExtractedInvoice } from './core/types.ts';
import { InvoiceExtractor, describeApiError } from './extract/claude.ts';
import { SAMPLES, findSample } from './extract/samples.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, 'public');
const PORT = Number(process.env.PORT ?? 3000);

/** アップロード上限。Claude の画像/PDF 制限より十分手前で切る。 */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const ALLOWED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** リクエストボディを上限つきで読む。 */
async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > MAX_BODY_BYTES) {
      throw Object.assign(new Error('ファイルが大きすぎます（上限12MB）。'), { status: 413 });
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 外部入力を ExtractedInvoice として受け入れられるか検証する。 */
function coerceInvoice(raw: unknown): ExtractedInvoice {
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

async function serveStatic(res: http.ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, rel);

  // ディレクトリ外への脱出を防ぐ
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(target);
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const hasApiKey = (): boolean =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    try {
      if (req.method === 'GET' && url.pathname === '/api/config') {
        sendJson(res, 200, {
          aiAvailable: hasApiKey(),
          model: 'claude-opus-5',
          today: new Date().toISOString().slice(0, 10),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/samples') {
        sendJson(
          res,
          200,
          SAMPLES.map((s) => ({
            id: s.id,
            label: s.label,
            summary: s.summary,
            simplified: s.simplified ?? false,
          })),
        );
        return;
      }

      // サンプル or 手入力の監査。APIキー不要。
      if (req.method === 'POST' && url.pathname === '/api/audit-extracted') {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;

        let invoice: ExtractedInvoice;
        let simplified = body.simplified === true;

        if (typeof body.sampleId === 'string') {
          const sample = findSample(body.sampleId);
          if (!sample) {
            sendJson(res, 404, { error: `サンプル「${body.sampleId}」は存在しません。` });
            return;
          }
          invoice = sample.invoice;
          simplified = sample.simplified ?? false;
        } else {
          invoice = coerceInvoice(body.invoice);
        }

        sendJson(res, 200, { invoice, audit: auditInvoice(invoice, { simplified }) });
        return;
      }

      // 実ファイルの読み取り + 監査。APIキーが必要。
      if (req.method === 'POST' && url.pathname === '/api/audit') {
        if (!hasApiKey()) {
          sendJson(res, 503, {
            error:
              'ANTHROPIC_API_KEY が設定されていないため、請求書の読み取りは実行できません。サンプルでの動作確認は「サンプルで試す」から行えます。',
          });
          return;
        }

        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const mediaType = typeof body.mediaType === 'string' ? body.mediaType : undefined;

        if (mediaType && !ALLOWED_MEDIA_TYPES.has(mediaType)) {
          sendJson(res, 400, {
            error: `対応していない形式です（${mediaType}）。PNG・JPEG・GIF・WebP・PDF に対応しています。`,
          });
          return;
        }

        const extractor = new InvoiceExtractor();
        const invoice = await extractor.extract({
          base64: typeof body.base64 === 'string' ? body.base64 : undefined,
          mediaType: mediaType as never,
          text: typeof body.text === 'string' ? body.text : undefined,
        });

        const audit = auditInvoice(invoice, { simplified: body.simplified === true });
        sendJson(res, 200, { invoice, audit });
        return;
      }

      if (req.method === 'GET') {
        await serveStatic(res, url.pathname);
        return;
      }

      sendJson(res, 405, { error: 'Method Not Allowed' });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (typeof status === 'number') {
        sendJson(res, status, { error: (error as Error).message });
        return;
      }
      const described = describeApiError(error);
      sendJson(res, described.status, { error: described.message });
    }
  });
}

// 直接実行されたときだけ listen する（テストから import できるように）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`InvoiceGuard: http://localhost:${PORT}`);
    console.log(
      hasApiKey()
        ? 'ANTHROPIC_API_KEY を検出しました。請求書の読み取りが利用できます。'
        : 'ANTHROPIC_API_KEY が未設定です。サンプルでの動作確認のみ利用できます。',
    );
  });
}
