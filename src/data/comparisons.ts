// サービス比較データ（F003）
export type Comparison = {
  id: string;
  title: string;
  aName: string;
  bName: string;
  aServiceId?: string;
  bServiceId?: string;
  summary: string;
  rows: { label: string; a: string; b: string }[];
};

export const comparisons: Comparison[] = [
  {
    id: "ecs-vs-eks",
    title: "ECS vs EKS",
    aName: "Amazon ECS",
    bName: "Amazon EKS",
    aServiceId: "ecs",
    bServiceId: "eks",
    summary:
      "どちらもコンテナオーケストレーション。AWSネイティブでシンプルに使うならECS、Kubernetes互換・エコシステムが必要ならEKS。",
    rows: [
      { label: "用途", a: "AWSネイティブなコンテナ運用", b: "Kubernetes互換のコンテナ運用" },
      { label: "管理負荷", a: "低い（学習コスト小）", b: "中〜高（K8sの知識・バージョンアップ運用が必要）" },
      { label: "コスト", a: "クラスター自体は無料", b: "コントロールプレーンに時間課金あり" },
      { label: "スケーラビリティ", a: "サービスAuto Scalingで十分高い", b: "HPA/Cluster Autoscaler等K8sの仕組みで高い" },
      { label: "可用性", a: "マルチAZ対応", b: "コントロールプレーンはAWSがマルチAZ管理" },
      { label: "試験頻出度", a: "★★★（SAA/DVA/SAP）", b: "★★☆（SAP/DVAで比較問題）" },
      { label: "推奨利用シーン", a: "AWS中心でシンプルに運用したい", b: "既存K8s資産・マルチクラウド・OSSエコシステム活用" },
    ],
  },
  {
    id: "sqs-vs-sns",
    title: "SQS vs SNS",
    aName: "Amazon SQS",
    bName: "Amazon SNS",
    aServiceId: "sqs",
    bServiceId: "sns",
    summary:
      "SQSはプル型のキュー（1対1・溜める）、SNSはプッシュ型のPub/Sub（1対多・即時配信）。組み合わせたファンアウトも定番。",
    rows: [
      { label: "用途", a: "負荷平準化・疎結合な非同期処理", b: "1対多の即時通知・ファンアウト" },
      { label: "配信モデル", a: "プル型（コンシューマーがポーリング）", b: "プッシュ型（サブスクライバーへ即時配信）" },
      { label: "メッセージ保持", a: "最大14日間保持", b: "保持しない（即時配信のみ）" },
      { label: "コスト", a: "リクエスト数課金・無料枠大", b: "発行/配信数課金・無料枠大" },
      { label: "スケーラビリティ", a: "ほぼ無制限", b: "ほぼ無制限" },
      { label: "試験頻出度", a: "★★★（SAA/DVA最頻出）", b: "★★★（SAA/DVA最頻出）" },
      { label: "推奨利用シーン", a: "確実に1件ずつ処理したいジョブ・バッファリング", b: "アラート通知・複数システムへの同時配信" },
    ],
  },
  {
    id: "cloudwatch-vs-cloudtrail",
    title: "CloudWatch vs CloudTrail",
    aName: "Amazon CloudWatch",
    bName: "AWS CloudTrail",
    aServiceId: "cloudwatch",
    bServiceId: "cloudtrail",
    summary:
      "CloudWatchは「リソースの状態・性能」を監視、CloudTrailは「誰が何をしたか（API操作）」を記録。役割がまったく異なる。",
    rows: [
      { label: "用途", a: "メトリクス・ログ・アラームによる監視", b: "API操作の監査証跡・コンプライアンス" },
      { label: "記録対象", a: "CPU使用率・ログ・カスタムメトリクス", b: "コンソール/CLI/SDKの全API呼び出し" },
      { label: "代表的な質問", a: "「CPUが高騰したら通知したい」", b: "「誰がSGを変更したか知りたい」" },
      { label: "コスト", a: "メトリクス・ログ量に応じた課金", b: "管理イベント90日分は無料" },
      { label: "連携", a: "SNS通知・Auto Scaling起動", b: "S3保存・Athena分析・EventBridge連携" },
      { label: "試験頻出度", a: "★★★（全資格）", b: "★★★（全資格）" },
      { label: "推奨利用シーン", a: "性能監視・アラート・ダッシュボード", b: "監査・セキュリティ調査・操作履歴の保全" },
    ],
  },
  {
    id: "aurora-vs-rds",
    title: "Aurora vs RDS",
    aName: "Amazon Aurora",
    bName: "Amazon RDS",
    aServiceId: "aurora",
    bServiceId: "rds",
    summary:
      "AuroraはAWSがクラウド向けに再設計した高性能RDB。RDSは多様なエンジンに対応する汎用マネージドRDB。性能・可用性ならAurora、エンジンの自由度と低コストならRDS。",
    rows: [
      { label: "用途", a: "高性能・高可用な本番RDB", b: "汎用的なマネージドRDB" },
      { label: "対応エンジン", a: "MySQL/PostgreSQL互換のみ", b: "MySQL/PostgreSQL/MariaDB/Oracle/SQL Server" },
      { label: "ストレージ", a: "3AZ・6コピー・自動拡張（最大128TiB）", b: "単一AZのEBS（マルチAZで同期レプリカ）" },
      { label: "リードレプリカ", a: "最大15台・フェイルオーバー先になれる", b: "最大5台" },
      { label: "コスト", a: "高め（小規模では割高）", b: "比較的安価・無料枠あり" },
      { label: "試験頻出度", a: "★★★（SAA/SAP）", b: "★★★（全資格）" },
      { label: "推奨利用シーン", a: "高トラフィック・ミッションクリティカル", b: "Oracle等の特定エンジンが必要・小〜中規模" },
    ],
  },
  {
    id: "sg-vs-nacl",
    title: "セキュリティグループ vs ネットワークACL",
    aName: "セキュリティグループ（SG）",
    bName: "ネットワークACL（NACL)",
    aServiceId: "vpc",
    bServiceId: "vpc",
    summary:
      "どちらもVPCのファイアウォール機能。SGはインスタンス単位・ステートフル、NACLはサブネット単位・ステートレス。両者の違いは全試験で最頻出。",
    rows: [
      { label: "適用単位", a: "インスタンス（ENI）単位", b: "サブネット単位" },
      { label: "状態管理", a: "ステートフル（戻り通信は自動許可）", b: "ステートレス（戻り通信も明示的に許可が必要）" },
      { label: "ルール", a: "許可ルールのみ", b: "許可と拒否の両方（番号順に評価）" },
      { label: "評価方法", a: "全ルールを評価", b: "番号の小さい順に評価し最初の一致で決定" },
      { label: "デフォルト動作", a: "インバウンド全拒否・アウトバウンド全許可", b: "デフォルトNACLは全許可" },
      { label: "試験頻出度", a: "★★★（SAA/SCS/ANS）", b: "★★★（SAA/SCS/ANS）" },
      { label: "推奨利用シーン", a: "基本のアクセス制御（まずSGで設計）", b: "特定IPの明示的拒否・サブネット全体の防御層" },
    ],
  },
  {
    id: "tgw-vs-peering",
    title: "Transit Gateway vs VPC Peering",
    aName: "AWS Transit Gateway",
    bName: "VPC Peering",
    aServiceId: "transit-gateway",
    bServiceId: "vpc",
    summary:
      "少数VPCの接続なら無料に近いピアリング、多数のVPC・オンプレ接続の集約や推移的ルーティングが必要ならTransit Gateway。",
    rows: [
      { label: "用途", a: "多数VPC・オンプレ接続のハブ&スポーク集約", b: "2つのVPCの1対1接続" },
      { label: "推移的ルーティング", a: "可能（ハブ経由で相互通信）", b: "不可（A-B、B-C接続でもA-Cは通信不可）" },
      { label: "管理負荷", a: "低い（接続を一元管理）", b: "VPC数が増えると組み合わせ爆発（n(n-1)/2）" },
      { label: "コスト", a: "アタッチメント＋データ処理料金", b: "同一AZ内のデータ転送は無料" },
      { label: "帯域", a: "アタッチメントあたり最大100Gbps", b: "制限なし（インフラ上の制約のみ）" },
      { label: "試験頻出度", a: "★★★（SAP/ANS）", b: "★★☆（SAA/SAP）" },
      { label: "推奨利用シーン", a: "VPCが多数（目安3つ以上）・オンプレ集約・マルチアカウント", b: "少数VPCの低コスト・低レイテンシー接続" },
    ],
  },
  {
    id: "lambda-vs-fargate",
    title: "Lambda vs Fargate",
    aName: "AWS Lambda",
    bName: "AWS Fargate",
    aServiceId: "lambda",
    bServiceId: "fargate",
    summary:
      "どちらもサーバーレスコンピューティング。イベント駆動の短時間処理ならLambda、長時間・常駐型のコンテナワークロードならFargate。",
    rows: [
      { label: "用途", a: "イベント駆動の関数実行", b: "コンテナの常駐・長時間実行" },
      { label: "実行時間", a: "最大15分", b: "制限なし" },
      { label: "起動単位", a: "関数（コードのみ）", b: "コンテナ（タスク）" },
      { label: "コスト", a: "リクエスト数＋実行時間（ms）課金", b: "vCPU・メモリの秒課金" },
      { label: "スケーラビリティ", a: "自動・瞬時（同時実行数制限あり）", b: "サービスAuto Scalingで調整" },
      { label: "試験頻出度", a: "★★★（全資格）", b: "★★☆（SAA/DVA）" },
      { label: "推奨利用シーン", a: "API・イベント処理・短時間バッチ", b: "Webアプリ常駐・15分超の処理・既存コンテナ活用" },
    ],
  },
  {
    id: "efs-vs-ebs",
    title: "EFS vs EBS",
    aName: "Amazon EFS",
    bName: "Amazon EBS",
    aServiceId: "efs",
    bServiceId: "ebs",
    summary:
      "EFSは複数インスタンスで共有できるファイルストレージ、EBSは単一インスタンス専用のブロックストレージ。「共有が必要か」が選択の分かれ目。",
    rows: [
      { label: "用途", a: "複数EC2での共有ファイルシステム", b: "EC2の専用ディスク（OS/DB）" },
      { label: "アクセス", a: "複数インスタンス・複数AZから同時マウント", b: "原則1インスタンス・同一AZのみ" },
      { label: "プロトコル", a: "NFS（Linuxのみ）", b: "ブロックデバイス" },
      { label: "容量", a: "自動伸縮（事前確保不要）", b: "事前にサイズ指定（拡張は可能）" },
      { label: "コスト", a: "GB単価は高め（IA階層で削減可）", b: "比較的安価・タイプで調整" },
      { label: "試験頻出度", a: "★★★（SAA）", b: "★★★（SAA/SOA）" },
      { label: "推奨利用シーン", a: "共有コンテンツ・CMS・コンテナの永続化", b: "DB・ブートボリューム・高IOPS用途" },
    ],
  },
];
