import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ユニットテスト対象（Reactコンポーネントの結合テストは将来追加）
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
