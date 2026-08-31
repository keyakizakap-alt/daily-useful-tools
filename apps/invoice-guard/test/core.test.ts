/**
 * 決定論的な監査エンジンのテスト。API キー不要で完結する。
 * 実行: npm test  （= node --test test/）
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  corporateCheckDigit,
  isValidCorporateNumber,
  normalizeRegistrationNumber,
  checkRegistrationNumber,
} from '../src/core/registration-number.ts';
import {
  stageForDate,
  transitionalRate,
  isCapApplicable,
  daysUntilOctober2026,
  TRANSITIONAL_STAGES,
} from '../src/core/transitional.ts';
import { expectedTaxRange, checkTaxLines } from '../src/core/tax.ts';
import { auditInvoice } from '../src/core/audit.ts';
import type { ExtractedInvoice } from '../src/core/types.ts';

// ---------------------------------------------------------------------------
// 登録番号 / 法人番号チェックディジット
// ---------------------------------------------------------------------------

test('チェックディジット: 実在する法人番号で検算できる', () => {
  // 外部で裏付けの取れている実在の法人番号を基準点に使う。
  // 7000012050002 = 国税庁（東京都千代田区霞が関3-1-1、2015-10-05 指定）。
  // 手計算: 基礎番号 000012050002 の Σ = 2+5+2+2 = 11、9 - (11 mod 9) = 7。
  assert.equal(corporateCheckDigit('000012050002'), 7);
  assert.ok(isValidCorporateNumber('7000012050002'));
});

test('チェックディジット: 生成した番号は必ず自身の検証を通る（往復性）', () => {
  // 実在性を確認できない番号を「実在する」と偽って固定値で並べるより、
  // アルゴリズムの往復性を広く確認するほうが検証として強い。
  for (let i = 0; i < 2000; i++) {
    const base = String((i * 104_729) % 1_000_000_000_000).padStart(12, '0');
    const full = `${corporateCheckDigit(base)}${base}`;
    assert.ok(isValidCorporateNumber(full), `${full} が自身の検証を通りません`);
  }
});

test('チェックディジット: 1桁変えると検出できる', () => {
  assert.ok(isValidCorporateNumber('7000012050002'));
  // 末尾を 2 → 3 に変える
  assert.ok(!isValidCorporateNumber('7000012050003'));
  // 先頭の検査用数字を 7 → 6 に変える
  assert.ok(!isValidCorporateNumber('6000012050002'));
});

test('チェックディジットは 1〜9 になり 0 は出ない（法人番号は0始まりにならない）', () => {
  for (let i = 0; i < 500; i++) {
    const base = String(i * 7919 + 1).padStart(12, '0').slice(-12);
    const cd = corporateCheckDigit(base);
    assert.ok(cd >= 1 && cd <= 9, `${base} → ${cd}`);
  }
});

test('登録番号の正規化: 全角・ハイフン・空白を吸収する', () => {
  assert.equal(normalizeRegistrationNumber('Ｔ７００００１２０５０００２'), 'T7000012050002');
  assert.equal(normalizeRegistrationNumber('T7000012050002'), 'T7000012050002');
  assert.equal(normalizeRegistrationNumber('T-7000-0120-50002'), 'T7000012050002');
  assert.equal(normalizeRegistrationNumber('  t7000012050002  '), 'T7000012050002');
  assert.equal(normalizeRegistrationNumber(null), null);
  assert.equal(normalizeRegistrationNumber('   '), null);
});

test('登録番号: 記載なし / 形式不正 / 整合 / 不整合 の4通りを区別する', () => {
  const none = checkRegistrationNumber(null);
  assert.equal(none.present, false);
  assert.equal(none.formatValid, false);

  const malformed = checkRegistrationNumber('T12345');
  assert.equal(malformed.present, true);
  assert.equal(malformed.formatValid, false);
  assert.equal(malformed.checkDigitValid, null);

  const good = checkRegistrationNumber('T7000012050002');
  assert.equal(good.formatValid, true);
  assert.equal(good.checkDigitValid, true);

  // 形式は正しいがチェックディジットが合わない（個人事業者番号の可能性あり）
  const mismatch = checkRegistrationNumber('T1234567890123');
  assert.equal(mismatch.formatValid, true);
  assert.equal(mismatch.checkDigitValid, false);
  // 断定していないこと
  assert.match(mismatch.detail, /個人事業者/);
});

// ---------------------------------------------------------------------------
// 経過措置スケジュール
// ---------------------------------------------------------------------------

test('経過措置: 2026-10-01 の境界で 80% → 70% に切り替わる', () => {
  assert.equal(transitionalRate('2026-09-30'), 0.8);
  assert.equal(transitionalRate('2026-10-01'), 0.7);
});

test('経過措置: 5段階すべての割合と境界', () => {
  assert.equal(transitionalRate('2023-10-01'), 0.8);
  assert.equal(transitionalRate('2026-09-30'), 0.8);
  assert.equal(transitionalRate('2026-10-01'), 0.7);
  assert.equal(transitionalRate('2028-09-30'), 0.7);
  assert.equal(transitionalRate('2028-10-01'), 0.5);
  assert.equal(transitionalRate('2030-09-30'), 0.5);
  assert.equal(transitionalRate('2030-10-01'), 0.3);
  assert.equal(transitionalRate('2031-09-30'), 0.3);
  assert.equal(transitionalRate('2031-10-01'), 0);
  assert.equal(transitionalRate('2040-01-01'), 0);
});

test('経過措置: 制度開始前は経過措置の対象外', () => {
  assert.equal(stageForDate('2023-09-30'), null);
  assert.equal(transitionalRate('2023-09-30'), 1);
});

test('経過措置: 段階が隙間なく連続している', () => {
  for (let i = 0; i < TRANSITIONAL_STAGES.length - 1; i++) {
    assert.equal(
      TRANSITIONAL_STAGES[i].endExclusive,
      TRANSITIONAL_STAGES[i + 1].start,
      `段階 ${i} と ${i + 1} の間に隙間または重複があります`,
    );
  }
});

test('1億円上限は 2026-10-01 以降の段階にのみ及ぶ', () => {
  assert.equal(isCapApplicable('2026-09-30'), false);
  assert.equal(isCapApplicable('2026-10-01'), true);
});

test('2026-10-01 までの残日数', () => {
  assert.equal(daysUntilOctober2026('2026-10-01'), 0);
  assert.equal(daysUntilOctober2026('2026-09-30'), 1);
  assert.equal(daysUntilOctober2026('2026-08-31'), 31);
  assert.ok(daysUntilOctober2026('2026-11-01') < 0);
});

// ---------------------------------------------------------------------------
// 税額検算
// ---------------------------------------------------------------------------

test('税額検算: 切捨て・四捨五入・切上げのいずれも許容する', () => {
  // 10,001円 × 10% = 1000.1 → 1000(切捨/四捨五入) または 1001(切上)
  const [lo, hi] = expectedTaxRange(10_001, 0.1);
  assert.equal(lo, 1000);
  assert.equal(hi, 1001);

  const checks = checkTaxLines([
    { rate: 0.1, taxExcluded: 10_001, taxAmount: 1000 },
    { rate: 0.1, taxExcluded: 10_001, taxAmount: 1001 },
  ]);
  assert.ok(checks[0].ok, '切捨てが弾かれてはいけない');
  assert.ok(checks[1].ok, '切上げが弾かれてはいけない');
});

test('税額検算: 明確にずれている場合は検出する', () => {
  const checks = checkTaxLines([{ rate: 0.1, taxExcluded: 100_000, taxAmount: 8_000 }]);
  assert.equal(checks[0].ok, false);
  assert.match(checks[0].detail, /合いません/);
});

test('税額検算: 8%の軽減税率も正しく扱う', () => {
  const checks = checkTaxLines([{ rate: 0.08, taxExcluded: 50_000, taxAmount: 4_000 }]);
  assert.ok(checks[0].ok);
});

// ---------------------------------------------------------------------------
// 監査の統合
// ---------------------------------------------------------------------------

/** 要件をすべて満たす請求書のひな形。 */
function goodInvoice(overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    issuerName: '株式会社サンプル商事',
    registrationNumber: 'T7000012050002',
    transactionDate: '2026-08-20',
    description: 'コンサルティング業務一式',
    taxLines: [{ rate: 0.1, taxExcluded: 500_000, taxAmount: 50_000 }],
    recipientName: '株式会社テスト',
    totalIncludingTax: 550_000,
    extractionNotes: [],
    ...overrides,
  };
}

test('適格請求書: 全要件を満たせば全額控除', () => {
  const r = auditInvoice(goodInvoice());
  assert.equal(r.invoiceClass, 'qualified');
  assert.equal(r.requirements.filter((x) => x.status !== 'ok').length, 0);
  assert.equal(r.impact.deductible, 50_000);
  assert.equal(r.impact.lost, 0);
});

test('宛名なし: 通常の請求書では不備、適格簡易請求書では不備にならない', () => {
  const inv = goodInvoice({ recipientName: null });

  const normal = auditInvoice(inv);
  assert.equal(normal.invoiceClass, 'qualified_defective');
  assert.ok(normal.requirements.some((x) => x.id === 6 && x.status === 'missing'));

  const simplified = auditInvoice(inv, { simplified: true });
  assert.equal(simplified.invoiceClass, 'qualified');
});

test('軽減税率の明示なし: 8%区分があるのに旨の記載がなければ不備', () => {
  const inv = goodInvoice({
    taxLines: [
      { rate: 0.1, taxExcluded: 500_000, taxAmount: 50_000 },
      { rate: 0.08, taxExcluded: 100_000, taxAmount: 8_000, reducedRateMarked: false },
    ],
  });
  const r = auditInvoice(inv);
  assert.equal(r.invoiceClass, 'qualified_defective');
  assert.ok(r.requirements.some((x) => x.id === 3 && x.status === 'missing'));

  // 旨の記載があれば通る
  const ok = auditInvoice(
    goodInvoice({
      taxLines: [
        { rate: 0.1, taxExcluded: 500_000, taxAmount: 50_000 },
        { rate: 0.08, taxExcluded: 100_000, taxAmount: 8_000, reducedRateMarked: true },
      ],
    }),
  );
  assert.equal(ok.invoiceClass, 'qualified');
});

test('登録番号なし: 取引日で控除額が変わる（2026-10-01 の境界）', () => {
  const base = goodInvoice({ registrationNumber: null });

  const before = auditInvoice({ ...base, transactionDate: '2026-09-30' });
  assert.equal(before.invoiceClass, 'non_registered');
  assert.equal(before.impact.appliedRate, 0.8);
  assert.equal(before.impact.deductible, 40_000);
  assert.equal(before.impact.lost, 10_000);

  const after = auditInvoice({ ...base, transactionDate: '2026-10-01' });
  assert.equal(after.impact.appliedRate, 0.7);
  assert.equal(after.impact.deductible, 35_000);
  assert.equal(after.impact.lost, 15_000);

  // 1日ずれるだけで 5,000円 の差
  assert.equal(before.impact.deductible - after.impact.deductible, 5_000);
});

test('登録番号なし: 引き下げ前なら10月以降との差額を提示する', () => {
  const r = auditInvoice(goodInvoice({ registrationNumber: null, transactionDate: '2026-08-31' }));
  assert.equal(r.impact.octoberDelta, 5_000);
  assert.match(r.impact.detail, /あと31日/);
});

test('登録番号なし: 引き下げ後は差額の案内を出さない', () => {
  const r = auditInvoice(goodInvoice({ registrationNumber: null, transactionDate: '2026-11-01' }));
  assert.equal(r.impact.octoberDelta, 0);
  assert.doesNotMatch(r.impact.detail, /あと\d+日/);
});

test('登録番号あり・記載不備: 損失は0だが是正が必要と伝える', () => {
  const r = auditInvoice(goodInvoice({ transactionDate: null }));
  assert.equal(r.invoiceClass, 'qualified_defective');
  assert.equal(r.impact.lost, 0);
  assert.ok(r.actions.some((a) => a.includes('再交付')));
});

test('税額の誤りがあれば適格と判定しない', () => {
  const r = auditInvoice(
    goodInvoice({ taxLines: [{ rate: 0.1, taxExcluded: 500_000, taxAmount: 40_000 }] }),
  );
  assert.equal(r.invoiceClass, 'qualified_defective');
  assert.ok(r.taxChecks.some((c) => !c.ok));
});

test('1億円上限の注意喚起は 2026-10-01 以降にのみ出る', () => {
  const before = auditInvoice(
    goodInvoice({ registrationNumber: null, transactionDate: '2026-09-30' }),
  );
  assert.doesNotMatch(before.impact.detail, /1億|100,000,000/);

  const after = auditInvoice(
    goodInvoice({ registrationNumber: null, transactionDate: '2026-10-01' }),
  );
  assert.match(after.impact.detail, /100,000,000/);
});

test('監査は決定論的: 同じ入力から常に同じ結果', () => {
  const inv = goodInvoice({ registrationNumber: null, transactionDate: '2026-10-15' });
  const a = JSON.stringify(auditInvoice(inv));
  const b = JSON.stringify(auditInvoice(inv));
  assert.equal(a, b);
});
