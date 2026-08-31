/** POST /api/audit-extracted — サンプル/手入力の監査。APIキー不要。 */
import { auditExtracted } from '../src/handlers.ts';
import { json, readJsonBody, type VercelLikeRequest, type VercelLikeResponse } from './_shared.ts';

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    json(res, { status: 405, body: { error: 'Method Not Allowed' } });
    return;
  }
  try {
    json(res, auditExtracted(await readJsonBody(req)));
  } catch (error) {
    const status = (error as { status?: number }).status ?? 400;
    json(res, { status, body: { error: (error as Error).message } });
  }
}
