// ===========================================================================
// AIプロンプト設計
// 重要: 実試験問題の生成・転載は一切させない。
//   - 「公式問題」「過去問そのもの」を作らせない
//   - 学習計画・弱点分析・概念整理・復習支援のみ
//   - 個人を特定する情報はプロンプトに含めない（user_idやメール等は渡さない）
// ===========================================================================
import type { LLMMessage } from "./provider";

const GUARDRAIL = `あなたは資格学習の伴走コーチ「ポチパス」です。
役割は学習計画づくり・進捗評価・弱点分析・復習提案・励ましです。
厳守事項:
- 実際の試験問題や過去問の文面を作成・再現・転載してはいけません。
- 「これが公式問題です」と誤認させる表現を使ってはいけません。
- 出力は与えられた公式シラバスの分野名・ユーザーの学習ログ・模試結果のみに基づきます。
- 断定を避け、合格を保証しません。
- 日本語で、やさしく前向きな口調で書きます。
必ず指定されたJSONスキーマだけを出力してください（前後に文章を付けない）。`;

export interface StudyPlanPromptArgs {
  certName: string;
  domains: string[];
  examDate: string | null;
  dailyMinutes: number;
  currentLevel: number; // 0-100
  weakDomains: string[];
  targetScore: number | null;
}

export function buildStudyPlanMessages(args: StudyPlanPromptArgs): LLMMessage[] {
  const payload = { kind: "study_plan", ...args };
  return [
    { role: "system", content: GUARDRAIL },
    {
      role: "user",
      content: `次の学習者向けに、試験日から逆算した学習計画を作ってください。
入力(JSON):
${JSON.stringify(payload, null, 2)}

出力JSONスキーマ:
{
  "title": string,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "priority_domains": string[],
  "weekly_plan": [{ "week": number, "focus": string, "goal": string }],
  "daily_tasks": [{ "task_date": "YYYY-MM-DD", "title": string, "description": string, "estimated_minutes": number, "domain": string }],
  "notes": string
}
制約:
- daily_tasks は start_date から end_date まで、1日1件を基本に作る。
- 苦手分野(weak_domains)を前半に厚く配置する。
- 週末に復習日、数週間ごとに模試タスクを入れる。
- estimated_minutes は dailyMinutes を超えない。`,
    },
  ];
}

export interface WeeklyReviewPromptArgs {
  certName: string;
  daysToExam: number | null;
  weeklyMinutes: number;
  taskCompletionRate: number; // 0-1
  latestCorrectRate: number | null; // 0-100
  weakDomains: string[];
  recentLogSummary: string; // 統計サマリ（生テキストや個人情報は渡さない）
}

export function buildWeeklyReviewMessages(args: WeeklyReviewPromptArgs): LLMMessage[] {
  const payload = { kind: "weekly_review", ...args };
  return [
    { role: "system", content: GUARDRAIL },
    {
      role: "user",
      content: `次の学習者の今週の活動をレビューし、来週の方針を示してください。
入力(JSON):
${JSON.stringify(payload, null, 2)}

出力JSONスキーマ:
{
  "progress_summary": string,
  "pass_probability": number,        // 0-100 の合格可能性スコア（あくまで目安）
  "weak_domains": string[],
  "next_week_focus": string[],
  "risks": string[],
  "next_actions": string[],
  "encouragement": string
}
制約:
- pass_probability はログ・模試・残日数から推定する目安であり保証ではないと前提にする。
- next_actions は具体的で今日から実行できる粒度にする。`,
    },
  ];
}
