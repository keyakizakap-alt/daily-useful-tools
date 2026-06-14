import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 本番デプロイ向け: 依存を含む最小ランタイムを .next/standalone に出力する
  output: "standalone",
};

export default nextConfig;
