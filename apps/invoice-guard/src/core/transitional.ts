/**
 * 免税事業者等からの課税仕入れに係る経過措置。
 *
 * インボイス制度では、適格請求書発行事業者以外（免税事業者等）からの仕入れは
 * 本来まったく仕入税額控除ができない。ただし激変緩和のため、一定割合を
 * 控除できる経過措置が置かれている。
 *
 * この割合は **令和8年度税制改正で見直され、3段階から5段階に細分化された**。
 * 当初は 80% → 50% → 0% だったものが、以下のスケジュールになっている。
 *
 *   〜2026-09-30            : 80%
 *   2026-10-01 〜 2028-09-30 : 70%
 *   2028-10-01 〜 2030-09-30 : 50%
 *   2030-10-01 〜 2031-09-30 : 30%
 *   2031-10-01 〜            : 0%（経過措置終了）
 *
 * 判定は「課税仕入れを行った日（取引年月日）」で行う。取引日が
 * 2026-09-30 以前なら80%、2026-10-01 以後なら70%。
 *
 * 注意（本ツールが判定しないこと）:
 *   70%・50%・30% の各段階には、1人の免税事業者等からの課税仕入れの合計額
 *   （税込）がその年又は事業年度で1億円を超える場合、超えた部分には経過措置を
 *   適用できないという上限がある。これは請求書1枚では判定できず、年間の
 *   取引先別累計が必要になるため、本ツールは注意喚起のみ行う。
 */

/** 経過措置の1段階。start 以上 end 未満（end が null なら無期限）。 */
export interface TransitionalStage {
  /** 適用開始日 YYYY-MM-DD（この日を含む） */
  start: string;
  /** 適用終了日の翌日 YYYY-MM-DD（この日を含まない）。null なら以後ずっと */
  endExclusive: string | null;
  /** 控除割合 0..1 */
  rate: number;
  label: string;
}

/** 施行日の古い順。 */
export const TRANSITIONAL_STAGES: readonly TransitionalStage[] = [
  { start: '2023-10-01', endExclusive: '2026-10-01', rate: 0.8, label: '80%控除' },
  { start: '2026-10-01', endExclusive: '2028-10-01', rate: 0.7, label: '70%控除' },
  { start: '2028-10-01', endExclusive: '2030-10-01', rate: 0.5, label: '50%控除' },
  { start: '2030-10-01', endExclusive: '2031-10-01', rate: 0.3, label: '30%控除' },
  { start: '2031-10-01', endExclusive: null, rate: 0, label: '経過措置終了（控除不可）' },
] as const;

/** 上限規制（1億円）が適用される段階の開始日。 */
export const CAP_APPLIES_FROM = '2026-10-01';
/** 上限額（税込・年間・1事業者あたり） */
export const ANNUAL_CAP_YEN = 100_000_000;

/**
 * YYYY-MM-DD を比較可能な数値に変換する。
 * Date を経由するとタイムゾーンで日付がずれるため、文字列のまま扱う。
 */
function toComparable(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new TypeError(`日付は YYYY-MM-DD 形式である必要があります: ${isoDate}`);
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/** 取引日に適用される経過措置の段階を返す。制度開始前は null。 */
export function stageForDate(isoDate: string): TransitionalStage | null {
  const d = toComparable(isoDate);
  for (const stage of TRANSITIONAL_STAGES) {
    const from = toComparable(stage.start);
    const to = stage.endExclusive == null ? Infinity : toComparable(stage.endExclusive);
    if (d >= from && d < to) return stage;
  }
  return null; // 2023-10-01 より前 = インボイス制度開始前
}

/** 免税事業者等からの仕入れについて、取引日に適用される控除割合。 */
export function transitionalRate(isoDate: string): number {
  const stage = stageForDate(isoDate);
  // 制度開始前は区分記載請求書等保存方式で全額控除できた。
  return stage == null ? 1 : stage.rate;
}

/** その取引日に1億円上限の規制が及ぶ段階かどうか。 */
export function isCapApplicable(isoDate: string): boolean {
  return toComparable(isoDate) >= toComparable(CAP_APPLIES_FROM);
}

/**
 * 2026-10-01 の引き下げ（80% → 70%）をまたぐかどうかの案内に使う。
 * @param isoDate 取引年月日
 * @returns 引き下げまでの日数。すでに引き下げ後なら負の値
 */
export function daysUntilOctober2026(isoDate: string): number {
  const boundary = Date.UTC(2026, 9, 1); // 月は0始まりなので 9 = 10月
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new TypeError(`日付は YYYY-MM-DD 形式である必要があります: ${isoDate}`);
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((boundary - d) / 86_400_000);
}
