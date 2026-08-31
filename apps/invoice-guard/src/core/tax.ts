/**
 * 税率ごとの消費税額の検算。
 *
 * 適格請求書では「税率ごとに区分した消費税額等」の端数処理は
 * 一の適格請求書につき税率ごとに1回と定められているが、切上げ・切捨て・
 * 四捨五入のどれを採るかは事業者の任意。したがって本ツールは特定の丸めを
 * 強制せず、3方式の全てを許容範囲として扱い、そのいずれからも外れる場合にのみ
 * 「計算が合わない」と指摘する。
 *
 * これは意図的な設計判断である。正当な請求書を誤って不備と判定すると、
 * 経理担当者が取引先に不要な問い合わせをすることになり、ツールの信頼が失われる。
 * 偽陽性を出さないことを、検出漏れを減らすことより優先している。
 */

import type { TaxCheck, TaxLine } from './types.ts';

/** 税抜額から消費税額を、許容される3つの端数処理で算出した範囲を返す。 */
export function expectedTaxRange(taxExcluded: number, rate: number): [number, number] {
  const exact = taxExcluded * rate;
  const candidates = [Math.floor(exact), Math.round(exact), Math.ceil(exact)];
  return [Math.min(...candidates), Math.max(...candidates)];
}

/** 税率ごとの内訳を検算する。 */
export function checkTaxLines(lines: TaxLine[]): TaxCheck[] {
  return lines.map((line) => {
    const pct = `${line.rate * 100}%`;

    if (line.taxExcluded == null || line.taxAmount == null) {
      return {
        rate: line.rate,
        stated: line.taxAmount,
        expectedRange: null,
        ok: false,
        detail: `${pct}区分は対価又は消費税額が読み取れないため検算できません。`,
      };
    }

    const range = expectedTaxRange(line.taxExcluded, line.rate);
    const ok = line.taxAmount >= range[0] && line.taxAmount <= range[1];

    // 端数が出ない金額では下限と上限が一致する。その場合に「25,000〜25,000円」と
    // 出すと不自然なので、1つの金額として表示する。
    const expectedText =
      range[0] === range[1]
        ? `${range[0].toLocaleString('ja-JP')}円`
        : `${range[0].toLocaleString('ja-JP')}〜${range[1].toLocaleString('ja-JP')}円（端数処理により幅があります）`;

    return {
      rate: line.rate,
      stated: line.taxAmount,
      expectedRange: range,
      ok,
      detail: ok
        ? `${pct}区分: ${line.taxExcluded.toLocaleString('ja-JP')}円 × ${pct} = ${line.taxAmount.toLocaleString('ja-JP')}円 で整合しています。`
        : `${pct}区分の消費税額が合いません。記載は ${line.taxAmount.toLocaleString('ja-JP')}円ですが、` +
          `${line.taxExcluded.toLocaleString('ja-JP')}円 × ${pct} は ${expectedText} になるはずです。`,
    };
  });
}

/** 読み取れた消費税額の合計。読み取れなかった区分は 0 として扱う。 */
export function totalTaxAmount(lines: TaxLine[]): number {
  return lines.reduce((sum, l) => sum + (l.taxAmount ?? 0), 0);
}

/**
 * 消費税額が読み取れない区分について、税抜額から推計した合計。
 * 金額影響の試算にのみ使い、要件判定には使わない。
 */
export function estimatedTotalTax(lines: TaxLine[]): number {
  return lines.reduce((sum, l) => {
    if (l.taxAmount != null) return sum + l.taxAmount;
    if (l.taxExcluded != null) return sum + Math.floor(l.taxExcluded * l.rate);
    return sum;
  }, 0);
}
