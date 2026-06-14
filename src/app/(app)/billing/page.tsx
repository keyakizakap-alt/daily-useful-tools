import { getCurrentUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";
import { Card, Badge, SectionTitle } from "@/components/ui";
import BillingActions from "./BillingActions";

export const dynamic = "force-dynamic";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function statusInfo(status: string): { label: string; tone: "green" | "red" | "amber" } {
  switch (status) {
    case "active":
    case "trialing":
      return { label: "有効", tone: "green" };
    case "past_due":
    case "unpaid":
    case "incomplete":
      return { label: "支払い未確定", tone: "red" };
    case "canceled":
      return { label: "解約済み", tone: "amber" };
    default:
      return { label: status, tone: "amber" };
  }
}

const FEATURE_ROWS: { key: keyof typeof PLANS.free.features; label: string }[] = [
  { key: "passProbability", label: "合格可能性スコア" },
  { key: "fullWeaknessAnalysis", label: "詳細な弱点分析" },
  { key: "reviewSuggestions", label: "復習提案" },
  { key: "notifications", label: "通知" },
  { key: "csvExport", label: "CSVエクスポート" },
  { key: "multiCertDashboard", label: "複数資格ダッシュボード" },
];

function limitText(v: number | null): string {
  return v === null ? "無制限" : `${v}`;
}

export default async function BillingPage() {
  const user = (await getCurrentUser())!;
  const ent = await getEntitlements(user.id);
  const { label, tone } = statusInfo(ent.status);

  const free = PLANS.free;
  const pro = PLANS.pro_monthly;

  return (
    <div className="space-y-5">
      <SectionTitle title="課金管理" desc="現在のプランと請求状況を確認できます。" />

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-ink-500">現在のプラン</p>
            <p className="mt-1 text-xl font-bold">{ent.plan.label}</p>
            <p className="text-sm text-ink-500">{ent.plan.priceLabel}</p>
          </div>
          <Badge tone={tone}>{label}</Badge>
        </div>

        {ent.plan.isPro && (
          <p className="mt-3 text-sm text-ink-700">
            次回の請求日: <span className="font-medium">{fmtDate(ent.currentPeriodEnd)}</span>
          </p>
        )}

        {ent.cancelAtPeriodEnd && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            解約予約済み: {fmtDate(ent.currentPeriodEnd)}まで利用可能です。
          </div>
        )}

        {ent.paymentIssue && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            ⚠️ お支払いに問題があります。Pro機能が一時停止しています。お支払い方法をご確認ください。
          </div>
        )}

        <div className="mt-4">
          <BillingActions plan={ent.rawPlan} isPro={ent.plan.isPro} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">FreeとProの比較</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="py-2 font-medium">項目</th>
                <th className="py-2 text-center font-medium">{free.label}</th>
                <th className="py-2 text-center font-medium">
                  <span className="text-brand-700">Pro</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              <tr>
                <td className="py-2">料金</td>
                <td className="py-2 text-center">{free.priceLabel}</td>
                <td className="py-2 text-center">¥680/月・¥5,980/年</td>
              </tr>
              <tr>
                <td className="py-2">登録できる資格数</td>
                <td className="py-2 text-center">{limitText(free.limits.maxCertGoals)}件</td>
                <td className="py-2 text-center">{limitText(pro.limits.maxCertGoals)}</td>
              </tr>
              <tr>
                <td className="py-2">学習計画の再生成 / 月</td>
                <td className="py-2 text-center">
                  {free.limits.planRegenerations === 0 ? "初回のみ" : limitText(free.limits.planRegenerations)}
                </td>
                <td className="py-2 text-center">{limitText(pro.limits.planRegenerations)}</td>
              </tr>
              <tr>
                <td className="py-2">AIレビュー / 月</td>
                <td className="py-2 text-center">{limitText(free.limits.aiReviews)}回</td>
                <td className="py-2 text-center">{limitText(pro.limits.aiReviews)}</td>
              </tr>
              <tr>
                <td className="py-2">模試結果の登録 / 月</td>
                <td className="py-2 text-center">{limitText(free.limits.mockExams)}回</td>
                <td className="py-2 text-center">{limitText(pro.limits.mockExams)}</td>
              </tr>
              {FEATURE_ROWS.map((r) => (
                <tr key={r.key}>
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-center">{free.features[r.key] ? "◯" : "—"}</td>
                  <td className="py-2 text-center">{pro.features[r.key] ? "◯" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
