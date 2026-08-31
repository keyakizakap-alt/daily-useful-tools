/**
 * サーバーのテスト。APIキーなしで完結する範囲を検証する。
 * /api/audit（Claude 呼び出し）はキーがない環境で 503 を返すことを確認する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

import { createServer } from '../src/server.ts';

/** テスト用にサーバーを立て、終わったら必ず閉じる。 */
async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GET /api/config は AI の利用可否を返す', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.aiAvailable, 'boolean');
    assert.equal(body.model, 'claude-opus-5');
    assert.match(body.today, /^\d{4}-\d{2}-\d{2}$/);
  });
});

test('GET /api/samples はサンプル一覧を返す', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/samples`);
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list) && list.length >= 5);
    assert.ok(list.every((s: { id: string; label: string }) => s.id && s.label));
  });
});

test('GET / は画面を返す', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /InvoiceGuard/);
  });
});

test('静的配信はディレクトリ外に出られない', async () => {
  await withServer(async (base) => {
    // fetch 側で正規化されないよう、生のパスを送る
    const res = await fetch(`${base}/..%2f..%2fpackage.json`);
    assert.ok(res.status === 403 || res.status === 404, `想定外のステータス: ${res.status}`);
  });
});

test('POST /api/audit-extracted: サンプルIDで監査できる（APIキー不要）', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/audit-extracted`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sampleId: 'no_registration' }),
    });
    assert.equal(res.status, 200);
    const { audit } = await res.json();
    assert.equal(audit.invoiceClass, 'non_registered');
    // 2026-09-25 の取引なので 80%
    assert.equal(audit.impact.appliedRate, 0.8);
    assert.equal(audit.impact.deductible, 24_000);
    assert.equal(audit.impact.lost, 6_000);
  });
});

test('POST /api/audit-extracted: レシートのサンプルは簡易請求書として扱われる', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/audit-extracted`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sampleId: 'receipt' }),
    });
    const { audit } = await res.json();
    // 宛名がなくても適格と判定されること
    assert.equal(audit.invoiceClass, 'qualified');
  });
});

test('POST /api/audit-extracted: 存在しないサンプルは404', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/audit-extracted`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sampleId: 'nope' }),
    });
    assert.equal(res.status, 404);
  });
});

test('POST /api/audit-extracted: 手入力のJSONも監査できる', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/audit-extracted`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        invoice: {
          issuerName: 'テスト商店',
          registrationNumber: 'T7000012050002',
          transactionDate: '2026-08-01',
          description: '物品販売',
          taxLines: [{ rate: 0.1, taxExcluded: 10_000, taxAmount: 1_000 }],
          recipientName: '株式会社受領',
          totalIncludingTax: 11_000,
        },
      }),
    });
    assert.equal(res.status, 200);
    const { audit } = await res.json();
    assert.equal(audit.invoiceClass, 'qualified');
    assert.equal(audit.impact.deductible, 1_000);
  });
});

test('POST /api/audit-extracted: 壊れた入力でも落ちない', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/audit-extracted`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        invoice: {
          issuerName: 123,
          registrationNumber: { nope: true },
          taxLines: [{ rate: 0.05 }, 'garbage', null],
          extractionNotes: 'not-an-array',
        },
      }),
    });
    assert.equal(res.status, 200);
    const { invoice, audit } = await res.json();
    assert.equal(invoice.issuerName, null);
    assert.equal(invoice.registrationNumber, null);
    // 未知の税率(5%)や不正な要素は捨てられる
    assert.deepEqual(invoice.taxLines, []);
    assert.equal(audit.invoiceClass, 'non_registered');
  });
});

test('POST /api/audit: APIキーがなければ 503 と案内を返す', async (t) => {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    t.skip('APIキーが設定されている環境のためスキップ');
    return;
  }
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '請求書' }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /ANTHROPIC_API_KEY/);
    // 行き止まりにせず代替手段を案内していること
    assert.match(body.error, /サンプル/);
  });
});
