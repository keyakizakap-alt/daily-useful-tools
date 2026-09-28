/* ============================================================
   Google Cloud 認定資格マスタデータ
   ------------------------------------------------------------
   情報確認日: 2026-09-28
   - name / level / length / questions / fee / languages / validity /
     experience / domains(タイトル) は各資格の公式ページ
     (https://cloud.google.com/learn/certification/<slug>) で確認した値。
   - 配点比率 (weight) は公式PDF試験ガイドが本環境から取得できなかったため、
     weightSrc で出典の確からしさを示す:
       "official-html" … 公式HTML版ガイドで確認（旧版の可能性あり）
       "secondary"     … 二次情報（学習サイト・検索結果）。公式PDFで要確認
       null            … 確認できず。演習の出題配分は均等扱い
   - topics（学習メモ）は本アプリ作成者による要約。公式ガイドの転載ではない。
   ============================================================ */
window.GC = window.GC || {};

GC.meta = {
  checkedAt: "2026-09-28",
  hub: "https://cloud.google.com/learn/certification",
  notes: [
    { title: "試験配信は Pearson VUE に移行", body: "2026年3月2日から Kryterion (Webassessor) に代わり Pearson VUE で受験。オンライン監督またはテストセンターを選択できる。", src: "二次情報（複数サイトで一致）/ 公式ヘルプ「Upcoming Change to Exam Delivery Provider」", url: "https://support.google.com/cloud-certification/answer/16803278?hl=en" },
    { title: "Vertex AI → Gemini Enterprise Agent Platform", body: "2026年4月の Cloud Next で Vertex AI は Gemini Enterprise Agent Platform に名称変更。Model Garden / Pipelines / Model Registry / Feature Store などは Agent Platform 配下の機能として継続。Agent Engine は Agent Runtime に改称。試験は「試験ガイド記載の製品名」で出題されるため、新旧どちらの名称も押さえる。", src: "公式製品ページ（Agent Engine→Agent Runtime は公式ドキュメント題名＋二次情報）", url: "https://cloud.google.com/products/gemini-enterprise-agent-platform" },
    { title: "Google Skills での更新（Renewal）", body: "2026年7月から PCA / PDE / ACE / CDL は、更新試験に加えて Google Skills の指定コース・スキルバッジ修了による更新も可能。", src: "公式資格ページ", url: "https://cloud.google.com/learn/certification/cloud-architect" },
    { title: "Professional Google Workspace Administrator は廃止", body: "2026年7月22日に試験提供終了（二次情報）。取得済み資格は有効期限まで有効。後継的な位置づけとして Associate Google Workspace Administrator が提供中。全冠の対象からは除外。", src: "公式ヘルプ「Retired Exams」＋二次情報", url: "https://support.google.com/cloud-certification/answer/15608994?hl=en" },
    { title: "有効期間と更新ウィンドウ", body: "Professional は2年、Associate / Foundational は3年（Agentic Architect は公式ページ上 1年）。更新受験は Professional が失効60日前、Associate / Foundational が180日前から可能（二次情報。公式FAQで要確認）。", src: "公式資格ページ（有効期間）＋二次情報（更新ウィンドウ）", url: "https://support.google.com/cloud-certification/answer/9907853?hl=en" }
  ],
  renames: [
    { from: "Vertex AI", to: "Gemini Enterprise Agent Platform（Agent Platform）", when: "2026-04", sure: "公式" },
    { from: "Vertex AI Studio / Generative AI Studio", to: "Agent Studio", when: "2026", sure: "公式製品ページに Agent Studio の記載" },
    { from: "Vertex AI Agent Engine", to: "Agent Runtime", when: "2026", sure: "公式ドキュメント題名＋二次情報" },
    { from: "Chronicle", to: "Google Security Operations（Google SecOps）", when: "2024", sure: "公式" },
    { from: "Cloud Functions", to: "Cloud Run functions", when: "2024-08", sure: "公式（既知）" },
    { from: "Anthos", to: "GKE Enterprise", when: "2023", sure: "公式（既知）" },
    { from: "Container Registry", to: "Artifact Registry（Container Registry は提供終了）", when: "2025", sure: "公式（既知）" },
    { from: "Duet AI", to: "Gemini for Google Cloud / Gemini Code Assist", when: "2024-02", sure: "公式（既知）" },
    { from: "Agentspace", to: "Gemini Enterprise（アプリ）", when: "2025-10〜2026", sure: "二次情報" },
    { from: "Webassessor (Kryterion)", to: "Pearson VUE", when: "2026-03", sure: "公式ヘルプ＋二次情報" }
  ],
  retired: [
    { name: "Professional Google Workspace Administrator", when: "2026-07-22", note: "二次情報。取得済み資格は有効期限まで有効" }
  ]
};

GC.levels = {
  foundational: { label: "Foundational", ja: "基礎" },
  associate:    { label: "Associate",    ja: "アソシエイト" },
  professional: { label: "Professional", ja: "プロフェッショナル" }
};

/* phase: 全冠ロードマップ上の推奨フェーズ (1〜4)
   hours: 学習時間の目安（本アプリ独自の推定。実務経験で大きく変わる） */
GC.certs = [
  {
    id: "cdl", abbr: "CDL", name: "Cloud Digital Leader", level: "foundational", phase: 1, hours: 20,
    slug: "cloud-digital-leader", color: "#1a73e8",
    length: 90, questions: "50-60", fee: 99, languages: ["英語", "日本語", "スペイン語", "ポルトガル語", "フランス語"],
    validity: 3, experience: "技術者と協働した経験",
    guide: "https://services.google.com/fh/files/misc/cloud_digital_leader_exam_guide_english.pdf",
    update: "2026年8月12日から新バージョンの試験。Google Skills での更新に対応。",
    weightSrc: "official-html",
    weightNote: "公式HTML版ガイドの値（新バージョン前の旧版の可能性あり）",
    domains: [
      { t: "Google Cloud によるデジタルトランスフォーメーション", en: "Digital transformation with Google Cloud", w: 17,
        topics: ["クラウドの価値: 拡張性・俊敏性・TCO・CapEx→OpEx", "パブリック/プライベート/ハイブリッド/マルチクラウドの使い分け", "IaaS / PaaS / SaaS と責任共有モデル", "リージョン・ゾーン・エッジ・海底ケーブルなどグローバルインフラ"] },
      { t: "データによる変革", en: "Exploring data transformation with Google Cloud", w: 16,
        topics: ["DB / DWH / データレイクの違い", "Cloud Storage のストレージクラス (Standard / Nearline / Coldline / Archive)", "BigQuery（サーバーレスDWH）と Looker（セルフサービスBI）", "Pub/Sub + Dataflow によるストリーミング分析", "データガバナンスの重要性"] },
      { t: "AI によるイノベーション", en: "Innovating with Google Cloud artificial intelligence", w: 16,
        topics: ["AI / ML / 生成AI の違いと解ける課題", "事前学習済み API・AutoML・カスタムモデルの選び方（速度・工数・差別化・専門性）", "BigQuery ML（SQLでML）", "責任あるAI・説明可能性・データ品質"] },
      { t: "インフラとアプリのモダナイゼーション", en: "Modernizing infrastructure and applications with Google Cloud", w: 17,
        topics: ["移行パターン: Rehost / Replatform / Refactor / Reimagine / Retire / Retain", "VM・コンテナ・Kubernetes・サーバーレスの比較", "Compute Engine / GKE / Cloud Run / Cloud Run functions", "API 管理（Apigee）とハイブリッド・マルチクラウド（GKE Enterprise）"] },
      { t: "信頼とセキュリティ", en: "Trust and security with Google Cloud", w: 17,
        topics: ["多層防御・ゼロトラスト（BeyondCorp）", "IAM・最小権限・リソース階層（組織 / フォルダ / プロジェクト）", "暗号化（保存時・転送時）、データ主権・コンプライアンス", "Security Command Center・運用上のセキュリティ"] },
      { t: "運用のスケーリング", en: "Scaling with Google Cloud operations", w: 17,
        topics: ["財務ガバナンス: 予算・アラート・請求エクスポート・確約利用割引", "Google Cloud Observability（Monitoring / Logging）", "SRE・SLI/SLO/エラーバジェットの考え方", "サステナビリティ（カーボンフリーエネルギー）"] }
    ]
  },
  {
    id: "gail", abbr: "GAIL", name: "Generative AI Leader", level: "foundational", phase: 1, hours: 20,
    slug: "generative-ai-leader", color: "#9334e6",
    length: 90, questions: "50-60（単一選択）", fee: 99, languages: ["英語", "日本語", "スペイン語", "ポルトガル語"],
    validity: 3, experience: "職種・技術経験を問わない",
    guide: "https://services.google.com/fh/files/misc/generative_ai_leader_exam_guide_english.pdf",
    update: "製品名の変更（ブランディング）を反映して更新済み。",
    weightSrc: "secondary",
    weightNote: "第1・第2セクションは検索結果で公式PDF由来の値を確認。第3・第4は二次情報",
    domains: [
      { t: "生成AIの基礎", en: "Fundamentals of gen AI", w: 30,
        topics: ["AI / ML / ディープラーニング / 生成AI / 基盤モデル / LLM の関係", "教師あり・教師なし・強化学習", "構造化・非構造化データ、データ品質", "マルチモーダル、トークン、コンテキストウィンドウ"] },
      { t: "Google Cloud の生成AIサービス", en: "Google Cloud's gen AI offerings", w: 35,
        topics: ["Gemini Enterprise（旧 Agentspace）: 社内データ横断検索とエージェント", "Gemini Enterprise Agent Platform（旧 Vertex AI）: Model Garden・Agent Studio・ADK", "Gemini for Google Workspace / NotebookLM", "Google の AI スタック: インフラ（TPU）→モデル→プラットフォーム→エージェント→アプリ"] },
      { t: "生成AIの出力を改善する手法", en: "Techniques to improve gen AI model output", w: 20,
        topics: ["プロンプトエンジニアリング（ゼロショット / フューショット / ロール / CoT）", "グラウンディングと RAG によるハルシネーション抑制", "ファインチューニングとの使い分け", "サンプリングパラメータ（temperature / top-p）"] },
      { t: "生成AI導入を成功させるビジネス戦略", en: "Business strategies for a successful gen AI solution", w: 15,
        topics: ["ユースケース選定と ROI・KPI", "責任あるAI（公平性・プライバシー・透明性）", "セキュリティ（SAIF）とガバナンス", "チェンジマネジメントとヒューマン・イン・ザ・ループ"] }
    ]
  },
  {
    id: "ace", abbr: "ACE", name: "Associate Cloud Engineer", level: "associate", phase: 2, hours: 60,
    slug: "cloud-engineer", color: "#1e8e3e",
    length: 120, questions: "50-60", fee: 125, languages: ["英語", "日本語", "スペイン語", "ポルトガル語"],
    validity: 3, experience: "Google Cloud の実務経験6か月以上",
    guide: "https://services.google.com/fh/files/misc/associate_cloud_engineer_exam_guide_english.pdf",
    update: "2026年6月30日から英語版が新バージョン（4セクション構成）。Google Skills での更新に対応。",
    weightSrc: "secondary",
    weightNote: "新版の4セクション配点は二次情報（公式HTML版の旧5セクション版は 20/17.5/25/20/17.5%）",
    domains: [
      { t: "クラウドソリューション環境のセットアップ", en: "Set up a cloud solution environment", w: 20,
        topics: ["リソース階層と組織ポリシー", "Cloud Identity でのユーザー / グループ管理", "API の有効化・割り当て（Quota）の確認と引き上げ申請", "請求先アカウント・予算アラート・請求データの BigQuery エクスポート"] },
      { t: "クラウドソリューションの計画と実装", en: "Plan and implement a cloud solution", w: 30,
        topics: ["Compute Engine / GKE / Cloud Run / Cloud Run functions の選択", "Spot VM・カスタムマシンタイプ・MIG とインスタンステンプレート", "Cloud SQL / Spanner / Firestore / Bigtable / BigQuery / AlloyDB の選択", "VPC（カスタムモード・共有VPC）、ファイアウォール、Cloud VPN / VPC ピアリング", "Terraform / Config Connector / Helm による IaC"] },
      { t: "クラウドソリューションの運用", en: "Ensure the successful operation of a cloud solution", w: 30,
        topics: ["スナップショット・イメージ・スナップショットスケジュール", "GKE ノードプール、HPA / VPA、Artifact Registry 連携", "Cloud Run のリビジョンとトラフィック分割", "Cloud Storage ライフサイクル、サブネット拡張、静的IP予約、Cloud DNS / Cloud NAT", "Monitoring アラート、ログルーター・ログバケット・シンク、Ops エージェント、監査ログ"] },
      { t: "アクセスとセキュリティの構成", en: "Configure access and security", w: 20,
        topics: ["基本 / 事前定義 / カスタムロール", "サービスアカウントの作成・最小権限・リソースへの割り当て", "サービスアカウントの権限借用（impersonation）と短期認証情報", "IAM ポリシーの継承と確認"] }
    ]
  },
  {
    id: "adp", abbr: "ADP", name: "Associate Data Practitioner", level: "associate", phase: 2, hours: 40,
    slug: "data-practitioner", color: "#e37400",
    length: 120, questions: "50-60", fee: 125, languages: ["英語", "日本語"],
    validity: 3, experience: "Google Cloud 上でのデータ業務経験6か月以上",
    guide: "https://services.google.com/fh/files/misc/v1.0_associate_data_practitioner_exam_guide_english.pdf",
    update: "近日、製品名変更を反映した更新予定（公式ページ告知）。",
    weightSrc: null,
    weightNote: "第1セクション ~30% のみ検索結果で確認。他は未確認のため演習は均等配分",
    domains: [
      { t: "データの準備と取り込み", en: "Prepare and ingest data", w: 30,
        topics: ["ETL / ELT / ETLT の使い分け", "データクレンジング（Dataflow / Dataprep / BigQuery SQL）", "取り込み手段: Storage Transfer Service / Transfer Appliance / BigQuery Data Transfer Service / Datastream", "ファイル形式（CSV / JSON / Avro / Parquet）の特性"] },
      { t: "データの分析と提示", en: "Analyze and present data", w: null,
        topics: ["BigQuery での SQL 分析・パーティション / クラスタリング", "Looker / Looker Studio によるダッシュボード", "BigQuery ML によるモデル作成と予測", "Gemini in BigQuery による分析支援"] },
      { t: "データパイプラインのオーケストレーション", en: "Orchestrate data pipelines", w: null,
        topics: ["Cloud Composer（Airflow）と Workflows の使い分け", "Dataform による SQL 変換パイプライン", "スケジュールクエリ・イベント駆動（Eventarc / Pub/Sub）", "バッチとストリーミングの選択"] },
      { t: "データ管理", en: "Manage data", w: null,
        topics: ["IAM によるデータアクセス制御（データセット / テーブル / 列 / 行）", "Cloud Storage のストレージクラスとライフサイクル", "バックアップ・レプリケーション・ロケーション選択", "Dataplex Universal Catalog によるメタデータ・ガバナンス、CMEK"] }
    ]
  },
  {
    id: "agwa", abbr: "AGWA", name: "Associate Google Workspace Administrator", level: "associate", phase: 2, hours: 40,
    slug: "associate-google-workspace-administrator", color: "#188038",
    length: 120, questions: "50-60", fee: 125, languages: ["英語", "日本語"],
    validity: 3, experience: "Google Workspace 特権管理者として6か月の経験（Business Plus 中心、Enterprise 機能の知識）",
    guide: "https://services.google.com/fh/files/misc/associate_google_workspace_administrator_exam_guide_english.pdf",
    update: "Professional Google Workspace Administrator の廃止（2026年7月）後、Workspace 系の現行資格はこれのみ。",
    weightSrc: null,
    weightNote: "二次情報の値が一致しないため未掲載。演習は均等配分",
    domains: [
      { t: "ユーザーアカウントとオブジェクトの管理", en: "Manage user accounts and objects", w: null,
        topics: ["ユーザーのライフサイクル（作成・停止・削除・データ移行）", "組織部門（OU）設計と設定の継承", "グループ（アクセス制御 / メーリングリスト）と動的グループ", "ドメイン・エイリアス、Google Cloud Directory Sync（GCDS）"] },
      { t: "主要 Workspace サービスの管理", en: "Manage core Workspace services", w: null,
        topics: ["Gmail のルーティング・コンプライアンスルール・SPF / DKIM / DMARC", "ドライブの共有設定と共有ドライブ", "カレンダー・Meet・Chat の設定", "サービスのオン / オフを OU / グループ単位で制御"] },
      { t: "データガバナンスとコンプライアンス", en: "Support data governance and compliance", w: null,
        topics: ["Google Vault（保持ルール・訴訟ホールド・検索とエクスポート）", "データ損失防止（DLP）ルール", "データリージョン", "監査ログと調査ツール"] },
      { t: "セキュリティポリシーとアクセス制御", en: "Manage security policies and access controls", w: null,
        topics: ["2段階認証プロセス（2SV）の強制とセキュリティキー", "パスワードポリシー・SSO（SAML）", "コンテキストアウェアアクセス", "サードパーティアプリの OAuth アクセス制御"] },
      { t: "エンドポイント管理", en: "Manage endpoints", w: null,
        topics: ["基本 / 詳細モバイル管理", "Windows デバイス管理", "Chrome ブラウザ / ChromeOS の管理", "デバイスのワイプ・承認"] },
      { t: "一般的な問題のトラブルシューティング", en: "Troubleshoot common issues", w: null,
        topics: ["メール配信問題（メールログ検索・ヘッダ解析）", "設定反映の遅延（最大24時間）と OU 継承の確認", "アクセスできない共有ファイルの調査", "Google Workspace ステータスダッシュボードとサポートへの連絡"] }
    ]
  },
  {
    id: "pca", abbr: "PCA", name: "Professional Cloud Architect", level: "professional", phase: 3, hours: 80,
    slug: "cloud-architect", color: "#4285f4",
    length: 120, questions: "50-60（ケーススタディ2件で20-30%）", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "業界経験3年以上（うち Google Cloud での設計・管理1年以上）",
    guide: "https://services.google.com/fh/files/misc/professional_cloud_architect_exam_guide_english.pdf",
    update: "製品名変更を反映して更新済み。Well-Architected Framework の6つの柱が前提知識。ケーススタディ: Altostrat Media / Cymbal Retail / EHR Healthcare / KnightMotives Automotive（二次情報）。更新試験は生成AIのケーススタディ中心。",
    weightSrc: "secondary",
    weightNote: "二次情報（複数サイトで一致）。公式PDFで要確認",
    domains: [
      { t: "クラウドソリューションアーキテクチャの設計と計画", en: "Design and plan a cloud solution architecture", w: 24,
        topics: ["ビジネス要件（コスト・コンプライアンス・可観測性）と技術要件（HA・スケーラビリティ）の整理", "コンピューティング / ストレージ / ネットワークの選択", "移行計画（評価→計画→デプロイ→最適化）、Migration Center", "Well-Architected Framework の6本柱"] },
      { t: "インフラストラクチャの管理とプロビジョニング", en: "Manage and provision the cloud solution infrastructure", w: 15,
        topics: ["ネットワーク構成（共有VPC・ハイブリッド接続・ロードバランサ選択）", "ストレージ・データベースのプロビジョニング", "コンピューティング（MIG・GKE・サーバーレス）", "生成AIを活用するアーキテクチャ（Agent Platform）"] },
      { t: "セキュリティとコンプライアンスの設計", en: "Design for security and compliance", w: 18,
        topics: ["IAM・組織ポリシー・VPC Service Controls", "CMEK / Cloud KMS / Secret Manager", "データ所在地・規制（HIPAA・PCI DSS など）", "Assured Workloads"] },
      { t: "技術・ビジネスプロセスの分析と最適化", en: "Analyze and optimize technical and business processes", w: 18,
        topics: ["CI/CD とリリース戦略", "コスト最適化（確約利用割引・Spot・右サイジング）", "事業継続・DR（RTO / RPO とコールド / ウォーム / ホット）", "ステークホルダー管理・チェンジマネジメント"] },
      { t: "実装の管理", en: "Manage implementations of cloud architecture", w: 11,
        topics: ["開発・運用チームへの助言（API ベストプラクティス・テスト）", "gcloud / Cloud Shell / クライアントライブラリ / エミュレータ", "IaC（Terraform）と Gemini Cloud Assist の活用"] },
      { t: "ソリューションと運用の卓越性", en: "Ensure solution and operations excellence", w: 14,
        topics: ["Google Cloud Observability によるモニタリング / ロギング / アラート", "デプロイとリリース管理（カナリア・ブルーグリーン）", "品質管理とサポート", "信頼性（カオスエンジニアリング・ペネトレーションテスト）"] }
    ]
  },
  {
    id: "pcd", abbr: "PCD", name: "Professional Cloud Developer", level: "professional", phase: 3, hours: 60,
    slug: "cloud-developer", color: "#12b5cb",
    length: 120, questions: "50-60", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "業界経験3年以上（うち Google Cloud 1年以上）",
    guide: "https://services.google.com/fh/files/misc/professional_cloud_developer_exam_guide_english.pdf",
    update: "製品名変更を反映して更新済み。生成AI API の利用、AIコーディング支援・コンテキストエンジニアリングが職務定義に追加。",
    weightSrc: null,
    weightNote: "二次情報の値が 25〜36% と割れているため未掲載。演習は均等配分",
    domains: [
      { t: "スケーラブル・安全・高信頼なクラウドネイティブアプリの設計", en: "Design highly scalable, secure, and reliable cloud-native applications", w: null,
        topics: ["マイクロサービスとイベント駆動（Pub/Sub / Eventarc）", "実行基盤の選択（Cloud Run / GKE / Cloud Run functions / Compute Engine）", "セッション・キャッシュ（Memorystore）とステートレス設計", "API 設計・バージョニング、Apigee / API Gateway"] },
      { t: "アプリのビルドとテスト", en: "Build and test applications", w: null,
        topics: ["ローカル開発とエミュレータ（Pub/Sub / Firestore / Spanner など）", "Cloud Build・Artifact Registry・ユニット / 統合テスト", "Gemini Code Assist などAIコーディング支援", "コンテナイメージのベストプラクティス"] },
      { t: "デプロイ構成", en: "Configure cloud-native applications for deployment", w: null,
        topics: ["Cloud Deploy・カナリア / ブルーグリーン / トラフィック分割", "Secret Manager・環境変数・Workload Identity Federation for GKE", "Cloud Run の同時実行数・最小インスタンス・CPU 割り当て", "GKE の Deployment / Service / Ingress / Gateway"] },
      { t: "Google Cloud サービスとの統合", en: "Integrate applications with Google Cloud services", w: null,
        topics: ["Cloud Storage 署名付きURL・Firestore / Cloud SQL / Spanner 接続", "Pub/Sub（push / pull・順序指定・デッドレター）", "Cloud Tasks / Workflows / Cloud Scheduler", "Gemini API による生成AI機能の組み込み、Cloud Trace / Profiler"] }
    ]
  },
  {
    id: "pcdoe", abbr: "PCDOE", name: "Professional Cloud DevOps Engineer", level: "professional", phase: 3, hours: 60,
    slug: "cloud-devops-engineer", color: "#5f6368",
    length: 120, questions: "50-60", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "業界経験3年以上（うち Google Cloud 本番運用1年以上）",
    guide: "https://services.google.com/fh/files/misc/professional_cloud_devops_engineer_exam_guide_english.pdf",
    update: "ML ワークロードの CI/CD が出題範囲に明記。",
    weightSrc: null,
    weightNote: "版により値が異なる（第1セクション 15% / 20%）ため未掲載。演習は均等配分",
    domains: [
      { t: "Google Cloud 組織のブートストラップと維持", en: "Bootstrap and maintain a Google Cloud organization", w: null,
        topics: ["リソース階層・共有VPC・プロジェクト分割", "IaC（Terraform）・Config Connector・Policy as Code", "CI/CD 用サービスアカウントと Workload Identity Federation", "マルチ環境（dev / stg / prod）の分離"] },
      { t: "SRE プラクティスの適用", en: "Apply site reliability engineering practices", w: null,
        topics: ["SLI / SLO / SLA とエラーバジェット", "トイル削減・ポストモーテム（非難しない文化）", "インシデント管理（IC・コミュニケーション・運用の役割分担）", "キャパシティ計画・負荷試験"] },
      { t: "CI/CD パイプラインの構築（継続的テスト含む）", en: "Build and implement CI/CD pipelines", w: null,
        topics: ["Cloud Build・Cloud Deploy・Artifact Registry", "Binary Authorization とサプライチェーンセキュリティ（SLSA）", "デプロイ戦略（ローリング / ブルーグリーン / カナリア）", "ML パイプライン・インフラの CI/CD"] },
      { t: "オブザーバビリティとトラブルシューティング", en: "Implement observability practices and troubleshoot issues", w: null,
        topics: ["Cloud Monitoring / Logging / Trace / Profiler、Managed Service for Prometheus", "ログベース指標・ログルーター・集約シンク", "アラートポリシーとバーンレートアラート", "Error Reporting・デバッグ手法"] },
      { t: "パフォーマンスとコストの最適化", en: "Optimize performance and cost", w: null,
        topics: ["Recommender による右サイジング", "確約利用割引・Spot VM・オートスケーリング", "請求データの BigQuery エクスポートとラベル", "GKE コスト最適化（Autopilot・ノード自動プロビジョニング）"] }
    ]
  },
  {
    id: "pde", abbr: "PDE", name: "Professional Data Engineer", level: "professional", phase: 3, hours: 80,
    slug: "data-engineer", color: "#fbbc04",
    length: 120, questions: "40-50", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "業界経験3年以上（うち Google Cloud 1年以上）",
    guide: "https://services.google.com/fh/files/misc/professional_data_engineer_exam_guide_english.pdf",
    update: "近日、製品名変更を反映した更新予定。Google Skills での更新に対応。",
    weightSrc: "secondary",
    weightNote: "二次情報（第1〜3セクションは検索結果で確認）。公式PDFで要確認",
    domains: [
      { t: "データ処理システムの設計", en: "Design data processing systems", w: 22,
        topics: ["セキュリティとコンプライアンス（IAM・DLP / Sensitive Data Protection・CMEK・データ所在地）", "信頼性と忠実性（データ検証・リカバリ）", "柔軟性と移植性（マルチクラウド・BigQuery Omni）", "データ移行（Database Migration Service・Datastream・BigQuery Migration Service）"] },
      { t: "データの取り込みと処理", en: "Ingest and process the data", w: 25,
        topics: ["Dataflow（Apache Beam）: ウィンドウ・ウォーターマーク・遅延データ", "Pub/Sub の配信保証・順序指定・exactly-once", "Dataproc（Spark / Hadoop）と Serverless for Apache Spark", "Cloud Composer / Workflows / Dataform によるオーケストレーション"] },
      { t: "データの保存", en: "Store the data", w: 20,
        topics: ["Bigtable（行キー設計・ホットスポット回避）", "Spanner（グローバル一貫性・インターリーブ）", "BigQuery（パーティション・クラスタリング・マテリアライズドビュー）", "データレイク / レイクハウス（BigLake・Dataplex Universal Catalog）"] },
      { t: "分析用データの準備と利用", en: "Prepare and use data for analysis", w: 15,
        topics: ["BigQuery での可視化準備・BI Engine", "Analytics Hub によるデータ共有", "BigQuery ML・特徴量エンジニアリング", "承認済みビュー・列 / 行レベルセキュリティ"] },
      { t: "データワークロードの保守と自動化", en: "Maintain and automate data workloads", w: 18,
        topics: ["BigQuery のスロット（エディション・予約・オートスケール）", "ジョブの監視とトラブルシューティング", "Cloud Composer の DAG 設計・リトライ", "コスト最適化（クエリの見積もり・パーティションプルーニング）"] }
    ]
  },
  {
    id: "pcdbe", abbr: "PCDBE", name: "Professional Cloud Database Engineer", level: "professional", phase: 3, hours: 60,
    slug: "cloud-database-engineer", color: "#a142f4",
    length: 120, questions: "50-60", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "DB・IT経験5年以上（うち Google Cloud の DB 実務2年）",
    guide: "https://services.google.com/fh/files/misc/professional_cloud_database_engineer_exam_guide_english.pdf",
    update: "近日、製品名変更を反映した更新予定（公式ページ告知）。",
    weightSrc: null,
    weightNote: "二次情報の値が割れているため未掲載。演習は均等配分",
    domains: [
      { t: "スケーラブルで高可用なDBソリューションの設計", en: "Design scalable and highly available cloud database solutions", w: null,
        topics: ["Cloud SQL / AlloyDB / Spanner / Bigtable / Firestore / Memorystore の選択基準", "HA構成（リージョン / マルチリージョン）とRTO・RPO", "リードレプリカ・クロスリージョンレプリカ", "容量・性能見積もり"] },
      { t: "複数DBにまたがるソリューションの管理", en: "Manage a solution that can span multiple database solutions", w: null,
        topics: ["接続（Cloud SQL Auth Proxy・プライベートIP・PSC）", "IAM データベース認証", "バックアップ / PITR / エクスポート", "Query Insights によるチューニング・メンテナンスウィンドウ"] },
      { t: "データ移行", en: "Migrate data solutions", w: null,
        topics: ["Database Migration Service（同種 / 異種移行、CDC）", "Datastream による変更データキャプチャ", "Spanner への移行（Spanner Migration Tool）", "カットオーバー計画とロールバック"] },
      { t: "スケーラブルで高可用なDBのデプロイ", en: "Deploy scalable and highly available databases in Google Cloud", w: null,
        topics: ["Terraform による DB プロビジョニング", "Spanner のノード / 処理ユニットとオートスケーリング", "Bigtable のクラスタ・アプリプロファイル・レプリケーション", "AlloyDB のプライマリ / リードプール"] }
    ]
  },
  {
    id: "pcne", abbr: "PCNE", name: "Professional Cloud Network Engineer", level: "professional", phase: 4, hours: 80,
    slug: "cloud-network-engineer", color: "#34a853",
    length: 120, questions: "50-60", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "業界経験3年以上（うち Google Cloud 1年以上）",
    guide: "https://services.google.com/fh/files/misc/042426_professional_cloud_network_engineer_exam_guide_english.pdf",
    update: "2026年4月付の新しい試験ガイド（ファイル名から推定）。Cloud NGFW・Secure Web Proxy が職務定義に明記。",
    weightSrc: "secondary",
    weightNote: "二次情報。公式PDFで要確認",
    domains: [
      { t: "VPC ネットワークの設計と計画", en: "Design and plan a Google Cloud VPC network", w: 21,
        topics: ["IP アドレス計画（RFC1918・非RFC1918・IPv6）", "共有VPC vs VPC ピアリング vs Network Connectivity Center", "GKE の VPC ネイティブクラスタとセカンダリ範囲", "ハブ&スポーク・マルチVPC設計"] },
      { t: "VPC ネットワークの実装", en: "Implement a VPC network", w: 20,
        topics: ["カスタムモードVPC・サブネット・ルート（静的 / 動的 / ポリシーベース）", "Private Google Access・Private Service Connect", "Cloud Router と BGP", "VPC ピアリングの非推移性"] },
      { t: "マネージドネットワークサービスの構成", en: "Configure managed network services", w: 16,
        topics: ["ロードバランサ選択（アプリケーション / ネットワーク、外部 / 内部、グローバル / リージョン）", "Cloud CDN・キャッシュキー", "Cloud DNS（限定公開ゾーン・転送・ピアリング・DNSSEC）", "Cloud NAT"] },
      { t: "ハイブリッド・マルチクラウド接続", en: "Configure and implement hybrid and multi-cloud network interconnectivity", w: 16,
        topics: ["Dedicated / Partner Interconnect と SLA 構成", "HA VPN（99.99%）と Classic VPN", "Cross-Cloud Interconnect", "オンプレからの Google API アクセス（restricted / private VIP）"] },
      { t: "ネットワーク運用の管理・監視・トラブルシューティング", en: "Manage, monitor, and troubleshoot network operations", w: 14,
        topics: ["Network Intelligence Center（接続テスト・Performance Dashboard・Firewall Insights）", "VPC フローログ・ファイアウォールルールロギング", "パケットミラーリング", "IAM ロール（Network Admin / Security Admin）"] },
      { t: "ネットワークセキュリティ", en: "Configure, implement, and manage a cloud network security solution", w: 13,
        topics: ["Cloud NGFW（階層型ファイアウォールポリシー・ネットワークファイアウォールポリシー・IPS）", "Google Cloud Armor（WAF・DDoS・レート制限）", "VPC Service Controls", "Secure Web Proxy・IAP"] }
    ]
  },
  {
    id: "pcse", abbr: "PCSE", name: "Professional Cloud Security Engineer", level: "professional", phase: 4, hours: 70,
    slug: "cloud-security-engineer", color: "#ea4335",
    length: 120, questions: "50-60", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "業界経験3年以上（うち Google Cloud での設計・管理1年超）",
    guide: "https://services.google.com/fh/files/misc/professional_cloud_security_engineer_exam_guide_english.pdf",
    update: "AI ワークロードの保護・ソフトウェアサプライチェーンの保護が職務定義に明記。",
    weightSrc: "secondary",
    weightNote: "二次情報。公式PDFで要確認",
    domains: [
      { t: "アクセスの構成", en: "Configure access", w: 25,
        topics: ["Cloud Identity・GCDS・SSO / SAML", "Workforce / Workload Identity Federation", "サービスアカウントキーの回避と短期認証情報", "IAM Conditions・IAM Deny ポリシー・PAM（特権アクセス管理）"] },
      { t: "通信の保護と境界防御", en: "Secure communications and establish boundary protection", w: 22,
        topics: ["VPC Service Controls（境界・アクセスレベル・ブリッジ・ドライランモード）", "Cloud Armor・Cloud NGFW・IAP", "Private Google Access / Private Service Connect", "Access Context Manager"] },
      { t: "データ保護", en: "Ensure data protection", w: 23,
        topics: ["Sensitive Data Protection（DLP）による検出・匿名化（マスキング・トークン化）", "Cloud KMS / CMEK / Cloud HSM / Cloud EKM", "Secret Manager", "Confidential Computing・AI ワークロードのデータ保護"] },
      { t: "運用の管理", en: "Manage operations", w: 19,
        topics: ["Security Command Center（脅威検知・脆弱性・ポスチャ）", "Cloud Audit Logs（管理アクティビティ / データアクセス）と集約シンク", "Binary Authorization・Artifact Analysis", "インシデント対応の自動化"] },
      { t: "コンプライアンス要件への対応", en: "Support compliance requirements", w: 11,
        topics: ["Assured Workloads とデータ所在地", "組織ポリシー（リソースロケーション制限など）", "Access Transparency / アクセス承認", "責任共有モデルと監査"] }
    ]
  },
  {
    id: "psoe", abbr: "PSOE", name: "Professional Security Operations Engineer", level: "professional", phase: 4, hours: 70,
    slug: "security-operations-engineer", color: "#c5221f",
    length: 120, questions: "50-60", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "セキュリティ業界3年以上（うち Google Cloud セキュリティツール1年以上）",
    guide: "https://services.google.com/fh/files/misc/professional_security_operations_engineer_exam_guide_english.pdf",
    update: "Google Security Operations（旧 Chronicle）・SCC・Mandiant 脅威インテリジェンスが中心。",
    weightSrc: "secondary",
    weightNote: "二次情報（検索結果で公式PDF由来の値を確認）。公式PDFで要確認",
    domains: [
      { t: "プラットフォーム運用", en: "Platform operations", w: 14,
        topics: ["Google SecOps（SIEM / SOAR）と SCC の役割分担", "テレメトリソースの選定", "RBAC・データ RBAC によるアクセス制御", "フィード・フォワーダー・Bindplane"] },
      { t: "データ管理", en: "Data management", w: 14,
        topics: ["UDM（統合データモデル）へのパース・パーサー拡張", "ログ取り込みと正規化", "ユーザー / アセット / エンティティのコンテキスト（エイリアス化）", "ベースラインの把握"] },
      { t: "脅威ハンティング", en: "Threat hunting", w: 19,
        topics: ["UDM 検索・ログ検索・統計クエリ", "Mandiant / VirusTotal の脅威インテリジェンス活用", "仮説駆動型ハンティング（MITRE ATT&CK）", "IoC マッチング"] },
      { t: "検知エンジニアリング", en: "Detection engineering", w: 22,
        topics: ["YARA-L 2.0 ルール（events / match / outcome / condition）", "キュレーテッド検知", "リスク分析（エンティティ・リスクスコア）", "誤検知チューニング"] },
      { t: "インシデント対応", en: "Incident response", w: 21,
        topics: ["SOAR プレイブックの作成と自動化", "ケース管理ライフサイクル（アラートのグルーピング・優先度付け）", "封じ込め（VM 隔離・認証情報の無効化）", "フォレンジックと証拠保全"] },
      { t: "オブザーバビリティ", en: "Observability", w: 10,
        topics: ["ダッシュボードとレポート", "取り込みの健全性監視とアラート（サイレントソース検知）", "Cloud Monitoring との連携", "KPI（MTTD / MTTR）"] }
    ]
  },
  {
    id: "pmle", abbr: "PMLE", name: "Professional Machine Learning Engineer", level: "professional", phase: 4, hours: 90,
    slug: "machine-learning-engineer", color: "#f538a0",
    length: 120, questions: "50-60", fee: 200, languages: ["英語", "日本語"],
    validity: 2, experience: "業界経験3年以上（うち Google Cloud 1年以上）。Python / SQL の読解力",
    guide: "https://services.google.com/fh/files/misc/professional_machine_learning_engineer_exam_guide_english_new.pdf",
    update: "Vertex AI から Gemini Enterprise Agent Platform への移行、データ分析スタックの更新を反映した新版（2026年6月）。生成AI・評価・プロンプト / コンテキストエンジニアリングの比重増。",
    weightSrc: "secondary",
    weightNote: "二次情報（旧版の値の可能性あり）。新版の公式PDFで要確認",
    domains: [
      { t: "ローコードAIソリューションの設計", en: "Architect low-code AI solutions", w: 13,
        topics: ["BigQuery ML（モデル種類・ML.PREDICT・ML.GENERATE_TEXT）", "事前学習済みAPI・Model Garden・Agent Studio", "AutoML の使いどころ", "RAG / 検索（Search）を使ったローコード生成AI"] },
      { t: "チーム間でのデータとモデルの管理", en: "Collaborate within and across teams to manage data and models", w: 14,
        topics: ["Feature Store（オンライン / オフライン提供）", "Colab Enterprise / Workbench", "データの前処理（Dataflow / BigQuery / Dataproc）", "実験管理・メタデータ・データセットのバージョン管理"] },
      { t: "プロトタイプからMLモデルへのスケール", en: "Scale prototypes into ML models", w: 18,
        topics: ["カスタムトレーニング（コンテナ・分散学習・GPU / TPU 選択）", "ハイパーパラメータチューニング", "基盤モデルのチューニング（教師ありファインチューニング・PEFT / LoRA）", "過学習・データリーク・クラス不均衡への対処"] },
      { t: "モデルのサービングとスケーリング", en: "Serve and scale models", w: 20,
        topics: ["オンライン予測（エンドポイント）とバッチ予測", "Model Registry とバージョン管理・トラフィック分割", "レイテンシ最適化（量子化・アクセラレータ・オートスケーリング）", "Agent Runtime（旧 Agent Engine）へのエージェントデプロイ"] },
      { t: "MLパイプラインの自動化とオーケストレーション", en: "Automate and orchestrate ML pipelines", w: 22,
        topics: ["Pipelines（Kubeflow Pipelines / TFX）", "CI/CD/CT（継続的トレーニング）", "メタデータとリネージ", "Cloud Build / Cloud Scheduler / Eventarc によるトリガー"] },
      { t: "AIソリューションの監視", en: "Monitor AI solutions", w: 13,
        topics: ["Model Monitoring（トレーニング / サービングスキュー・ドリフト）", "生成AIの評価（Gen AI Evaluation Service・自動評価指標・LLM-as-a-judge）", "責任あるAI（公平性・説明可能性・安全フィルタ）", "コスト・レイテンシの監視"] }
    ]
  },
  {
    id: "paa", abbr: "PAA", name: "Professional Agentic Architect (Beta)", level: "professional", phase: 4, hours: 80, beta: true,
    slug: "agentic-architect", color: "#0b57d0",
    length: 180, questions: "約80（多肢選択）＋ Google Skills でのハンズオンラボ", fee: 120, feeNote: "ベータ価格（通常 $200 の40%引き）", languages: ["英語"],
    validity: 1, experience: "クラウドソリューション3年以上（うちエージェント構築1年以上）",
    guide: "https://services.google.com/fh/files/misc/professional_agentic_architect_exam_guide_english.pdf",
    update: "ベータ受付は2026年9月30日まで。多肢選択試験（Pearson）とハンズオンラボ（Google Skills）の2部構成。結果は両ウィンドウ終了後4〜6週間で通知。",
    weightSrc: "secondary",
    weightNote: "二次情報（試験ガイドの紹介記事）。公式PDFで要確認",
    domains: [
      { t: "ローコードツールによるエージェント構築", en: "Build agents using low-code tools", w: 13,
        topics: ["Agent Studio・Gemini Enterprise のノーコードエージェント", "グラウンディング（Google 検索・社内データ・Search）", "コネクタとデータストア", "ローコードとカスタム開発の判断基準"] },
      { t: "コーディングエージェントによるアプリ開発", en: "Use coding agents for application development", w: 17,
        topics: ["Gemini CLI・Gemini Code Assist・Antigravity", "コンテキストエンジニアリング（GEMINI.md / ルール / 仕様駆動）", "エージェントに与える権限とサンドボックス", "生成コードのレビューとテスト"] },
      { t: "カスタムエージェントの開発", en: "Develop custom agents", w: 33,
        topics: ["ADK（Agent Development Kit）: LlmAgent・ツール・Sequential / Parallel / Loop エージェント", "マルチエージェント設計（オーケストレーター / サブエージェント）", "MCP（ツール接続）と A2A（エージェント間連携）", "セッション・状態・Memory Bank（長期記憶）"] },
      { t: "エージェントワークフローの評価とデプロイ", en: "Evaluate and deploy agentic workflows", w: 22,
        topics: ["エージェント評価（軌跡 / trajectory 評価・最終応答評価・評価データセット）", "Agent Runtime（旧 Agent Engine）/ Cloud Run / GKE へのデプロイ", "トレーシングとオブザーバビリティ", "コストとレイテンシの最適化（モデル選択・キャッシュ）"] },
      { t: "エージェントワークフローのセキュリティとガバナンス", en: "Secure and govern agentic workflows", w: 15,
        topics: ["エージェントID・最小権限・ツール呼び出しの承認（Human-in-the-loop）", "プロンプトインジェクション対策・Model Armor", "Agent Gateway / レジストリによるガバナンス", "監査ログとポリシー"] }
    ]
  }
];

/* 全冠ロードマップ（本アプリの推奨。公式の推奨順ではない） */
GC.phases = [
  { n: 1, title: "基礎を固める", desc: "用語と Google Cloud の全体像。以降の全資格の土台になる。", ids: ["cdl", "gail"] },
  { n: 2, title: "手を動かす（Associate）", desc: "gcloud・IAM・VPC・データ基盤・Workspace 管理の実務知識。Professional の前提。", ids: ["ace", "adp", "agwa"] },
  { n: 3, title: "設計の中核（Professional コア）", desc: "PCA を軸に、開発・運用・データの3方向へ。出題範囲の重なりが大きく連続受験が効率的。", ids: ["pca", "pcd", "pcdoe", "pde", "pcdbe"] },
  { n: 4, title: "専門領域（Professional スペシャリティ）", desc: "ネットワーク・セキュリティ・SecOps・ML・エージェント。深い専門知識が必要。", ids: ["pcne", "pcse", "psoe", "pmle", "paa"] }
];

/* 出題範囲の重なり（学習順序の根拠） */
GC.overlaps = [
  { a: "ace", b: "pca", why: "IAM・VPC・コンピューティング選択・運用の大半が共通" },
  { a: "pca", b: "pcdoe", why: "CI/CD・リリース戦略・SRE・オブザーバビリティ" },
  { a: "pca", b: "pcd", why: "実行基盤選択・マイクロサービス・API" },
  { a: "adp", b: "pde", why: "BigQuery・Dataflow・Composer・データガバナンス" },
  { a: "pde", b: "pcdbe", why: "Spanner / Bigtable / Cloud SQL の選択と移行" },
  { a: "pde", b: "pmle", why: "BigQuery ML・前処理パイプライン・Feature Store" },
  { a: "pcne", b: "pcse", why: "VPC SC・Cloud Armor・NGFW・Private Service Connect" },
  { a: "pcse", b: "psoe", why: "SCC・監査ログ・インシデント対応" },
  { a: "gail", b: "paa", why: "Agent Platform・グラウンディング・責任あるAI" },
  { a: "pmle", b: "paa", why: "評価・デプロイ・Agent Runtime" }
];
