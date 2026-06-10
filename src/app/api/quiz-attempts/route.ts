import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// クイズ解答結果の記録（正答率算出に利用）
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.quizId !== "string" || typeof body.correct !== "boolean") {
    return NextResponse.json({ error: "quizId and correct are required" }, { status: 400 });
  }

  const quiz = await prisma.quiz.findUnique({ where: { id: body.quizId } });
  if (!quiz) {
    return NextResponse.json({ error: "quiz not found" }, { status: 404 });
  }

  const attempt = await prisma.quizAttempt.create({
    data: { quizId: body.quizId, correct: body.correct },
  });

  return NextResponse.json(attempt);
}
