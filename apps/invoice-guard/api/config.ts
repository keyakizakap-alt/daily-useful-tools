/** GET /api/config — Vercel Serverless Function。ロジックは src/handlers.ts。 */
import { getConfig } from '../src/handlers.ts';
import { json, type VercelLikeRequest, type VercelLikeResponse } from './_shared.ts';

export default function handler(_req: VercelLikeRequest, res: VercelLikeResponse): void {
  json(res, getConfig());
}
