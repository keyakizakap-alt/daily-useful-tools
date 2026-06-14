// ===========================================================================
// 資格マスタ + 公式シラバスの「分野(domain)」メタデータ
//
// ⚠️ ここには実際の試験問題は一切含めない。
// 公式シラバスで公開されている「出題分野/ドメイン名」のみを保持し、
// AIの学習計画・弱点分析の足場として使う。
// ===========================================================================

export type Vendor = "AWS" | "Azure" | "GoogleCloud" | "IPA" | "Other";

export interface CertSeed {
  vendor: Vendor;
  code: string;
  name: string;
  level?: string;
  category: Vendor;
  description?: string;
  officialUrl?: string;
  /** 公式シラバスの出題分野（弱点分析の軸）。問題そのものではない。 */
  domains: string[];
}

export const CERTIFICATIONS: CertSeed[] = [
  // ----------------------------- AWS -----------------------------
  {
    vendor: "AWS", code: "AWS-CLF", name: "AWS Certified Cloud Practitioner", level: "foundational", category: "AWS",
    description: "AWSの基礎的な知識を問う入門資格。",
    officialUrl: "https://aws.amazon.com/certification/certified-cloud-practitioner/",
    domains: ["クラウドの概念", "セキュリティとコンプライアンス", "クラウドテクノロジーとサービス", "請求・料金・サポート"],
  },
  {
    vendor: "AWS", code: "AWS-AIF", name: "AWS Certified AI Practitioner", level: "foundational", category: "AWS",
    description: "AI/ML・生成AIの基礎とAWSサービスを問う入門資格。",
    officialUrl: "https://aws.amazon.com/certification/certified-ai-practitioner/",
    domains: ["AI/MLの基礎", "生成AIの基礎", "基盤モデルの応用", "責任あるAI", "セキュリティ・コンプライアンス・ガバナンス"],
  },
  {
    vendor: "AWS", code: "AWS-SAA", name: "AWS Certified Solutions Architect - Associate", level: "associate", category: "AWS",
    description: "可用性・コスト最適なアーキテクチャ設計力を問う。",
    officialUrl: "https://aws.amazon.com/certification/certified-solutions-architect-associate/",
    domains: ["セキュアなアーキテクチャ", "回復性の高いアーキテクチャ", "高性能アーキテクチャ", "コスト最適化アーキテクチャ"],
  },
  {
    vendor: "AWS", code: "AWS-DVA", name: "AWS Certified Developer - Associate", level: "associate", category: "AWS",
    description: "AWS上でのアプリ開発・デプロイ・デバッグ力を問う。",
    officialUrl: "https://aws.amazon.com/certification/certified-developer-associate/",
    domains: ["開発", "セキュリティ", "デプロイ", "トラブルシューティングと最適化"],
  },
  {
    vendor: "AWS", code: "AWS-COA", name: "AWS Certified CloudOps Engineer - Associate", level: "associate", category: "AWS",
    description: "AWS環境の運用・監視・自動化を問う。",
    officialUrl: "https://aws.amazon.com/certification/certified-cloudops-engineer-associate/",
    domains: ["監視・ロギング・分析", "信頼性とビジネス継続性", "デプロイ・プロビジョニング・自動化", "セキュリティとコンプライアンス", "ネットワークとコンテンツ配信"],
  },
  {
    vendor: "AWS", code: "AWS-SAP", name: "AWS Certified Solutions Architect - Professional", level: "professional", category: "AWS",
    description: "複雑な組織要件に対する上級アーキテクチャ設計力を問う。",
    officialUrl: "https://aws.amazon.com/certification/certified-solutions-architect-professional/",
    domains: ["複雑な組織への対応", "新ソリューションの設計", "既存ソリューションの継続的改善", "移行とモダナイゼーション"],
  },
  {
    vendor: "AWS", code: "AWS-SCS", name: "AWS Certified Security - Specialty", level: "specialty", category: "AWS",
    description: "AWSのセキュリティ設計・運用の専門知識を問う。",
    officialUrl: "https://aws.amazon.com/certification/certified-security-specialty/",
    domains: ["脅威検知とインシデント対応", "セキュリティロギングと監視", "インフラセキュリティ", "アイデンティティとアクセス管理", "データ保護", "ガバナンスとセキュリティ管理"],
  },

  // ----------------------------- Azure -----------------------------
  {
    vendor: "Azure", code: "AZ-900", name: "Microsoft Azure Fundamentals", level: "foundational", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/azure-fundamentals/",
    domains: ["クラウドの概念", "Azureのアーキテクチャとサービス", "Azureの管理とガバナンス"],
  },
  {
    vendor: "Azure", code: "AI-900", name: "Microsoft Azure AI Fundamentals", level: "foundational", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/azure-ai-fundamentals/",
    domains: ["AIワークロードと考慮事項", "機械学習の基礎", "コンピュータービジョン", "自然言語処理", "生成AI"],
  },
  {
    vendor: "Azure", code: "DP-900", name: "Microsoft Azure Data Fundamentals", level: "foundational", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/azure-data-fundamentals/",
    domains: ["コアデータ概念", "リレーショナルデータ", "非リレーショナルデータ", "分析ワークロード"],
  },
  {
    vendor: "Azure", code: "AZ-104", name: "Microsoft Azure Administrator", level: "associate", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/azure-administrator/",
    domains: ["IDとガバナンスの管理", "ストレージの実装と管理", "コンピューティングリソースのデプロイ", "仮想ネットワークの構成", "リソースの監視と保守"],
  },
  {
    vendor: "Azure", code: "AZ-204", name: "Developing Solutions for Microsoft Azure", level: "associate", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/azure-developer/",
    domains: ["コンピューティングソリューションの開発", "Azureストレージの開発", "Azureのセキュリティ実装", "監視・トラブルシューティング・最適化", "Azureサービスとサードパーティの接続"],
  },
  {
    vendor: "Azure", code: "AZ-305", name: "Designing Microsoft Azure Infrastructure Solutions", level: "expert", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/azure-solutions-architect/",
    domains: ["IDとガバナンス・監視の設計", "データストレージの設計", "ビジネス継続性の設計", "インフラの設計"],
  },
  {
    vendor: "Azure", code: "AZ-500", name: "Microsoft Azure Security Technologies", level: "associate", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/azure-security-engineer/",
    domains: ["IDとアクセスの管理", "プラットフォーム保護", "セキュリティ運用", "データとアプリケーションの保護"],
  },
  {
    vendor: "Azure", code: "SC-900", name: "Security, Compliance, and Identity Fundamentals", level: "foundational", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/security-compliance-and-identity-fundamentals/",
    domains: ["セキュリティ・コンプライアンス・IDの概念", "Microsoft Entraの機能", "Microsoftセキュリティソリューション", "Microsoftコンプライアンスソリューション"],
  },
  {
    vendor: "Azure", code: "SC-200", name: "Microsoft Security Operations Analyst", level: "associate", category: "Azure",
    officialUrl: "https://learn.microsoft.com/credentials/certifications/security-operations-analyst/",
    domains: ["Microsoft Defenderによる脅威軽減", "Microsoft Sentinelによる脅威軽減", "脅威の検出と対応"],
  },

  // -------------------------- Google Cloud --------------------------
  {
    vendor: "GoogleCloud", code: "GCP-CDL", name: "Cloud Digital Leader", level: "foundational", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/cloud-digital-leader",
    domains: ["デジタルトランスフォーメーション", "データとAIによるイノベーション", "インフラとアプリのモダナイゼーション", "Google Cloudのセキュリティと運用"],
  },
  {
    vendor: "GoogleCloud", code: "GCP-ACE", name: "Associate Cloud Engineer", level: "associate", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/cloud-engineer",
    domains: ["クラウド環境のセットアップ", "クラウドソリューションの計画と構成", "デプロイと実装", "運用の保守", "アクセスとセキュリティの構成"],
  },
  {
    vendor: "GoogleCloud", code: "GCP-PCA", name: "Professional Cloud Architect", level: "professional", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/cloud-architect",
    domains: ["クラウドソリューションアーキテクチャの設計", "実装管理", "セキュリティとコンプライアンス", "技術プロセスの分析と最適化", "実装の管理", "信頼性の確保"],
  },
  {
    vendor: "GoogleCloud", code: "GCP-PDE", name: "Professional Data Engineer", level: "professional", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/data-engineer",
    domains: ["データ処理システムの設計", "データの取り込みと処理", "データの保存", "分析の準備と利用", "ワークロードの維持と自動化"],
  },
  {
    vendor: "GoogleCloud", code: "GCP-PCD", name: "Professional Cloud Developer", level: "professional", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/cloud-developer",
    domains: ["高可用なアプリの設計", "アプリのビルドとテスト", "アプリのデプロイ", "サービスの統合", "パフォーマンス監視とトラブルシューティング"],
  },
  {
    vendor: "GoogleCloud", code: "GCP-PCSE", name: "Professional Cloud Security Engineer", level: "professional", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/cloud-security-engineer",
    domains: ["アクセスの構成", "ネットワークセキュリティの構成", "データ保護の確保", "オペレーションの管理", "コンプライアンスの確保"],
  },
  {
    vendor: "GoogleCloud", code: "GCP-PCNE", name: "Professional Cloud Network Engineer", level: "professional", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/cloud-network-engineer",
    domains: ["ネットワークの設計と計画", "仮想プライベートクラウドの実装", "ネットワークサービスの構成", "ハイブリッド接続の実装", "ネットワーク運用の管理"],
  },
  {
    vendor: "GoogleCloud", code: "GCP-PMLE", name: "Professional Machine Learning Engineer", level: "professional", category: "GoogleCloud",
    officialUrl: "https://cloud.google.com/learn/certification/machine-learning-engineer",
    domains: ["低コードAIソリューションの設計", "データとモデルのコラボレーション管理", "モデルのスケーリング", "MLパイプラインの自動化", "MLソリューションの監視"],
  },

  // ----------------------------- IPA -----------------------------
  {
    vendor: "IPA", code: "IPA-IP", name: "ITパスポート試験", level: "basic", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/ip.html",
    domains: ["ストラテジ系", "マネジメント系", "テクノロジ系"],
  },
  {
    vendor: "IPA", code: "IPA-SG", name: "情報セキュリティマネジメント試験", level: "basic", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/sg.html",
    domains: ["情報セキュリティ全般", "情報セキュリティ管理", "情報セキュリティ対策", "関連法規"],
  },
  {
    vendor: "IPA", code: "IPA-FE", name: "基本情報技術者試験", level: "basic", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/fe.html",
    domains: ["テクノロジ系(基礎理論)", "テクノロジ系(技術要素)", "マネジメント系", "ストラテジ系", "科目B(アルゴリズム・セキュリティ)"],
  },
  {
    vendor: "IPA", code: "IPA-AP", name: "応用情報技術者試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/ap.html",
    domains: ["テクノロジ系", "マネジメント系", "ストラテジ系", "午後記述(選択分野)"],
  },
  {
    vendor: "IPA", code: "IPA-SC", name: "情報処理安全確保支援士試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/sc.html",
    domains: ["情報セキュリティ技術", "ネットワーク", "セキュアプログラミング", "セキュリティ運用・管理", "午後記述・事例"],
  },
  {
    vendor: "IPA", code: "IPA-NW", name: "ネットワークスペシャリスト試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/nw.html",
    domains: ["ネットワーク技術", "ネットワーク設計・構築", "ネットワークセキュリティ", "午後論述・事例"],
  },
  {
    vendor: "IPA", code: "IPA-DB", name: "データベーススペシャリスト試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/db.html",
    domains: ["データベース技術", "概念・論理・物理設計", "SQL・性能", "午後論述・事例"],
  },
  {
    vendor: "IPA", code: "IPA-PM", name: "プロジェクトマネージャ試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/pm.html",
    domains: ["プロジェクト統合・スコープ", "スケジュール・コスト", "品質・リスク・調達", "午後論述"],
  },
  {
    vendor: "IPA", code: "IPA-SA", name: "システムアーキテクト試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/sa.html",
    domains: ["要件定義・方式設計", "アプリケーションアーキテクチャ", "組込み/IoT", "午後論述"],
  },
  {
    vendor: "IPA", code: "IPA-ST", name: "ITストラテジスト試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/st.html",
    domains: ["事業戦略・IT戦略", "業務改革・新事業", "情報化投資", "午後論述"],
  },
  {
    vendor: "IPA", code: "IPA-SM", name: "ITサービスマネージャ試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/sm.html",
    domains: ["サービスマネジメント", "可用性・キャパシティ", "インシデント・問題管理", "午後論述"],
  },
  {
    vendor: "IPA", code: "IPA-AU", name: "システム監査技術者試験", level: "advanced", category: "IPA",
    officialUrl: "https://www.ipa.go.jp/shiken/kubun/au.html",
    domains: ["ITガバナンス", "システム監査の計画・実施", "内部統制", "午後論述"],
  },
];
