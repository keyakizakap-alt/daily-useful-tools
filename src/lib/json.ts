// SQLiteには配列型がないため、JSON文字列で保存した配列項目をパースする
export function parseList(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
