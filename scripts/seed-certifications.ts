// 資格マスタを certifications テーブルへ投入する。
// 実行: npm run db:seed
// 要環境変数: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { CERTIFICATIONS } from "../src/lib/certifications-data";

loadEnvConfig(process.cwd());

type CertificationSeedRow = {
  vendor: string;
  code: string;
  name: string;
  level: string | null;
  category: string;
  description: string | null;
  official_url: string | null;
  is_active: boolean;
};

type CertificationUpdateRow = Omit<CertificationSeedRow, "is_active">;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が必要です`);
  }
  return value;
}

function buildRows(): CertificationSeedRow[] {
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

  const invalidRows = rows.filter((row) => {
    return !row.vendor || !row.code || !row.name || !row.category;
  });

  if (invalidRows.length > 0) {
    throw new Error(`必須項目が不足している資格データがあります: ${JSON.stringify(invalidRows)}`);
  }

  const duplicateCodes = rows
    .map((row) => row.code)
    .filter((code, index, codes) => codes.indexOf(code) !== index);

  if (duplicateCodes.length > 0) {
    throw new Error(`code が重複している資格データがあります: ${[...new Set(duplicateCodes)].join(", ")}`);
  }

  return rows;
}

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const rows = buildRows();

  const { data: existingRows, error: selectError } = await supabase
    .from("certifications")
    .select("code")
    .in(
      "code",
      rows.map((row) => row.code),
    );

  if (selectError) {
    throw new Error(`existing certifications fetch failed: ${selectError.message}`);
  }

  const existingCodes = new Set((existingRows ?? []).map((row) => row.code));
  const insertRows = rows.filter((row) => !existingCodes.has(row.code));
  const updateRows: CertificationUpdateRow[] = rows
    .filter((row) => existingCodes.has(row.code))
    .map(({ is_active: _isActive, ...row }) => row);

  if (insertRows.length > 0) {
    const { error: insertError } = await supabase.from("certifications").insert(insertRows);

    if (insertError) {
      throw new Error(`seed insert failed: ${insertError.message}`);
    }
  }

  for (const row of updateRows) {
    const { code, ...values } = row;
    const { error: updateError } = await supabase.from("certifications").update(values).eq("code", code);

    if (updateError) {
      throw new Error(`seed update failed: ${code}: ${updateError.message}`);
    }
  }

  console.log(`${insertRows.length} 件追加、${updateRows.length} 件更新しました。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
