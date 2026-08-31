/**
 * Vercel Serverless Functions（api/*.ts）のテスト。
 *
 * 本番で実際に動くのはこのハンドラであって src/server.ts ではない。
 * ローカルサーバーだけ通ってデプロイ先で落ちる、という事態を防ぐために
 * ハンドラを直接 node:http にマウントして叩く。
 *
 * Vercel は JSON ボディを req.body にパース済みで渡すため、その経路も検証する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import configHandler from '../api/config.ts';
import samplesHandler from '../api/samples.ts';
import auditExtractedHandler from '../api/audit-extracted.ts';
import auditHandler from '../api/audit.ts';
import type { VercelLikeRequest, VercelLikeResponse } from '../api/_shared.ts';

type Handler = (req: VercelLikeRequest, res: VercelLikeResponse) => void | Promise<void>;

/**
 * ハンドラ1つをサーバーとして立てる。
 * @param preParseBody true なら Vercel と同じく req.body にパース済みの値を入れる
 */
async function withHandler<T>(
  handler: Handler,
  fn: (base: string) => Promise<T>,
  preParseBody = false,
): Promise<T> {
  const server = http.createServer((req, res) => {
    if (!preParseBody) {
      void handler(req as VercelLikeRequest, res);
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const r = req as VercelLikeRequest;
      r.body = text ? JSON.parse(text) : {};
      void handler(r, res);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('api/config: 設定を返す', async () => {
  await withHandler(configHandler, async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.model, 'claude-opus-5');
    assert.equal(typeof body.aiAvailable, 'boolean');
    // クライアントが事前にサイズを弾けるよう上限を返していること
    assert.equal(body.maxUploadBytes, 4 * 1024 * 1024);
  });
});

test('api/samples: サンプル一覧を返す', async () => {
  await withHandler(samplesHandler, async (base) => {
    const res = await fetch(`${base}/api/samples`);
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list) && list.length >= 5);
  });
});

test('api/audit-extracted: ストリームからボディを読める（ローカル相当）', async () => {
  await withHandler(auditExtractedHandler, async (base) => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sampleId: 'no_registration' }),
    });
    assert.equal(res.status, 200);
    const { audit } = await res.json();
    assert.equal(audit.invoiceClass, 'non_registered');
    assert.equal(audit.impact.deductible, 24_000);
  });
});

test('api/audit-extracted: req.body がパース済みでも読める（Vercel相当）', async () => {
  await withHandler(
    auditExtractedHandler,
    async (base) => {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sampleId: 'qualified' }),
      });
      assert.equal(res.status, 200);
      const { audit } = await res.json();
      assert.equal(audit.invoiceClass, 'qualified');
      assert.equal(audit.impact.lost, 0);
    },
    true,
  );
});

test('api/audit-extracted: GET は 405', async () => {
  await withHandler(auditExtractedHandler, async (base) => {
    const res = await fetch(base);
    assert.equal(res.status, 405);
  });
});

test('api/audit-extracted: 壊れたJSONでも 400 を返して落ちない', async () => {
  await withHandler(auditExtractedHandler, async (base) => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(typeof body.error === 'string' && body.error.length > 0);
  });
});

test('api/audit: APIキーがなければ 503 と代替手段を案内する', async (t) => {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    t.skip('APIキーが設定されている環境のためスキップ');
    return;
  }
  await withHandler(auditHandler, async (base) => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '請求書' }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /ANTHROPIC_API_KEY/);
    assert.match(body.error, /サンプル/);
  });
});

test('api/audit: 対応外の形式は 400', async (t) => {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    // キーがないと形式チェックより先に 503 で返るため、この検証はできない
    t.skip('APIキー未設定のためスキップ');
    return;
  }
  await withHandler(auditHandler, async (base) => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base64: 'AAAA', mediaType: 'image/tiff' }),
    });
    assert.equal(res.status, 400);
  });
});
