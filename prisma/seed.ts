import { PrismaClient } from "@prisma/client";
import { servicesA } from "./data/services-a";
import { servicesB } from "./data/services-b";
import { certifications } from "./data/certifications";
import { quizzes } from "./data/quizzes";

const prisma = new PrismaClient();

const services = [...servicesA, ...servicesB];

async function main() {
  // 再実行可能なように依存の深い順に削除してから投入する（進捗・解答履歴は保持）
  await prisma.certificationService.deleteMany();

  for (const s of services) {
    const data = {
      name: s.name,
      abbreviation: s.abbreviation,
      category: s.category,
      shortDescription: s.shortDescription,
      description: s.description,
      keywords: JSON.stringify(s.keywords),
      useCases: JSON.stringify(s.useCases),
      scenarios: JSON.stringify(s.scenarios),
      examPoints: JSON.stringify(s.examPoints),
      cautions: JSON.stringify(s.cautions),
      mnemonic: s.mnemonic,
      relatedServices: JSON.stringify(s.relatedServices),
      similarServices: JSON.stringify(s.similarServices),
    };
    await prisma.service.upsert({
      where: { id: s.id },
      create: { id: s.id, ...data },
      update: data,
    });
  }

  for (const c of certifications) {
    const data = {
      code: c.code,
      name: c.name,
      level: c.level,
      description: c.description,
      examScope: JSON.stringify(c.examScope),
      studyOrder: c.studyOrder,
    };
    await prisma.certification.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
    await prisma.certificationService.createMany({
      data: c.services.map((s, i) => ({
        certificationId: c.id,
        serviceId: s.serviceId,
        importance: s.importance,
        frequency: s.frequency,
        order: i + 1,
      })),
    });
  }

  for (const q of quizzes) {
    const data = {
      type: q.type,
      question: q.question,
      choices: JSON.stringify(q.choices),
      answerIndex: q.answerIndex,
      explanation: q.explanation,
      serviceId: q.serviceId ?? null,
      certificationId: q.certificationId ?? null,
    };
    await prisma.quiz.upsert({
      where: { id: q.id },
      create: { id: q.id, ...data },
      update: data,
    });
  }

  console.log(
    `Seeded: ${services.length} services, ${certifications.length} certifications, ${quizzes.length} quizzes`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
