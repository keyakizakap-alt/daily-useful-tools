/**
 * 適格請求書の記載事項（6項目）の充足判定。
 *
 * 国税庁 No.6625「適格請求書等の記載事項」に定める記載事項:
 *   1. 適格請求書発行事業者の氏名又は名称及び登録番号
 *   2. 課税資産の譲渡等を行った年月日
 *   3. 課税資産の譲渡等に係る資産又は役務の内容
 *      （軽減税率の対象品目である場合はその旨）
 *   4. 課税資産の譲渡等の税抜価額又は税込価額を税率ごとに区分して合計した金額
 *      及び適用税率
 *   5. 税率ごとに区分した消費税額等
 *   6. 書類の交付を受ける事業者の氏名又は名称
 *
 * 適格「簡易」請求書（小売業・飲食店業・タクシー業等が交付できるレシート等）では
 * 6 を省略でき、かつ 4 の「適用税率」と 5 の「消費税額等」はいずれか一方でよい。
 */

import type { ExtractedInvoice, RequirementResult } from './types.ts';
import { checkRegistrationNumber } from './registration-number.ts';

/** 空白のみ・空文字を「記載なし」として扱う。 */
function hasText(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * 6要件を判定する。
 * @param inv 抽出結果
 * @param simplified 適格簡易請求書として判定するか（レシート等）
 */
export function checkRequirements(
  inv: ExtractedInvoice,
  simplified = false,
): RequirementResult[] {
  const results: RequirementResult[] = [];

  // --- 要件1: 発行者の氏名又は名称 及び 登録番号 ---
  const reg = checkRegistrationNumber(inv.registrationNumber);
  if (!hasText(inv.issuerName) && !reg.present) {
    results.push({
      id: 1,
      label: '発行者の名称及び登録番号',
      status: 'missing',
      detail: '発行者名も登録番号も読み取れませんでした。',
    });
  } else if (!hasText(inv.issuerName)) {
    results.push({
      id: 1,
      label: '発行者の名称及び登録番号',
      status: 'missing',
      detail: '登録番号はありますが、発行事業者の氏名又は名称が読み取れません。',
    });
  } else if (!reg.present) {
    results.push({
      id: 1,
      label: '発行者の名称及び登録番号',
      status: 'missing',
      detail: `発行者「${inv.issuerName}」の登録番号の記載がありません。`,
    });
  } else if (!reg.formatValid) {
    results.push({
      id: 1,
      label: '発行者の名称及び登録番号',
      status: 'invalid',
      detail: reg.detail,
    });
  } else {
    results.push({
      id: 1,
      label: '発行者の名称及び登録番号',
      status: 'ok',
      detail: `${inv.issuerName}（${reg.normalized}）`,
    });
  }

  // --- 要件2: 取引年月日 ---
  results.push(
    hasText(inv.transactionDate) && /^\d{4}-\d{2}-\d{2}$/.test(inv.transactionDate)
      ? { id: 2, label: '取引年月日', status: 'ok', detail: inv.transactionDate }
      : {
          id: 2,
          label: '取引年月日',
          status: 'missing',
          detail: '課税資産の譲渡等を行った年月日が読み取れません。',
        },
  );

  // --- 要件3: 取引内容（軽減税率対象ならその旨） ---
  const has8 = inv.taxLines.some((l) => l.rate === 0.08);
  const marked8 = inv.taxLines.some((l) => l.rate === 0.08 && l.reducedRateMarked === true);
  if (!hasText(inv.description)) {
    results.push({
      id: 3,
      label: '取引内容',
      status: 'missing',
      detail: '資産又は役務の内容が読み取れません。',
    });
  } else if (has8 && !marked8) {
    results.push({
      id: 3,
      label: '取引内容（軽減税率対象である旨）',
      status: 'missing',
      detail:
        '8%の税率区分がありますが、軽減税率の対象品目である旨（※印等）の記載が確認できません。',
    });
  } else {
    results.push({ id: 3, label: '取引内容', status: 'ok', detail: inv.description });
  }

  // --- 要件4: 税率ごとに区分した合計額 及び 適用税率 ---
  const lines = inv.taxLines;
  if (lines.length === 0) {
    results.push({
      id: 4,
      label: '税率ごとの合計額及び適用税率',
      status: 'missing',
      detail: '税率ごとに区分した対価の合計額が読み取れません。',
    });
  } else if (lines.some((l) => l.taxExcluded == null)) {
    const bad = lines.filter((l) => l.taxExcluded == null).map((l) => `${l.rate * 100}%`);
    results.push({
      id: 4,
      label: '税率ごとの合計額及び適用税率',
      status: 'missing',
      detail: `${bad.join('・')}区分の対価の合計額が読み取れません。`,
    });
  } else {
    results.push({
      id: 4,
      label: '税率ごとの合計額及び適用税率',
      status: 'ok',
      detail: lines
        .map((l) => `${l.rate * 100}%: ${l.taxExcluded!.toLocaleString('ja-JP')}円`)
        .join(' / '),
    });
  }

  // --- 要件5: 税率ごとに区分した消費税額等 ---
  // 適格簡易請求書では 4 の適用税率 と 5 の消費税額 はいずれか一方でよい。
  const taxAmountsPresent = lines.length > 0 && lines.every((l) => l.taxAmount != null);
  if (taxAmountsPresent) {
    results.push({
      id: 5,
      label: '税率ごとに区分した消費税額等',
      status: 'ok',
      detail: lines
        .map((l) => `${l.rate * 100}%: ${l.taxAmount!.toLocaleString('ja-JP')}円`)
        .join(' / '),
    });
  } else if (simplified && lines.length > 0) {
    results.push({
      id: 5,
      label: '税率ごとに区分した消費税額等',
      status: 'ok',
      detail:
        '適格簡易請求書のため、適用税率の記載があれば消費税額等の記載は省略できます。',
    });
  } else {
    results.push({
      id: 5,
      label: '税率ごとに区分した消費税額等',
      status: 'missing',
      detail: '税率ごとに区分した消費税額等が読み取れません。',
    });
  }

  // --- 要件6: 書類の交付を受ける事業者の氏名又は名称 ---
  if (simplified) {
    results.push({
      id: 6,
      label: '交付を受ける事業者の名称',
      status: 'ok',
      detail: '適格簡易請求書のため記載は不要です。',
    });
  } else {
    results.push(
      hasText(inv.recipientName)
        ? { id: 6, label: '交付を受ける事業者の名称', status: 'ok', detail: inv.recipientName }
        : {
            id: 6,
            label: '交付を受ける事業者の名称',
            status: 'missing',
            detail:
              '宛名（書類の交付を受ける事業者の氏名又は名称）が読み取れません。適格簡易請求書に該当する業種でなければ要件を満たしません。',
          },
    );
  }

  return results;
}
