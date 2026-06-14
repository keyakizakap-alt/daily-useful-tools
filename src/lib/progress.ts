// 学習進捗ステータスの表示定義
export type ProgressStatus = "UNLEARNED" | "LEARNED" | "WEAK";

export const STATUS_META: Record<ProgressStatus, { label: string; className: string }> = {
  UNLEARNED: {
    label: "未学習",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  LEARNED: {
    label: "学習済",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  WEAK: {
    label: "苦手",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
};

export type ProgressInfo = {
  status: ProgressStatus;
  favorite: boolean;
  reviewFlag: boolean;
};

export const DEFAULT_PROGRESS: ProgressInfo = {
  status: "UNLEARNED",
  favorite: false,
  reviewFlag: false,
};
