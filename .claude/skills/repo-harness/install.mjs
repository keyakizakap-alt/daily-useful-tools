#!/usr/bin/env node
// repo-harness インストーラー: 対象リポジトリに「最小テスト・直し方つき失敗メッセージ・仕様書の完了条件」を入れる。
// 既存ファイルは上書きしない（追記は目印つきで1回だけ）。既定はドライラン、--apply で書き込む。依存パッケージなし。
//
//   node install.mjs <repo-path>                  # 何が入るかを表示するだけ
//   node install.mjs <repo-path> --apply          # 書き込み + 動作確認
//   node install.mjs <repo-path> --flavor python  # 判定を上書き（node | python）
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(KIT_DIR, "templates");
const MARKER = "repo-harness:start";
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  "output",
  "vendor",
]);

function parseArgs(argv) {
  const args = { repo: null, apply: false, flavor: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--flavor") args.flavor = argv[++i];
    else if (!args.repo) args.repo = argv[i];
  }
  if (!args.repo) {
    console.error(
      "使い方: node install.mjs <repo-path> [--apply] [--flavor node|python]",
    );
    process.exit(2);
  }
  if (args.flavor && !["node", "python"].includes(args.flavor)) {
    console.error(
      `--flavor は node か python を指定してください（指定値: ${args.flavor}）`,
    );
    process.exit(2);
  }
  return args;
}

/** リポジトリ内の拡張子を浅く集計する（node_modules などは見ない） */
function collectExtensions(root, depth = 4) {
  const found = new Set();
  const walk = (dir, level) => {
    if (level > depth) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name))
          walk(join(dir, entry.name), level + 1);
      } else {
        if (entry.name === "package.json") found.add("package.json");
        const dot = entry.name.lastIndexOf(".");
        if (dot > 0) found.add(entry.name.slice(dot));
      }
    }
  };
  walk(root, 0);
  return found;
}

function detectFlavor(root) {
  if (existsSync(join(root, "package.json"))) return "node";
  const exts = collectExtensions(root);
  const hasJs = ["package.json", ".js", ".mjs", ".ts", ".tsx"].some((e) =>
    exts.has(e),
  );
  return !hasJs && exts.has(".py") ? "python" : "node";
}

function readTemplate(rel, vars) {
  return readFileSync(join(TEMPLATES, rel), "utf8").replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key],
  );
}

/** 既存 package.json の書式（1行 / インデント幅）を保って書き戻す */
function stringifyLike(original, data) {
  const trailing = original.endsWith("\n") ? "\n" : "";
  if (!original.trim().includes("\n")) return JSON.stringify(data) + trailing;
  const indent = /\n([ \t]+)"/.exec(original)?.[1] ?? "  ";
  return JSON.stringify(data, null, indent) + trailing;
}

function planNode(root) {
  const pkgPath = join(root, "package.json");
  const pkgExists = existsSync(pkgPath);
  const pkgText = pkgExists ? readFileSync(pkgPath, "utf8") : null;
  const pkg = pkgExists
    ? JSON.parse(pkgText)
    : { name: basename(root), private: true, scripts: {} };
  const scripts = { ...(pkg.scripts ?? {}) };
  const added = {};

  // 既存の test スクリプトが拾うファイル名に合わせ、既存スクリプトは書き換えない
  let testFile = "tests/harness.test.mjs";
  let runHarness = `node --test ${testFile}`;
  let testCmd = "npm test";
  if (!scripts.test) {
    added.test = "node --test tests/*.test.mjs";
  } else if (/tests\/\*\.test\.mjs/.test(scripts.test)) {
    // そのまま拾われる
  } else if (
    /tests\/\*\.test\.ts/.test(scripts.test) &&
    /strip-types|tsx/.test(scripts.test)
  ) {
    testFile = "tests/harness.test.ts";
    runHarness = `node --experimental-strip-types --test ${testFile}`;
  } else {
    added["test:harness"] = runHarness;
    testCmd = "npm test && npm run test:harness";
  }
  if (!scripts["lint:specs"])
    added["lint:specs"] = "node scripts/harness/check-specs.mjs";

  const actions = [];
  if (Object.keys(added).length > 0) {
    const next = { ...pkg, scripts: { ...scripts, ...added } };
    actions.push({
      kind: pkgExists ? "edit" : "create",
      path: "package.json",
      note: `scripts に追加: ${Object.keys(added).join(", ")}`,
      content: pkgExists
        ? stringifyLike(pkgText, next)
        : JSON.stringify(next, null, 2) + "\n",
    });
  }
  const vars = { TEST_CMD: testCmd, LINT_CMD: "npm run lint:specs" };
  const harnessTest = readTemplate("node/harness.test.mjs", vars);
  actions.push(
    {
      kind: "create",
      path: "scripts/harness/check-specs.mjs",
      content: readTemplate("node/check-specs.mjs", vars),
    },
    { kind: "create", path: testFile, content: harnessTest },
  );
  return {
    vars,
    actions,
    testFile,
    createdPackageJson: !pkgExists,
    verify: [runHarness, "node scripts/harness/check-specs.mjs"],
  };
}

function planPython() {
  const testFile = "tests/test_harness.py";
  const vars = {
    TEST_CMD: "python3 -m unittest discover -s tests -v",
    LINT_CMD: "python3 scripts/harness/check_specs.py",
  };
  return {
    vars,
    actions: [
      {
        kind: "create",
        path: "scripts/harness/check_specs.py",
        content: readTemplate("python/check_specs.py", vars),
      },
      {
        kind: "create",
        path: testFile,
        content: readTemplate("python/test_harness.py", vars),
      },
      {
        kind: "append-lines",
        path: ".gitignore",
        lines: ["__pycache__/"],
        header: "# Python のキャッシュ",
      },
    ],
    testFile,
    createdPackageJson: false,
    verify: [
      "python3 -m unittest discover -s tests -p test_harness.py",
      "python3 scripts/harness/check_specs.py",
    ],
  };
}

function plan(root, flavor) {
  const base = flavor === "python" ? planPython() : planNode(root);
  const { vars } = base;
  const actions = [
    ...["README.md", "_TEMPLATE.md", "harness.md"].map((name) => ({
      kind: "create",
      path: `docs/specs/${name}`,
      content: readTemplate(`docs/specs/${name}`, vars),
    })),
    ...base.actions,
  ];

  // エージェント向けの指示: 既にある指示ファイルへ追記。どちらも無ければ CLAUDE.md を作る。
  // （CLAUDE.md が無いリポジトリでは Claude Code が AGENTS.md を読むため、AGENTS.md だけのリポジトリに CLAUDE.md は作らない）
  const section = readTemplate("agent-section.md", vars);
  const agentFiles = ["CLAUDE.md", "AGENTS.md"].filter((name) =>
    existsSync(join(root, name)),
  );
  if (agentFiles.length === 0)
    actions.push({
      kind: "create",
      path: "CLAUDE.md",
      content: `# プロジェクト方針\n\n${section}`,
    });
  for (const name of agentFiles)
    actions.push({ kind: "append-section", path: name, content: section });

  // Vercel で配信しているリポジトリでは、開発用ファイルを配信対象から外す
  if (existsSync(join(root, ".vercelignore"))) {
    const lines = ["/docs/specs", "/scripts/harness", `/${base.testFile}`];
    if (base.createdPackageJson) lines.push("/package.json");
    actions.push({
      kind: "append-lines",
      path: ".vercelignore",
      lines,
      header: "# repo-harness（開発用。配信しない）",
    });
  }
  return { ...base, actions };
}

/** 各アクションを実行可能か判定し、{status, detail} を付ける（ここではまだ書かない） */
function resolveActions(root, actions) {
  return actions.map((action) => {
    const target = join(root, action.path);
    const exists = existsSync(target);
    const current = exists ? readFileSync(target, "utf8") : "";
    switch (action.kind) {
      case "create":
        return {
          ...action,
          status: exists ? "skip" : "add",
          detail: exists ? "既存のためそのまま" : "新規作成",
        };
      case "edit":
        return { ...action, status: "edit", detail: action.note };
      case "append-section":
        return current.includes(MARKER)
          ? { ...action, status: "skip", detail: "追記済みのためそのまま" }
          : {
              ...action,
              status: "append",
              detail: "末尾に開発ハーネスの節を追記",
            };
      case "append-lines": {
        const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
        const missing = action.lines.filter((l) => !have.has(l));
        if (missing.length === 0)
          return {
            ...action,
            status: "skip",
            detail: "記載済みのためそのまま",
          };
        return {
          ...action,
          lines: missing,
          status: exists ? "append" : "add",
          detail: `追加: ${missing.join(" ")}`,
        };
      }
      default:
        throw new Error(`unknown action: ${action.kind}`);
    }
  });
}

function write(root, action) {
  const target = join(root, action.path);
  mkdirSync(dirname(target), { recursive: true });
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  const sep =
    current === ""
      ? ""
      : current.endsWith("\n\n")
        ? ""
        : current.endsWith("\n")
          ? "\n"
          : "\n\n";
  if (action.kind === "create" || action.kind === "edit")
    writeFileSync(target, action.content);
  else if (action.kind === "append-section")
    appendFileSync(target, sep + action.content);
  else if (action.kind === "append-lines")
    appendFileSync(
      target,
      `${sep}${action.header}\n${action.lines.join("\n")}\n`,
    );
}

const LABEL = { add: "追加", edit: "変更", append: "追記", skip: "スキップ" };

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.repo);
  if (!existsSync(root)) {
    console.error(`リポジトリが見つかりません: ${root}`);
    process.exit(2);
  }
  const flavor = args.flavor ?? detectFlavor(root);
  const result = plan(root, flavor);
  const actions = resolveActions(root, result.actions);

  console.log(
    `repo-harness: ${root}（${flavor}）${args.apply ? "" : " ※ドライラン。--apply で書き込みます"}`,
  );
  for (const a of actions)
    console.log(`  [${LABEL[a.status]}] ${a.path} — ${a.detail}`);
  console.log(`  テスト: ${result.vars.TEST_CMD}`);
  console.log(`  仕様書チェック: ${result.vars.LINT_CMD}`);
  if (!args.apply) return;

  for (const a of actions) if (a.status !== "skip") write(root, a);

  let failed = false;
  for (const cmd of result.verify) {
    const run = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8" });
    const ok = run.status === 0;
    failed ||= !ok;
    console.log(
      `  [確認] ${cmd} → 終了コード ${run.status}${ok ? "" : "\n" + (run.stdout + run.stderr).trim()}`,
    );
  }
  if (failed) {
    console.error(
      "動作確認に失敗しました。上の出力の「直し方」を確認してください。",
    );
    process.exit(1);
  }
}

main();
