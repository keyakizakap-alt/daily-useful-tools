// 資格マスタを certifications テーブルへ投入する。
//   実行: npm run db:seed
//   要環境変数: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { CERTIFICATIONS } from "../src/lib/certifications-data";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  }
  const supabase = createClient(url, key);

  const rows = CERTIFICATIONS.map((c) => ({
    vendor: c.vendor,
    code: c.code,
    name: c.name,
    level: c.level ?? null,
    category: c.category,
    description: c.description ?? null,
    official_url: c.officialUrl ?? null,
    is_active: true,
  }));

  // code を一意キーに upsert（再実行しても重複しない）
  const { error } = await supabase.from("certifications").upsert(rows, { onConflict: "code" });
  if (error) {
    console.error("seed failed:", error.message);
    process.exit(1);
  }
  console.log(`✅ ${rows.length} 件の資格マスタを投入しました。`);
}

main();
