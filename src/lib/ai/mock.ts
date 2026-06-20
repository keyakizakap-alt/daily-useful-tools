// 開発用モックLLM。OPENAI_API_KEY が無くてもアプリ全体が動くようにする。
// プロンプト内の JSON 入力を読み取り、決定的に計画/レビューを組み立てる。
import type { LLMMessage } from "./provider";

interface PlanInput {
  kind: "study_plan";
  certName: string;
  domains: string[];
  examDate: string | null;
  dailyMinutes: number;
  currentLevel: number;
  weakDomains: string[];
  targetScore: number | null;
}

interface ReviewInput {
  kind: "weekly_review";
  certName: string;
  daysToExam: number | null;
  weeklyMinutes: number;
  taskCompletionRate: number;
  latestCorrectRate: number | null;
  weakDomains: string[];
}

function extractJson(messages: LLMMessage[]): any {
  const user = [...messages].reverse().find((m) => m.role === "user");
  if (!user) return {};
  const match = user.content.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildPlan(input: PlanInput): string {
  const start = new Date();
  const examDate = input.examDate ? new Date(input.examDate) : addDays(start, 56) as unknown as Date;
  const end = input.examDate ? new Date(input.examDate) : new Date(addDays(start, 56));
  const totalDays = Math.max(
    7,
    Math.ceil((end.getTime() - start.getTime()) / 86400000),
  );
  const weeks = Math.max(1, Math.ceil(totalDays / 7));
  const domains = input.domains.length ? input.domains : ["全体復習"];

  // 苦手分野を前半に厚く配置
  const ordered = [
    ...input.weakDomains,
    ...domains.filter((d) => !input.weakDomains.includes(d)),
  ];

  const tasks: any[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(start, i);
    const domain = ordered[i % ordered.length];
    const isReviewDay = i % 7 === 6; // 週末は復習
    const isMockWeek = (Math.floor(i / 7) + 1) % 3 === 0 && i % 7 === 5; // 3週ごとに模試
    tasks.push({
      task_date: date,
      title: isMockWeek
        ? `${input.certName} 模試にチャレンジ`
        : isReviewDay
          ? `今週の復習：${domain}`
          : `${domain} のインプット & 整理`,
      description: isMockWeek
        ? "模試形式で実力チェック。終わったら模試結果を登録しましょう。"
        : `${domain} の要点をまとめ、自分の言葉で説明できるか確認。`,
      estimated_minutes: input.dailyMinutes,
      domain,
    });
  }

  const weekly = Array.from({ length: weeks }).map((_, w) => ({
    week: w + 1,
    focus: ordered[w % ordered.length],
    goal:
      w === 0
        ? "全体像をつかみ、苦手分野から着手"
        : w === weeks - 1
          ? "総復習と模試で仕上げ"
          : `${ordered[w % ordered.length]} を中心に理解を深める`,
  }));

  return JSON.stringify({
    title: `${input.certName} 合格プラン（${weeks}週間）`,
    start_date: addDays(start, 0),
    end_date: end.toISOString().slice(0, 10),
    priority_domains: input.weakDomains.length ? input.weakDomains : ordered.slice(0, 2),
    weekly_plan: weekly,
    daily_tasks: tasks,
    notes:
      "苦手分野を前半に厚く配置し、週末に復習、3週ごとに模試を入れています。無理のないペースで継続しましょう。",
  });
}

function buildReview(input: ReviewInput): string {
  const completion = Math.round(input.taskCompletionRate * 100);
  const correct = input.latestCorrectRate;
  // ざっくりした合格可能性スコア（決定的・ヒューリスティック）
  let score = 40;
  score += Math.min(25, completion / 4);
  if (correct != null) score += Math.min(30, correct * 0.3);
  if (input.weeklyMinutes > 180) score += 5;
  if (input.daysToExam != null && input.daysToExam < 7 && (correct ?? 0) < 60)
    score -= 10;
  score = Math.max(5, Math.min(95, Math.round(score)));

  const risks: string[] = [];
  if (completion < 50) risks.push("タスク消化率が低めです。1日の目標を小さく刻むと続けやすくなります。");
  if (correct != null && correct < 60) risks.push("模試の正答率が合格ラインに届いていません。弱点分野の復習を優先しましょう。");
  if (input.daysToExam != null && input.daysToExam < 14) risks.push("試験まで2週間を切りました。新規範囲より総復習に比重を移しましょう。");
  if (risks.length === 0) risks.push("大きなリスクはありません。今のペースを維持しましょう。");

  return JSON.stringify({
    progress_summary: `今週は約${input.weeklyMinutes}分学習し、タスク消化率は${completion}%でした。${
      completion >= 70 ? "とても良いペースです。" : "焦らず一歩ずつ進めましょう。"
    }`,
    pass_probability: score,
    weak_domains: input.weakDomains.length ? input.weakDomains : ["（模試結果が増えると精度が上がります）"],
    next_week_focus: input.weakDomains.slice(0, 2).length
      ? input.weakDomains.slice(0, 2)
      : ["前回の復習", "新規分野のインプット"],
    risks,
    next_actions: [
      "苦手分野を1つ選び、説明できるレベルまで復習する",
      "学習ログを毎日つけて習慣を可視化する",
      input.latestCorrectRate == null ? "一度模試を受けて現在地を測る" : "模試の間違えた分野を重点的に復習する",
    ],
    encouragement: "コツコツ続けているあなたなら大丈夫。今日の小さな一歩が合格につながります🐾",
  });
}

export async function mockComplete(messages: LLMMessage[]): Promise<string> {
  const input = extractJson(messages);
  if (input.kind === "study_plan") return buildPlan(input as PlanInput);
  if (input.kind === "weekly_review") return buildReview(input as ReviewInput);
  return JSON.stringify({ message: "mock provider: 未対応の入力です" });
}
