// 資格マスタと演習問題の整合性チェック: node gcp-cert/tools/check-data.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { window: {} };
ctx.window.window = ctx.window;
vm.createContext(ctx);
const load = f => vm.runInContext(readFileSync(f, "utf8").replace(/^window\.GC = window\.GC \|\| \{\};/m, "var GC = window.GC = window.GC || {};"), ctx, { filename: f });
load(join(root, "data/certs.js"));
for (const f of readdirSync(join(root, "data/questions")).sort()) load(join(root, "data/questions", f));
for (const f of readdirSync(join(root, "data/notes")).sort()) load(join(root, "data/notes", f));

const GC = ctx.window.GC;
const errs = [];
const certs = new Map(GC.certs.map(c => [c.id, c]));
if (certs.size !== GC.certs.length) errs.push("資格IDが重複しています");
const phaseIds = GC.phases.flatMap(p => p.ids);
for (const c of GC.certs) {
  if (!phaseIds.includes(c.id)) errs.push(`${c.id}: ロードマップに含まれていません`);
  const ws = c.domains.map(d => d.w);
  if (c.weightSrc && ws.every(w => w != null)) {
    const sum = ws.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 1) errs.push(`${c.id}: 配点の合計が ${sum}%`);
  }
}
for (const id of phaseIds) if (!certs.has(id)) errs.push(`ロードマップに未知の資格 ${id}`);
for (const o of GC.overlaps) if (!certs.has(o.a) || !certs.has(o.b)) errs.push(`重なり表に未知の資格 ${o.a}/${o.b}`);

const seen = new Set();
for (const q of GC.q) {
  const where = q.id || JSON.stringify(q).slice(0, 40);
  if (seen.has(q.id)) errs.push(`${where}: IDが重複`);
  seen.add(q.id);
  const c = certs.get(q.c);
  if (!c) { errs.push(`${where}: 未知の資格 ${q.c}`); continue; }
  if (!q.id.startsWith(q.c + "-")) errs.push(`${where}: IDの接頭辞が資格IDと一致しません`);
  if (!Number.isInteger(q.d) || q.d < 0 || q.d >= c.domains.length) errs.push(`${where}: ドメイン番号 ${q.d} が範囲外`);
  if (!Array.isArray(q.o) || q.o.length < 2 || q.o.length > 6) errs.push(`${where}: 選択肢の数が不正`);
  if (new Set(q.o).size !== q.o.length) errs.push(`${where}: 選択肢が重複`);
  if (!Array.isArray(q.a) || !q.a.length || q.a.some(a => !Number.isInteger(a) || a < 0 || a >= q.o.length)) errs.push(`${where}: 正解インデックスが不正`);
  if (new Set(q.a).size !== q.a.length) errs.push(`${where}: 正解が重複`);
  const multi = q.a.length > 1;
  if (multi !== !!q.m) errs.push(`${where}: 複数選択フラグ m と正解数が一致しません`);
  if (multi && !q.q.includes(`${q.a.length}つ選択`)) errs.push(`${where}: 問題文に「${q.a.length}つ選択」がありません`);
  if (!q.e || q.e.length < 20) errs.push(`${where}: 解説が短すぎます`);
}
const per = {};
for (const c of GC.certs) {
  const qs = GC.q.filter(q => q.c === c.id);
  per[c.id] = qs.length;
  if (qs.length < 10) errs.push(`${c.id}: 問題が ${qs.length} 問しかありません`);
  c.domains.forEach((_, i) => { if (!qs.some(q => q.d === i)) errs.push(`${c.id}: ドメイン${i + 1}の問題がありません`); });
}
const noteIds = new Set();
const CATS = ["basic", "advanced", "frequent"];
for (const n of GC.notes || []) {
  const where = n.id || n.t;
  if (noteIds.has(n.id) || seen.has(n.id)) errs.push(`${where}: ノートIDが重複`);
  noteIds.add(n.id);
  if (!CATS.includes(n.cat)) errs.push(`${where}: カテゴリ ${n.cat} が不正`);
  if (!n.t || !n.s) errs.push(`${where}: タイトルか要約がありません`);
  if (!n.b && !n.tbl && !n.pairs) errs.push(`${where}: 本文（b / tbl / pairs）がありません`);
  if (n.c !== "common") {
    const c = certs.get(n.c);
    if (!c) { errs.push(`${where}: 未知の資格 ${n.c}`); continue; }
    if (n.d != null && (!Number.isInteger(n.d) || n.d < 0 || n.d >= c.domains.length)) errs.push(`${where}: ドメイン番号 ${n.d} が範囲外`);
  } else if (!Array.isArray(n.rel) || !n.rel.length || n.rel.some(r => !certs.has(r))) errs.push(`${where}: 共通ノートの rel が不正`);
  if (n.tbl && (!n.tbl.h || n.tbl.r.some(r => r.length !== n.tbl.h.length))) errs.push(`${where}: 表の列数が見出しと一致しません`);
  if (n.pairs && n.pairs.some(p => p.length !== 2 || !p[0] || !p[1])) errs.push(`${where}: pairs の形式が不正`);
}
for (const c of GC.certs) {
  const own = (GC.notes || []).filter(n => n.c === c.id);
  for (const cat of CATS) if (!own.some(n => n.cat === cat) && !(GC.notes || []).some(n => n.c === "common" && n.cat === cat && n.rel.includes(c.id)))
    errs.push(`${c.id}: カテゴリ ${cat} のノートがありません`);
}
console.log(`資格 ${GC.certs.length} 種 / 問題 ${GC.q.length} 問 / ノート ${(GC.notes || []).length} 件（ペア ${(GC.notes || []).reduce((a, n) => a + (n.pairs || []).length, 0)}）`);
console.log(Object.entries(per).map(([k, v]) => `${k}:${v}`).join(" "));
if (errs.length) { console.error(errs.map(e => "✗ " + e).join("\n")); process.exit(1); }
console.log("OK");
