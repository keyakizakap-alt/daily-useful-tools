/**
 * 適格請求書発行事業者の登録番号（T + 13桁）の検証。
 *
 * 形式:
 *   - 法人           : "T" + 法人番号(13桁)
 *   - 法人以外（個人事業者等）: "T" + 13桁（法人番号と重複しない固有の番号）
 *
 * 法人番号の13桁は「検査用数字(1桁) + 基礎番号(12桁)」で構成され、
 * 検査用数字は基礎番号から次式で決まる:
 *
 *   検査用数字 = 9 - ( Σ(n=1..12) Pn × Qn ) mod 9
 *
 *   Pn: 基礎番号の最下位から n 桁目の数字
 *   Qn: n が奇数のとき 1、n が偶数のとき 2
 *
 * 検算例（国税庁の法人番号 7000012050002）:
 *   基礎番号 = 000012050002
 *   Σ = 2×1 + 0×2 + 0×1 + 0×2 + 5×1 + 0×2 + 2×1 + 1×2 + 0 + 0 + 0 + 0 = 11
 *   9 - (11 mod 9) = 9 - 2 = 7  → 先頭の 7 と一致
 *
 * 注意: この式が使えるのは登録番号の13桁が法人番号である場合のみ。
 * 個人事業者等に払い出された番号は法人番号ではないためチェックディジットで
 * 真偽を判定できない。その場合は checkDigitValid を null にして
 * 「形式は正しいが、実在確認は国税庁の公表サイトで行うこと」と案内する。
 */

import type { RegistrationCheck } from './types.ts';

/** 全角英数字を半角に変換し、区切り文字・空白を除去する。 */
export function normalizeRegistrationNumber(raw: string | null): string | null {
  if (raw == null) return null;
  const halfWidth = raw.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
  const compact = halfWidth.replace(/[\s\-‐－ー_.,]/g, '').toUpperCase();
  return compact.length === 0 ? null : compact;
}

/**
 * 13桁の法人番号のチェックディジットを計算する。
 * @param base12 基礎番号12桁（数字のみ）
 * @returns 検査用数字 0..9
 */
export function corporateCheckDigit(base12: string): number {
  if (!/^\d{12}$/.test(base12)) {
    throw new TypeError(`基礎番号は12桁の数字である必要があります: ${base12}`);
  }
  let sum = 0;
  // n は最下位を 1 とする桁位置。base12 の末尾から数える。
  for (let n = 1; n <= 12; n++) {
    const digit = Number(base12[base12.length - n]);
    const weight = n % 2 === 1 ? 1 : 2;
    sum += digit * weight;
  }
  return 9 - (sum % 9);
}

/** 13桁が法人番号として整合しているか。 */
export function isValidCorporateNumber(thirteen: string): boolean {
  if (!/^\d{13}$/.test(thirteen)) return false;
  return Number(thirteen[0]) === corporateCheckDigit(thirteen.slice(1));
}

/**
 * 登録番号を検証する。
 * 実在確認（その番号が本当に登録されているか）はここでは行わない。
 * それは国税庁の公表サイトへの照会が必要で、本ツールの責務外。
 */
export function checkRegistrationNumber(raw: string | null): RegistrationCheck {
  const normalized = normalizeRegistrationNumber(raw);

  if (normalized == null) {
    return {
      present: false,
      normalized: null,
      formatValid: false,
      checkDigitValid: null,
      detail:
        '登録番号の記載が見つかりません。免税事業者等からの仕入れとして扱われ、経過措置の割合しか控除できません。',
    };
  }

  if (!/^T\d{13}$/.test(normalized)) {
    return {
      present: true,
      normalized,
      formatValid: false,
      checkDigitValid: null,
      detail: `登録番号「${normalized}」は「T + 13桁の数字」の形式になっていません。読み取り誤りか、番号自体の誤記が疑われます。`,
    };
  }

  const thirteen = normalized.slice(1);
  const digitOk = isValidCorporateNumber(thirteen);

  if (digitOk) {
    return {
      present: true,
      normalized,
      formatValid: true,
      checkDigitValid: true,
      detail: `登録番号「${normalized}」は法人番号のチェックディジットと整合しています。実在確認は国税庁の公表サイトで行ってください。`,
    };
  }

  // 法人番号として不整合。個人事業者等の番号は法人番号ではないため、
  // ここで「誤り」と断定してはいけない。
  return {
    present: true,
    normalized,
    formatValid: true,
    checkDigitValid: false,
    detail:
      `登録番号「${normalized}」は形式は正しいものの、法人番号のチェックディジットと一致しません。` +
      '個人事業者等に払い出された番号であればこれは正常です。法人からの請求書であれば誤記の可能性が高いため、国税庁の公表サイトで確認してください。',
  };
}
