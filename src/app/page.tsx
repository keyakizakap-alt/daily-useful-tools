import Link from "next/link";
import { CERTIFICATIONS } from "@/lib/certifications-data";
import { PLANS } from "@/lib/plans";

const FEATURES = [
  { icon: "🗓️", title: "試験日から逆算した計画", desc: "残り日数と1日の学習時間から、今日やるべきタスクを自動で組み立てます。" },
  { icon: "📊", title: "弱点の可視化", desc: "模試結果と学習ログから、分野別の弱点をランキング表示。復習の優先度がひと目で分かります。" },
  { icon: "🤖", title: "AI週次レビュー", desc: "毎週の進捗を評価し、来週の重点分野と具体的な次アクションを提案します。" },
  { icon: "🎯", title: "合格可能性スコア", desc: "学習量・正答率・残日数から、いまの合格可能性を目安として表示します。" },
  { icon: "🔥", title: "学習の習慣化", desc: "毎日の学習ログで継続を可視化。やさしい声かけで、続けたくなる設計です。" },
  { icon: "📁", title: "記録はあなたのもの", desc: "学習ログ・模試結果はCSVでエクスポート可能（Pro）。" },
];

const FAQ = [
  { q: "試験問題は載っていますか？", a: "いいえ。ポチパスは問題集ではなく、進捗管理・弱点管理・学習習慣化のためのアプリです。あなたの学習ログ・模試結果・公式シラバスの分野情報をもとにAIが伴走します。" },
  { q: "どの資格に対応していますか？", a: "AWS・Azure・Google Cloud の主要認定資格と、IPAの情報処理技術者試験に対応しています。" },
  { q: "無料でも使えますか？", a: "はい。Freeプランでも1資格の学習計画・学習ログ・月数回の模試記録・月1回のAIレビューが使えます。" },
  { q: "解約したらどうなりますか？", a: "いつでも解約でき、請求期間の終了まではPro機能を利用できます。期間終了後は自動でFreeに戻ります。" },
];

export default function LandingPage() {
  const vendors = ["AWS", "Azure", "GoogleCloud", "IPA"] as const;
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-black/5 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">🐾 ポチパス</span>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-outline">ログイン</Link>
            <Link href="/login?mode=signup" className="btn-primary">無料で始める</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        <span className="badge bg-brand-50 text-brand-700">資格学習AIコーチ</span>
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          合格まで、ひとりにしない。
          <br className="hidden sm:block" />
          AIが毎日伴走する資格学習。
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-ink-500">
          試験日から逆算した学習計画、弱点の可視化、AIによる週次レビュー。
          問題集ではなく「合格までの進捗管理・学習習慣化」に特化したサブスク型コーチです。
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login?mode=signup" className="btn-primary px-6 py-3 text-base">無料で始める</Link>
          <Link href="#pricing" className="btn-outline px-6 py-3 text-base">料金を見る</Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 対象資格 */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-center text-2xl font-bold">対象資格</h2>
        <p className="mt-2 text-center text-sm text-ink-500">
          クラウド認定資格とIPA資格、計{CERTIFICATIONS.length}種に対応
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {vendors.map((v) => (
            <div key={v} className="card">
              <h3 className="font-semibold">{v === "GoogleCloud" ? "Google Cloud" : v}</h3>
              <ul className="mt-2 space-y-1 text-sm text-ink-500">
                {CERTIFICATIONS.filter((c) => c.category === v).slice(0, 8).map((c) => (
                  <li key={c.code}>・{c.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-center text-2xl font-bold">料金プラン</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <PlanCard
            name="Free" price="¥0" features={[
              "資格の登録：1つまで",
              "学習計画：1資格（再生成なし）",
              "学習ログ：無制限",
              "模試結果：月2回まで",
              "AIレビュー：月1回",
            ]}
          />
          <PlanCard
            highlight name="Pro 月額" price="¥680" unit="/月" features={[
              "資格の登録：無制限",
              "学習計画：再生成し放題",
              "AI週次レビュー：毎週",
              "弱点分析・合格可能性スコア",
              "復習提案・通知・CSV出力",
            ]}
          />
          <PlanCard
            name="Pro 年額" price="¥5,980" unit="/年" features={[
              "Pro月額と同じ全機能",
              "年額でおトク（約27%off）",
              "今後の限定テンプレート優先提供",
            ]}
          />
        </div>
        <p className="mt-4 text-center text-xs text-ink-300">
          価格はすべて税込想定。プラン変更・解約はいつでも可能です。
        </p>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="text-center text-2xl font-bold">よくある質問</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-ink-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <div className="card bg-brand-50 border-brand-100">
          <p className="text-lg font-semibold">今日から、合格への一歩を。</p>
          <Link href="/login?mode=signup" className="btn-primary mt-4 px-6 py-3">無料で始める</Link>
        </div>
      </section>

      <footer className="border-t border-black/5 py-8 text-center text-xs text-ink-300">
        © {new Date().getFullYear()} ポチパス
      </footer>
    </main>
  );
}

function PlanCard({
  name, price, unit, features, highlight,
}: {
  name: string; price: string; unit?: string; features: string[]; highlight?: boolean;
}) {
  return (
    <div className={`card flex flex-col ${highlight ? "ring-2 ring-brand-500" : ""}`}>
      {highlight && <span className="badge bg-brand-500 text-white self-start">おすすめ</span>}
      <h3 className="mt-1 text-lg font-bold">{name}</h3>
      <p className="mt-2">
        <span className="text-3xl font-bold">{price}</span>
        {unit && <span className="text-sm text-ink-500">{unit}</span>}
      </p>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2"><span className="text-brand-500">✓</span>{f}</li>
        ))}
      </ul>
      <Link href="/login?mode=signup" className={`mt-5 ${highlight ? "btn-primary" : "btn-outline"}`}>
        始める
      </Link>
    </div>
  );
}
