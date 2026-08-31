/** POST /api/audit — 画像・PDF・テキストを Claude で読み取って監査する。 */
import { auditWithAI } from '../src/handlers.ts';
import { describeApiError } from '../src/extract/claude.ts';
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
    json(res, await auditWithAI(await readJsonBody(req)));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') {
      json(res, { status, body: { error: (error as Error).message } });
      return;
    }
    const described = describeApiError(error);
    json(res, { status: described.status, body: { error: described.message } });
  }
}
