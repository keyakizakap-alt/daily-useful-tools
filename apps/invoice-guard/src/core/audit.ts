/**
 * 監査エンジン。抽出結果を受け取り、区分判定・要件判定・金額影響を出す。
 * ここには AI を一切介在させない。同じ入力からは常に同じ結果が出る。
 */

import type {
  AuditResult,
  DeductionImpact,
  ExtractedInvoice,
  InvoiceClass,
  RequirementResult,
} from './types.ts';
import { checkRegistrationNumber } from './registration-number.ts';
import { checkRequirements } from './requirements.ts';
import { checkTaxLines, estimatedTotalTax } from './tax.ts';
import {
  ANNUAL_CAP_YEN,
  daysUntilOctober2026,
  isCapApplicable,
  stageForDate,
  transitionalRate,
} from './transitional.ts';

export interface AuditOptions {
  /** 適格簡易請求書（レシート等）として判定するか */
  simplified?: boolean;
  /** 取引年月日が読み取れなかった場合に代わりに使う日付 YYYY-MM-DD */
  fallbackDate?: string;
}

/** 要件のうち、満たされていないものだけを返す。 */
function unmet(reqs: RequirementResult[]): RequirementResult[] {
  return reqs.filter((r) => r.status !== 'ok');
}

/**
 * 金額影響を算出する。
 *
 * - 適格請求書        : 消費税額の全額が控除できる
 * - 登録番号あり・不備 : 記載不備のままでは控除の根拠にできない。全額を「危険な額」として扱う
 * - 登録番号なし      : 取引日に応じた経過措置の割合のみ控除できる
 */
export function computeImpact(
  inv: ExtractedInvoice,
  invoiceClass: InvoiceClass,
  date: string,
): DeductionImpact {
  const totalTax = estimatedTotalTax(inv.taxLines);

  if (invoiceClass === 'qualified') {
    return {
      totalTax,
      appliedRate: 1,
      deductible: totalTax,
      lost: 0,
      octoberDelta: 0,
      detail: '適格請求書の要件を満たしているため、消費税額の全額を仕入税額控除できます。',
    };
  }

  if (invoiceClass === 'qualified_defective') {
    return {
      totalTax,
      appliedRate: 1,
      deductible: totalTax,
      lost: 0,
      octoberDelta: 0,
      detail:
        `登録番号はあるため本来は全額（${totalTax.toLocaleString('ja-JP')}円）を控除できます。` +
        'ただし記載事項に不備があるままでは控除の根拠書類として不十分です。' +
        '取引先に再交付を依頼すれば損失は発生しません。放置した場合はこの全額が否認されるおそれがあります。',
    };
  }

  // 免税事業者等からの仕入れ。経過措置の割合のみ。
  const rate = transitionalRate(date);
  const deductible = Math.floor(totalTax * rate);
  const lost = totalTax - deductible;
  const stage = stageForDate(date);

  // 2026-10-01 の 80% → 70% でいくら変わるか
  const before = Math.floor(totalTax * 0.8);
  const after = Math.floor(totalTax * 0.7);
  const days = daysUntilOctober2026(date);
  const octoberDelta = days > 0 ? before - after : 0;

  const parts = [
    `登録番号の記載がないため、免税事業者等からの仕入れとして経過措置が適用されます。`,
    `取引日 ${date} は「${stage?.label ?? '制度開始前'}」の期間にあたり、` +
      `消費税額 ${totalTax.toLocaleString('ja-JP')}円 のうち ${deductible.toLocaleString('ja-JP')}円 だけが控除でき、` +
      `${lost.toLocaleString('ja-JP')}円 は控除できません。`,
  ];
  if (days > 0) {
    parts.push(
      `2026年10月1日から控除割合が80%→70%に下がります（あと${days}日）。` +
        `同じ請求書でも控除できる額が ${octoberDelta.toLocaleString('ja-JP')}円 減ります。`,
    );
  }
  if (isCapApplicable(date)) {
    parts.push(
      `なお、同一の免税事業者等からの課税仕入れ（税込）が年間 ${ANNUAL_CAP_YEN.toLocaleString('ja-JP')}円 を超える部分には` +
        'この経過措置を適用できません。取引先別の年間累計をご確認ください。',
    );
  }

  return {
    totalTax,
    appliedRate: rate,
    deductible,
    lost,
    octoberDelta,
    detail: parts.join(''),
  };
}

/** 請求書1枚を監査する。 */
export function auditInvoice(inv: ExtractedInvoice, options: AuditOptions = {}): AuditResult {
  const simplified = options.simplified ?? false;
  const requirements = checkRequirements(inv, simplified);
  const registration = checkRegistrationNumber(inv.registrationNumber);
  const taxChecks = checkTaxLines(inv.taxLines);

  const date =
    inv.transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.transactionDate)
      ? inv.transactionDate
      : (options.fallbackDate ?? new Date().toISOString().slice(0, 10));

  // 区分判定
  //   登録番号が形式として有効に読み取れていれば適格請求書の候補。
  //   そのうえで6要件と税額検算に問題がなければ 'qualified'。
  const taxMathOk = taxChecks.every((c) => c.ok);
  let invoiceClass: InvoiceClass;
  if (!registration.present || !registration.formatValid) {
    invoiceClass = 'non_registered';
  } else if (unmet(requirements).length === 0 && taxMathOk) {
    invoiceClass = 'qualified';
  } else {
    invoiceClass = 'qualified_defective';
  }

  const impact = computeImpact(inv, invoiceClass, date);

  // 対応事項を重要度順に組み立てる
  const actions: string[] = [];
  if (invoiceClass === 'non_registered') {
    if (registration.present && !registration.formatValid) {
      actions.push(
        `登録番号「${registration.normalized}」が「T+13桁」の形式になっていません。読み取り誤りの可能性があるため、まず原本を確認してください。`,
      );
    }
    actions.push(
      '取引先が適格請求書発行事業者として登録済みかを確認してください。登録済みであれば、登録番号を記載した請求書の再交付を依頼することで全額を控除できます。',
    );
  }
  if (invoiceClass === 'qualified_defective') {
    for (const r of unmet(requirements)) {
      actions.push(`【要件${r.id}】${r.label}: ${r.detail}`);
    }
    for (const c of taxChecks.filter((c) => !c.ok)) {
      actions.push(c.detail);
    }
    actions.push('上記を修正した請求書の再交付を取引先に依頼してください。');
  }
  if (registration.checkDigitValid === false) {
    actions.push(registration.detail);
  }
  for (const note of inv.extractionNotes) {
    actions.push(`読み取り時の注意: ${note}`);
  }

  return { invoiceClass, requirements, registration, taxChecks, impact, actions };
}
