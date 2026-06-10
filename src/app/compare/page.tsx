import ComparePicker from "@/components/ComparePicker";
import { comparisons } from "@/data/comparisons";

// サービス比較（F003）
export default function ComparePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">サービス比較</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          試験で問われやすい類似サービスの使い分けを整理します
        </p>
      </div>
      <ComparePicker comparisons={comparisons} />
    </div>
  );
}
