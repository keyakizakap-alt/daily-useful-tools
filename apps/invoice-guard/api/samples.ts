/** GET /api/samples — Vercel Serverless Function。 */
import { getSamples } from '../src/handlers.ts';
import { json, type VercelLikeRequest, type VercelLikeResponse } from './_shared.ts';

export default function handler(_req: VercelLikeRequest, res: VercelLikeResponse): void {
  json(res, getSamples());
}
