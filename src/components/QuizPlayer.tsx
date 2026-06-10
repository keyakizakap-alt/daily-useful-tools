"use client";

import Link from "next/link";
import { useState } from "react";

export type QuizItem = {
  id: string;
  type: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  serviceId: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  BASIC: "基本四択",
  USECASE: "用途から選択",
  COMPARISON: "使い分け",
  CERT: "資格別",
};

function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizPlayer({ quizzes }: { quizzes: QuizItem[] }) {
  const [order, setOrder] = useState(() => shuffle(quizzes));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [markedWeak, setMarkedWeak] = useState(false);

  const quiz = order[index];
  const answered = selected !== null;
  const isCorrect = answered && selected === quiz.answerIndex;

  function answer(choice: number) {
    if (answered) return;
    setSelected(choice);
    const correct = choice === quiz.answerIndex;
    if (correct) setCorrectCount((c) => c + 1);
    // 正答率算出のため結果を記録（失敗してもクイズは続行できる）
    fetch("/api/quiz-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: quiz.id, correct }),
    }).catch(() => {});
  }

  function markWeak() {
    if (!quiz.serviceId || markedWeak) return;
    setMarkedWeak(true);
    fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId: quiz.serviceId, status: "WEAK" }),
    }).catch(() => {});
  }

  function next() {
    if (index + 1 >= order.length) {
      setFinished(true);
    } else {
      setIndex(index + 1);
      setSelected(null);
      setMarkedWeak(false);
    }
  }

  function restart() {
    setOrder(shuffle(quizzes));
    setIndex(0);
    setSelected(null);
    setCorrectCount(0);
    setFinished(false);
    setMarkedWeak(false);
  }

  if (finished) {
    const pct = Math.round((correctCount / order.length) * 100);
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">結果</p>
        <p className="mt-2 text-4xl font-bold">
          {correctCount} / {order.length}
          <span className="ml-2 text-xl text-slate-400">({pct}%)</span>
        </p>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {pct === 100
            ? "全問正解！素晴らしい！🎉"
            : pct >= 70
              ? "合格ライン！間違えた問題を復習しましょう。"
              : "苦手分野をサービス詳細ページで復習しましょう。"}
        </p>
        <button
          onClick={restart}
          className="mt-5 rounded-lg bg-amber-500 px-5 py-2 font-semibold text-white hover:bg-amber-600"
        >
          もう一度挑戦する
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          問題 {index + 1} / {order.length}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
          {TYPE_LABEL[quiz.type] ?? quiz.type}
        </span>
      </div>

      <p className="mt-3 font-semibold leading-relaxed">{quiz.question}</p>

      <div className="mt-4 space-y-2">
        {quiz.choices.map((choice, i) => {
          let style =
            "border-slate-200 hover:border-amber-400 hover:bg-amber-50 dark:border-slate-700 dark:hover:border-amber-500 dark:hover:bg-amber-900/20";
          if (answered) {
            if (i === quiz.answerIndex) {
              style =
                "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/30";
            } else if (i === selected) {
              style = "border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-900/30";
            } else {
              style = "border-slate-200 opacity-60 dark:border-slate-700";
            }
          }
          return (
            <button
              key={i}
              onClick={() => answer(i)}
              disabled={answered}
              className={`block w-full rounded-lg border-2 px-4 py-3 text-left text-sm transition ${style}`}
            >
              <span className="mr-2 font-bold text-slate-400">{["A", "B", "C", "D"][i]}.</span>
              {choice}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-4 space-y-3">
          <div
            className={`rounded-lg p-4 text-sm ${
              isCorrect
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
            }`}
          >
            <p className="font-bold">{isCorrect ? "⭕ 正解！" : "❌ 不正解"}</p>
            <p className="mt-1 leading-relaxed">{quiz.explanation}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={next}
              className="rounded-lg bg-amber-500 px-5 py-2 font-semibold text-white hover:bg-amber-600"
            >
              {index + 1 >= order.length ? "結果を見る" : "次の問題へ →"}
            </button>
            {quiz.serviceId && (
              <>
                <Link
                  href={`/services/${quiz.serviceId}`}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  サービス詳細を見る
                </Link>
                {!isCorrect && (
                  <button
                    onClick={markWeak}
                    disabled={markedWeak}
                    className="rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20"
                  >
                    {markedWeak ? "苦手に登録済み" : "苦手に登録する"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
