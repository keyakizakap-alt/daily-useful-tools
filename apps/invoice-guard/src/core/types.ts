/**
 * InvoiceGuard 共通型定義。
 *
 * 設計方針:
 *   AI が担うのは「請求書の紙面から値を読み取ること」だけ。
 *   読み取った値が適格請求書の要件を満たすかの判定は、この core/ 以下の
 *   決定論的なロジックが行う。税額と法令判断に AI の推測を混ぜないため。
 */

/** 消費税の税率区分。 */
export type TaxRate = 0.1 | 0.08;

/** 税率ごとの内訳。適格請求書は「税率ごとに区分した」記載が必須。 */
export interface TaxLine {
  /** 適用税率（0.1 = 10%, 0.08 = 軽減8%） */
  rate: TaxRate;
  /** その税率区分の税抜対価の合計額（円）。読み取れなければ null */
  taxExcluded: number | null;
  /** その税率区分の消費税額等（円）。読み取れなければ null */
  taxAmount: number | null;
  /** 軽減税率対象品目である旨の記載があるか（8%区分でのみ意味を持つ） */
  reducedRateMarked?: boolean;
}

/**
 * 請求書から抽出した生データ。すべて「紙面にそう書いてあったか」であり、
 * 正しさの判断は含まない。読み取れなかった項目は null。
 */
export interface ExtractedInvoice {
  /** 適格請求書発行事業者の氏名又は名称（要件1） */
  issuerName: string | null;
  /** 登録番号（要件1）。例 "T1234567890123" */
  registrationNumber: string | null;
  /** 取引年月日（要件2）。ISO 8601 の YYYY-MM-DD */
  transactionDate: string | null;
  /** 取引内容（要件3）。品目の説明 */
  description: string | null;
  /** 税率ごとの内訳（要件4・5） */
  taxLines: TaxLine[];
  /** 書類の交付を受ける事業者の氏名又は名称（要件6） */
  recipientName: string | null;
  /** 請求書の合計額（税込・円）。参考値 */
  totalIncludingTax: number | null;
  /** 抽出元で読み取れなかった/自信のない箇所のメモ */
  extractionNotes: string[];
}

/** 要件の充足状況。 */
export type RequirementStatus = 'ok' | 'missing' | 'invalid';

export interface RequirementResult {
  /** 国税庁の記載事項の番号（1〜6） */
  id: number;
  /** 要件名 */
  label: string;
  status: RequirementStatus;
  /** 判定の根拠。ユーザーにそのまま見せる */
  detail: string;
}

/** 請求書の区分。控除できる割合がこれで決まる。 */
export type InvoiceClass =
  /** 適格請求書。仕入税額控除100% */
  | 'qualified'
  /** 登録番号はあるが記載不備。本来100%控除できるのに危険な状態 */
  | 'qualified_defective'
  /** 登録番号なし（免税事業者等）。経過措置の割合のみ控除可 */
  | 'non_registered';

/** 監査結果。 */
export interface AuditResult {
  invoiceClass: InvoiceClass;
  requirements: RequirementResult[];
  /** 登録番号の検証結果 */
  registration: RegistrationCheck;
  /** 税額計算の検証結果 */
  taxChecks: TaxCheck[];
  /** 控除額への影響 */
  impact: DeductionImpact;
  /** 対応すべきことを重要度順に並べたもの */
  actions: string[];
}

export interface RegistrationCheck {
  present: boolean;
  /** 正規化後の登録番号 */
  normalized: string | null;
  /** 形式（T + 13桁）が正しいか */
  formatValid: boolean;
  /** 法人番号のチェックディジットが一致するか。個人事業者番号では判定不能 = null */
  checkDigitValid: boolean | null;
  detail: string;
}

export interface TaxCheck {
  rate: TaxRate;
  /** 記載されていた消費税額 */
  stated: number | null;
  /** 税抜対価から再計算した消費税額（端数処理は切捨て・四捨五入・切上げの許容幅で判定） */
  expectedRange: [number, number] | null;
  ok: boolean;
  detail: string;
}

export interface DeductionImpact {
  /** 請求書上の消費税額の合計 */
  totalTax: number;
  /** 取引日に適用される控除割合（1.0 / 0.8 / 0.7 ...） */
  appliedRate: number;
  /** 実際に控除できる額 */
  deductible: number;
  /** 控除できない額 = 損失 */
  lost: number;
  /** 2026-10-01 の引き下げによる差額（該当しない場合は 0） */
  octoberDelta: number;
  /** 判定の根拠テキスト */
  detail: string;
}
