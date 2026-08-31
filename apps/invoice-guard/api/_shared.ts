/**
 * Vercel Serverless Functions 用の薄い共通処理。
 *
 * `@vercel/node` の型に依存しないよう、必要な形だけを構造的に定義している。
 * Vercel の req/res は Node の IncomingMessage / ServerResponse を拡張したもので、
 * req.body は content-type が JSON なら自動でパース済みになる。ただし
 * ローカルの node:http では自動パースされないため、両方を扱えるようにしてある。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_BODY_BYTES, type HandlerResult } from '../src/handlers.ts';

export type VercelLikeRequest = IncomingMessage & {
  /** Vercel はJSONボディを自動でパースしてここに入れる */
  body?: unknown;
};

export type VercelLikeResponse = ServerResponse;

/** HandlerResult をそのまま HTTP レスポンスにする。 */
export function json(res: VercelLikeResponse, result: HandlerResult): void {
  const payload = JSON.stringify(result.body);
  res.statusCode = result.status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(payload);
}

/**
 * リクエストボディを JSON として読む。
 * Vercel がすでにパース済みならそれを使い、そうでなければストリームから読む。
 */
export async function readJsonBody(req: VercelLikeRequest): Promise<Record<string, unknown>> {
  if (req.body != null) {
    if (typeof req.body === 'object') return req.body as Record<string, unknown>;
    if (typeof req.body === 'string') {
      return req.body ? (JSON.parse(req.body) as Record<string, unknown>) : {};
    }
  }

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
