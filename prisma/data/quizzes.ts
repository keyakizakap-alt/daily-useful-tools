import type { QuizSeed } from "./types";

// クイズ（BASIC: 基本四択 / USECASE: 用途から選択 / COMPARISON: 使い分け / CERT: 資格別）
export const quizzes: QuizSeed[] = [
  // ---- BASIC: 基本四択 ----
  {
    id: "q-basic-001",
    type: "BASIC",
    question: "サーバーのプロビジョニングや管理なしでコードを実行できるサービスはどれか。",
    choices: ["Amazon EC2", "AWS Lambda", "Amazon ECS（EC2起動タイプ）", "Amazon Lightsail"],
    answerIndex: 1,
    explanation:
      "Lambdaはサーバー管理不要（サーバーレス）でコードを実行できるFaaS。EC2やECS（EC2起動タイプ）はホストの管理が必要。",
    serviceId: "lambda",
  },
  {
    id: "q-basic-002",
    type: "BASIC",
    question: "イレブンナイン（99.999999999%）の耐久性を持つオブジェクトストレージはどれか。",
    choices: ["Amazon EBS", "Amazon EFS", "Amazon S3", "AWS Storage Gateway"],
    answerIndex: 2,
    explanation: "S3は99.999999999%（イレブンナイン）の耐久性を持つオブジェクトストレージ。EBSはブロック、EFSはファイルストレージ。",
    serviceId: "s3",
  },
  {
    id: "q-basic-003",
    type: "BASIC",
    question: "AWSアカウント内の「誰が・何に・どんな操作を」できるかを制御するサービスはどれか。",
    choices: ["AWS IAM", "AWS KMS", "Amazon Cognito", "AWS WAF"],
    answerIndex: 0,
    explanation: "IAMはユーザー・グループ・ロール・ポリシーでAWSリソースへのアクセスを制御する。Cognitoはアプリのエンドユーザー認証向け。",
    serviceId: "iam",
  },
  {
    id: "q-basic-004",
    type: "BASIC",
    question: "DNSのマネージドサービスとしてドメイン登録やルーティングポリシーを提供するのはどれか。",
    choices: ["Amazon CloudFront", "AWS Global Accelerator", "Amazon Route 53", "Elastic Load Balancing"],
    answerIndex: 2,
    explanation: "Route 53はマネージドDNSサービス。名前の53はDNSのポート番号に由来する。",
    serviceId: "route53",
  },
  {
    id: "q-basic-005",
    type: "BASIC",
    question: "Lambda関数の最大実行時間はどれか。",
    choices: ["5分", "15分", "1時間", "無制限"],
    answerIndex: 1,
    explanation: "Lambdaの最大実行時間は15分。これを超える処理はECS・AWS Batch・Step Functionsによる分割を検討する。",
    serviceId: "lambda",
  },
  {
    id: "q-basic-006",
    type: "BASIC",
    question: "複数のAWSアカウントを組織として束ね、一括請求やSCPによる統制を行うサービスはどれか。",
    choices: ["AWS Control Tower", "AWS Organizations", "AWS IAM Identity Center", "AWS Config"],
    answerIndex: 1,
    explanation:
      "Organizationsはマルチアカウント管理の中核サービス。Control TowerはOrganizationsを利用してランディングゾーンを構築する上位サービス。",
    serviceId: "organizations",
  },
  {
    id: "q-basic-007",
    type: "BASIC",
    question: "SCP（Service Control Policy）の説明として正しいものはどれか。",
    choices: [
      "ユーザーに権限を付与するポリシー",
      "アカウントが実行できる操作の上限（ガードレール）を定めるポリシー",
      "S3バケットへのアクセスを制御するポリシー",
      "ネットワークトラフィックを制御するポリシー",
    ],
    answerIndex: 1,
    explanation:
      "SCPは権限を「付与」せず、許可され得る操作の上限を定める。実効権限はSCPとIAMポリシーの両方で許可された範囲となる。",
    serviceId: "scp",
  },
  {
    id: "q-basic-008",
    type: "BASIC",
    question: "エンベロープ暗号化で「データキーを暗号化する」役割を担うサービスはどれか。",
    choices: ["AWS Secrets Manager", "AWS Certificate Manager", "AWS KMS", "Amazon Macie"],
    answerIndex: 2,
    explanation:
      "KMSのKMSキーでデータキーを暗号化し、データ自体はデータキーで暗号化するのがエンベロープ暗号化。S3やEBSの保存時暗号化を支える。",
    serviceId: "kms",
  },
  // ---- USECASE: 用途から選択 ----
  {
    id: "q-usecase-001",
    type: "USECASE",
    question: "S3に保存したALBのアクセスログを、サーバーを立てずにアドホックにSQLで分析したい。最適なサービスはどれか。",
    choices: ["Amazon Redshift", "Amazon Athena", "Amazon EMR", "Amazon RDS"],
    answerIndex: 1,
    explanation:
      "AthenaはS3上のデータを直接SQLでクエリできるサーバーレスサービス。アドホックなログ分析の定番。常時稼働のDWHが必要ならRedshift。",
    serviceId: "athena",
  },
  {
    id: "q-usecase-002",
    type: "USECASE",
    question: "急増する注文リクエストをバッファリングし、ワーカーが自分のペースで取り出して処理できるようにしたい。使うべきサービスはどれか。",
    choices: ["Amazon SNS", "Amazon SQS", "Amazon EventBridge", "AWS Step Functions"],
    answerIndex: 1,
    explanation:
      "SQSはメッセージをキューに溜め、コンシューマーがポーリングで取り出すプル型。負荷平準化・疎結合化の定番。SNSは即時プッシュ配信で溜められない。",
    serviceId: "sqs",
  },
  {
    id: "q-usecase-003",
    type: "USECASE",
    question: "複数のEC2インスタンス（Linux）から同時にマウントできる共有ファイルストレージが必要。どれを選ぶか。",
    choices: ["Amazon EBS", "Amazon EFS", "Amazon S3", "インスタンスストア"],
    answerIndex: 1,
    explanation:
      "EFSはNFSで複数EC2から同時マウント可能。EBSは基本的に単一インスタンス・単一AZ。S3はファイルシステムとしてマウントする用途が主ではない。",
    serviceId: "efs",
  },
  {
    id: "q-usecase-004",
    type: "USECASE",
    question: "Active Directory統合が必要なWindowsファイルサーバーをAWSへ移行したい。最適なサービスはどれか。",
    choices: ["Amazon EFS", "Amazon FSx for Windows File Server", "Amazon S3", "Amazon FSx for Lustre"],
    answerIndex: 1,
    explanation:
      "「Windows」「SMB」「Active Directory」のキーワードが出たらFSx for Windows File Server。EFSはLinux（NFS）専用。",
    serviceId: "fsx",
  },
  {
    id: "q-usecase-005",
    type: "USECASE",
    question: "どんな規模でも1桁ミリ秒の応答が必要なセッション管理データストアを、サーバー管理なしで用意したい。どれを選ぶか。",
    choices: ["Amazon RDS", "Amazon Aurora", "Amazon DynamoDB", "Amazon Redshift"],
    answerIndex: 2,
    explanation:
      "「ミリ秒レイテンシー」「無制限スケール」「サーバーレス」はDynamoDBのキーワード。キーバリュー型のアクセスパターンに最適。",
    serviceId: "dynamodb",
  },
  {
    id: "q-usecase-006",
    type: "USECASE",
    question: "毎朝9時にLambda関数を起動して日次レポートを生成したい。スケジュール実行に使うサービスはどれか。",
    choices: ["Amazon SQS", "Amazon EventBridge", "AWS Config", "Amazon SNS"],
    answerIndex: 1,
    explanation: "EventBridge（スケジューラ）はcron式・rate式でターゲットを定期起動できる。旧CloudWatch Eventsの機能。",
    serviceId: "eventbridge",
  },
  {
    id: "q-usecase-007",
    type: "USECASE",
    question: "S3バケット内に個人情報（PII)が含まれていないか機械学習で自動検出したい。使うべきサービスはどれか。",
    choices: ["Amazon GuardDuty", "Amazon Inspector", "Amazon Macie", "AWS Security Hub"],
    answerIndex: 2,
    explanation:
      "MacieはS3専用の機密データ検出サービス。GuardDutyは脅威検知、Inspectorは脆弱性診断、Security Hubは検出結果の集約。",
    serviceId: "macie",
  },
  {
    id: "q-usecase-008",
    type: "USECASE",
    question: "RDSのデータベースパスワードを定期的に自動ローテーションしたい。最適なサービスはどれか。",
    choices: ["AWS Systems Manager Parameter Store", "AWS Secrets Manager", "AWS KMS", "AWS IAM"],
    answerIndex: 1,
    explanation:
      "自動ローテーションはSecrets Managerの代表機能。Parameter StoreはSecureStringで暗号化保存はできるがローテーション機能はない。",
    serviceId: "secrets-manager",
  },
  {
    id: "q-usecase-009",
    type: "USECASE",
    question: "プライベートサブネットのEC2からインターネットを経由せずS3にアクセスしたい。追加料金なしで実現する方法はどれか。",
    choices: [
      "NATゲートウェイを配置する",
      "インターフェイスエンドポイント（PrivateLink）を作成する",
      "ゲートウェイ型VPCエンドポイントを作成する",
      "インターネットゲートウェイを追加する",
    ],
    answerIndex: 2,
    explanation:
      "S3とDynamoDBはゲートウェイ型VPCエンドポイントに対応しており無料。インターフェイスエンドポイントでも可能だが有料。",
    serviceId: "privatelink",
  },
  {
    id: "q-usecase-010",
    type: "USECASE",
    question: "複数の基盤モデル（Claude、Llama等）を単一のAPIで利用し、RAGやエージェントを構築したい。最適なサービスはどれか。",
    choices: ["Amazon SageMaker", "Amazon Bedrock", "Amazon Comprehend", "Amazon Lex"],
    answerIndex: 1,
    explanation:
      "Bedrockは複数の基盤モデルを単一APIで使えるフルマネージド生成AIサービス。ナレッジベース（RAG）やエージェント機能も提供する。",
    serviceId: "bedrock",
  },
  // ---- COMPARISON: 使い分け ----
  {
    id: "q-comp-001",
    type: "COMPARISON",
    question: "ECSとEKSの使い分けとして最も適切な説明はどれか。",
    choices: [
      "ECSはKubernetes互換、EKSはAWS独自仕様である",
      "ECSはAWSネイティブでシンプル、EKSはKubernetes互換で既存K8s資産を活かせる",
      "ECSはコンテナ専用、EKSは仮想マシン専用である",
      "ECSは有料、EKSのコントロールプレーンは無料である",
    ],
    answerIndex: 1,
    explanation:
      "ECSはAWS独自のシンプルなオーケストレーター、EKSはマネージドKubernetes。K8sのエコシステムや互換性が必要ならEKS、シンプルさ重視ならECS。",
    serviceId: "ecs",
  },
  {
    id: "q-comp-002",
    type: "COMPARISON",
    question: "SQSとSNSの違いとして正しいものはどれか。",
    choices: [
      "SQSはプッシュ型で、SNSはプル型である",
      "SQSはプル型（ポーリング）で、SNSはプッシュ型（Pub/Sub）である",
      "どちらもメッセージを永続的に保存する",
      "SNSはFIFOに対応していない",
    ],
    answerIndex: 1,
    explanation:
      "SQSはコンシューマーがポーリングで取り出すプル型、SNSはサブスクライバーへ即時配信するプッシュ型。SNSにもFIFOトピックは存在する。",
    serviceId: "sqs",
  },
  {
    id: "q-comp-003",
    type: "COMPARISON",
    question: "CloudWatchとCloudTrailの役割分担として正しいものはどれか。",
    choices: [
      "CloudWatchはAPI操作の記録、CloudTrailは性能監視を行う",
      "CloudWatchは性能・リソースの監視、CloudTrailは「誰が何をしたか」のAPI操作記録を行う",
      "どちらも同じ機能で、料金だけが異なる",
      "CloudTrailはオンプレミス専用である",
    ],
    answerIndex: 1,
    explanation:
      "CloudWatch＝メトリクス・ログ・アラームによるモニタリング、CloudTrail＝API呼び出しの監査証跡。両者の対比は最頻出。",
    serviceId: "cloudwatch",
  },
  {
    id: "q-comp-004",
    type: "COMPARISON",
    question: "AuroraがRDS（標準エンジン）より優れている点として正しいものはどれか。",
    choices: [
      "OracleやSQL Serverも利用できる",
      "ストレージが3AZ6コピーに自動レプリケートされ、リードレプリカを最大15台持てる",
      "OSにSSHログインして細かくチューニングできる",
      "どんな規模でも常にRDSより安価である",
    ],
    answerIndex: 1,
    explanation:
      "Auroraは3つのAZに6コピーのストレージ、最大15台のリードレプリカ、自動ストレージ拡張が強み。対応エンジンはMySQL/PostgreSQL互換のみ。",
    serviceId: "aurora",
  },
  {
    id: "q-comp-005",
    type: "COMPARISON",
    question: "セキュリティグループとネットワークACLの違いとして正しいものはどれか。",
    choices: [
      "セキュリティグループはステートレス、NACLはステートフルである",
      "セキュリティグループはステートフルで許可ルールのみ、NACLはステートレスで許可/拒否ルールを設定できる",
      "どちらもサブネット単位で適用される",
      "NACLではルールの優先順位を設定できない",
    ],
    answerIndex: 1,
    explanation:
      "SGはインスタンス（ENI）単位・ステートフル・許可のみ。NACLはサブネット単位・ステートレス・許可と拒否（番号順評価）。超頻出の比較。",
    serviceId: "vpc",
  },
  {
    id: "q-comp-006",
    type: "COMPARISON",
    question: "Transit GatewayをVPCピアリングより優先すべきケースはどれか。",
    choices: [
      "2つのVPCを最も安価に接続したい場合",
      "多数のVPCとオンプレ接続をハブ&スポークで集約し、推移的ルーティングが必要な場合",
      "単一VPC内のサブネット間通信を高速化したい場合",
      "インターネット経由のアクセスを高速化したい場合",
    ],
    answerIndex: 1,
    explanation:
      "VPCが多数になるとピアリングは組み合わせが爆発し、推移的ルーティングもできない。Transit Gatewayはハブ&スポークで集約でき推移的に通信可能。",
    serviceId: "transit-gateway",
  },
  {
    id: "q-comp-007",
    type: "COMPARISON",
    question: "Secrets ManagerではなくParameter Store（標準）を選ぶ理由として適切なものはどれか。",
    choices: [
      "シークレットの自動ローテーションが必要だから",
      "無料で設定値を階層管理でき、ローテーションが不要だから",
      "クロスアカウント共有が必要だから",
      "RDSとのネイティブ統合が必要だから",
    ],
    answerIndex: 1,
    explanation:
      "Parameter Store標準パラメータは無料で階層管理・SecureString暗号化に対応。自動ローテーションが必要な場合のみSecrets Managerを選ぶ。",
    serviceId: "parameter-store",
  },
  {
    id: "q-comp-008",
    type: "COMPARISON",
    question: "GuardDuty・Inspector・Macieの役割の組み合わせとして正しいものはどれか。",
    choices: [
      "GuardDuty=脆弱性診断、Inspector=脅威検知、Macie=構成監査",
      "GuardDuty=脅威検知、Inspector=脆弱性診断、Macie=S3の機密データ検出",
      "GuardDuty=機密データ検出、Inspector=脅威検知、Macie=脆弱性診断",
      "3つとも同じ機能のリージョン違いである",
    ],
    answerIndex: 1,
    explanation:
      "GuardDuty＝攻撃の兆候（脅威）を検知、Inspector＝EC2/ECR/Lambdaの脆弱性（CVE）を診断、Macie＝S3の個人情報・機密データを検出。",
    serviceId: "guardduty",
  },
  {
    id: "q-comp-009",
    type: "COMPARISON",
    question: "Direct ConnectとSite-to-Site VPNの比較として正しいものはどれか。",
    choices: [
      "Direct Connectは即日開通でき、VPNは数ヶ月かかる",
      "Direct Connectは専用線で帯域が安定するが開通に時間がかかり、VPNはインターネット経由で安価・迅速に構築できる",
      "VPNは暗号化されず、Direct Connectは標準で暗号化される",
      "どちらもインターネットを経由する",
    ],
    answerIndex: 1,
    explanation:
      "DX＝専用線・安定帯域・開通まで数週間以上、VPN＝インターネット経由・暗号化・即日・安価。DX自体は暗号化されない点も頻出。",
    serviceId: "direct-connect",
  },
  {
    id: "q-comp-010",
    type: "COMPARISON",
    question: "BedrockとSageMakerの使い分けとして最も適切なものはどれか。",
    choices: [
      "Bedrockは独自モデルの学習用、SageMakerは既存モデルのAPI利用用",
      "Bedrockは既存基盤モデルのAPI利用が中心、SageMakerは独自モデルの構築・学習・デプロイ全般",
      "両者は同一サービスの新旧名称である",
      "SageMakerは生成AI専用である",
    ],
    answerIndex: 1,
    explanation:
      "Bedrock＝既存の基盤モデル（生成AI）をAPIで利用、SageMaker＝MLライフサイクル全体（構築・学習・デプロイ）。AIF/MLAで頻出の対比。",
    serviceId: "bedrock",
  },
  // ---- CERT: 資格別 ----
  {
    id: "q-cert-clf-001",
    type: "CERT",
    question: "【CLF】責任共有モデルにおいて、AWSの責任に該当するものはどれか。",
    choices: [
      "ゲストOSのパッチ適用",
      "データセンターの物理セキュリティ",
      "IAMユーザーのアクセス管理",
      "S3バケットの公開設定",
    ],
    answerIndex: 1,
    explanation:
      "AWSは「クラウド自体の」セキュリティ（物理・ハードウェア・基盤）に責任を持ち、顧客は「クラウド内の」設定・データに責任を持つ。",
    certificationId: "clf",
    serviceId: "iam",
  },
  {
    id: "q-cert-clf-002",
    type: "CERT",
    question: "【CLF】使った分だけ支払うクラウドの料金特性を表す用語はどれか。",
    choices: ["前払い固定", "従量課金（Pay-as-you-go）", "サブスクリプション必須", "年間契約のみ"],
    answerIndex: 1,
    explanation: "クラウドの基本的な料金特性は従量課金。初期投資（CapEx）を運用費用（OpEx）に置き換えられる点が頻出。",
    certificationId: "clf",
    serviceId: "ec2",
  },
  {
    id: "q-cert-saa-001",
    type: "CERT",
    question:
      "【SAA】RDSで「計画外停止時の自動フェイルオーバー」を実現する構成はどれか。",
    choices: ["リードレプリカ", "マルチAZ配置", "スナップショットの定期取得", "DynamoDBへの移行"],
    answerIndex: 1,
    explanation:
      "マルチAZは同期レプリケーションのスタンバイへ自動フェイルオーバーし可用性を高める。リードレプリカは読み取りスケール用で自動フェイルオーバーしない。",
    certificationId: "saa",
    serviceId: "rds",
  },
  {
    id: "q-cert-saa-002",
    type: "CERT",
    question:
      "【SAA】中断されても再実行できるバッチ処理のEC2コストを最小化する購入オプションはどれか。",
    choices: ["オンデマンド", "リザーブドインスタンス", "スポットインスタンス", "Dedicated Hosts"],
    answerIndex: 2,
    explanation:
      "スポットインスタンスは最大90%割引だが中断の可能性がある。中断耐性のあるステートレス/バッチ処理に最適。",
    certificationId: "saa",
    serviceId: "ec2",
  },
  {
    id: "q-cert-dva-001",
    type: "CERT",
    question: "【DVA】EC2上のアプリからS3にアクセスする際のベストプラクティスはどれか。",
    choices: [
      "アクセスキーをソースコードに埋め込む",
      "IAMロールをインスタンスにアタッチして一時認証情報を使う",
      "ルートユーザーのキーを環境変数に設定する",
      "S3バケットをパブリックにする",
    ],
    answerIndex: 1,
    explanation:
      "EC2にはIAMロール（インスタンスプロファイル）を使うのがベストプラクティス。キーの埋め込み・配布は漏洩リスクが高くNG。",
    certificationId: "dva",
    serviceId: "iam",
  },
  {
    id: "q-cert-dva-002",
    type: "CERT",
    question: "【DVA】SQSで処理に失敗し続けるメッセージを隔離して調査する仕組みはどれか。",
    choices: ["可視性タイムアウト", "デッドレターキュー（DLQ）", "ロングポーリング", "メッセージ遅延"],
    answerIndex: 1,
    explanation:
      "DLQは最大受信回数を超えたメッセージを退避するキュー。可視性タイムアウトは処理中メッセージを他コンシューマーから隠す仕組み。",
    certificationId: "dva",
    serviceId: "sqs",
  },
  {
    id: "q-cert-soa-001",
    type: "CERT",
    question: "【SOA】EC2のメモリ使用率をCloudWatchで監視するために必要なものはどれか。",
    choices: [
      "詳細モニタリングを有効化する",
      "CloudWatchエージェントをインストールする",
      "CloudTrailを有効化する",
      "何もしなくても標準メトリクスに含まれる",
    ],
    answerIndex: 1,
    explanation:
      "メモリ使用率やディスク使用率は標準メトリクスに含まれない。CloudWatchエージェントでカスタムメトリクスとして送信する必要がある。",
    certificationId: "soa",
    serviceId: "cloudwatch",
  },
  {
    id: "q-cert-scs-001",
    type: "CERT",
    question: "【SCS】「S3バケットの公開を禁止する」ルールへの違反を検出し自動修復したい。中心となるサービスはどれか。",
    choices: ["Amazon GuardDuty", "AWS Config", "Amazon Inspector", "AWS CloudTrail"],
    answerIndex: 1,
    explanation:
      "AWS Configはルールベースで構成の準拠を評価し、SSM Automationと組み合わせて自動修復できる。GuardDutyは脅威検知でルール評価ではない。",
    certificationId: "scs",
    serviceId: "config",
  },
  {
    id: "q-cert-sap-001",
    type: "CERT",
    question:
      "【SAP】組織内全アカウントで特定リージョン以外の利用を禁止するガードレールを最小の運用負荷で実現する方法はどれか。",
    choices: [
      "各アカウントのIAMポリシーを個別に修正する",
      "OrganizationsのSCPでリージョン制限を一括適用する",
      "各アカウントにConfigルールを手動設定する",
      "CloudTrailで違反を監視して手動対応する",
    ],
    answerIndex: 1,
    explanation:
      "SCPをOU/ルートに適用すれば配下の全アカウントに強制できる。IAM個別修正はスケールせず、ユーザーが自分で変更できてしまう。",
    certificationId: "sap",
    serviceId: "scp",
  },
  {
    id: "q-cert-ans-001",
    type: "CERT",
    question:
      "【ANS】CIDRが重複する2つのVPC間で、特定のサービスだけを相互利用させたい。適切な接続方式はどれか。",
    choices: ["VPCピアリング", "Transit Gateway", "AWS PrivateLink", "インターネットゲートウェイ"],
    answerIndex: 2,
    explanation:
      "VPCピアリングとTransit GatewayはCIDR重複時に利用できない。PrivateLinkはENI経由のサービス単位接続なのでCIDR重複でも機能する。",
    certificationId: "ans",
    serviceId: "privatelink",
  },
  {
    id: "q-cert-dea-001",
    type: "CERT",
    question:
      "【DEA】S3に毎日届くCSVファイルのスキーマを自動検出してカタログ化し、Parquetへ変換するサーバーレスETLを構築したい。中心となるサービスはどれか。",
    choices: ["Amazon EMR", "AWS Glue", "Amazon Kinesis", "AWS Batch"],
    answerIndex: 1,
    explanation:
      "Glueのクローラーでスキーマを自動検出してData Catalogに登録し、GlueジョブでParquet変換するのが定番のサーバーレスETL構成。",
    certificationId: "dea",
    serviceId: "glue",
  },
  {
    id: "q-cert-mla-001",
    type: "CERT",
    question: "【MLA】本番デプロイ済みMLモデルの精度劣化（データドリフト）を検知する機能はどれか。",
    choices: [
      "SageMaker Ground Truth",
      "SageMaker Model Monitor",
      "SageMaker Autopilot",
      "SageMaker Data Wrangler",
    ],
    answerIndex: 1,
    explanation:
      "Model Monitorは本番エンドポイントの入力データや予測品質を監視しドリフトを検知する。Ground Truthはラベリング、Autopilotは AutoML。",
    certificationId: "mla",
    serviceId: "sagemaker",
  },
  {
    id: "q-cert-aif-001",
    type: "CERT",
    question: "【AIF】生成AIで社内文書に基づいた回答をさせるために、外部知識を検索して回答に組み込む手法はどれか。",
    choices: ["ファインチューニング", "RAG（検索拡張生成）", "プロンプトインジェクション", "強化学習"],
    answerIndex: 1,
    explanation:
      "RAGは外部ナレッジを検索して回答生成時に与える手法。モデル自体を再学習するファインチューニングより低コストで知識を更新できる。",
    certificationId: "aif",
    serviceId: "bedrock",
  },
];
