import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATUSES = ["UNLEARNED", "LEARNED", "WEAK"];

// 学習進捗の更新（F005）
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.serviceId !== "string") {
    return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  }

  const { serviceId, status, favorite, reviewFlag } = body as {
    serviceId: string;
    status?: string;
    favorite?: boolean;
    reviewFlag?: boolean;
  };

  if (status !== undefined && !STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    return NextResponse.json({ error: "service not found" }, { status: 404 });
  }

  const update: { status?: string; favorite?: boolean; reviewFlag?: boolean } = {};
  if (status !== undefined) update.status = status;
  if (typeof favorite === "boolean") update.favorite = favorite;
  if (typeof reviewFlag === "boolean") update.reviewFlag = reviewFlag;

  const progress = await prisma.serviceProgress.upsert({
    where: { serviceId },
    create: { serviceId, ...update },
    update,
  });

  return NextResponse.json(progress);
}
