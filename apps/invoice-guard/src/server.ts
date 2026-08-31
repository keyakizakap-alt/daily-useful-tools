/**
 * ローカル開発用サーバー（node:http）。
 *
 * 本番は Vercel の Serverless Functions（api/*.ts）で動く。両者は src/handlers.ts の
 * 同じ関数を呼ぶので、判定結果は一致する。ここが持つのは通信と静的配信だけ。
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_BODY_BYTES,
  auditExtracted,
  auditWithAI,
  getConfig,
  getSamples,
  hasApiKey,
} from './handlers.ts';
import { describeApiError } from './extract/claude.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Vercel が静的配信するのと同じ public/ をローカルでも配る。 */
const PUBLIC_DIR = path.join(HERE, '..', 'public');
const PORT = Number(process.env.PORT ?? 3000);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** リクエストボディを上限つきで読む。 */
async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > MAX_BODY_BYTES) {
      throw Object.assign(new Error('ファイルが大きすぎます（上限約3MB）。'), { status: 413 });
    }
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
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

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    try {
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const r = getConfig();
        sendJson(res, r.status, r.body);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/samples') {
        const r = getSamples();
        sendJson(res, r.status, r.body);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/audit-extracted') {
        const r = auditExtracted(await readBody(req));
        sendJson(res, r.status, r.body);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/audit') {
        const r = await auditWithAI(await readBody(req));
        sendJson(res, r.status, r.body);
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
