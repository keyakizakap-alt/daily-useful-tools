export type ServiceSeed = {
  id: string;
  name: string;
  abbreviation: string;
  category: string;
  shortDescription: string;
  description: string;
  keywords: string[];
  useCases: string[];
  scenarios: string[];
  examPoints: string[];
  cautions: string[];
  mnemonic: string;
  relatedServices: string[];
  similarServices: string[];
};

export type CertificationSeed = {
  id: string;
  code: string;
  name: string;
  level: string;
  description: string;
  examScope: string[];
  studyOrder: number;
  // 推奨学習順に並べる（order は配列順から自動採番）
  services: { serviceId: string; importance: 1 | 2 | 3; frequency: 1 | 2 | 3 }[];
};

export type QuizSeed = {
  id: string;
  type: "BASIC" | "USECASE" | "COMPARISON" | "CERT";
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  serviceId?: string;
  certificationId?: string;
};
