#!/usr/bin/env python3
"""仕様書（docs/specs/*.md）の「完了条件」が、誰が判定しても同じ結果になる形で書かれているかを検査する。

問題があれば「どこが・何が・どう直すか」を出力し、終了コード1で終わる。標準ライブラリのみ。
配布元: daily-useful-tools/.claude/skills/repo-harness（node 版 check-specs.mjs と同じ規則）
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SPEC_DIR = "docs/specs"
SKIP_FILES = {"README.md", "_TEMPLATE.md"}
DONE_HEADING = re.compile(r"^##\s*完了条件")
ANY_HEADING = re.compile(r"^#{1,2}\s")
CHECKBOX = re.compile(r"^\s*[-*]\s+\[[ xX]\]\s+(.*)$")
CODE_SPAN = re.compile(r"`[^`]+`")
# 判定する人によって結果が変わる言葉。完了条件には使わない。
VAGUE_WORDS = ["適切", "十分", "なるべく", "いい感じ", "ちゃんと", "しっかり", "問題なく", "正しく", "きれいに", "スムーズ"]
GOOD_EXAMPLE = "- [ ] `python3 -m unittest discover -s tests` が終了コード0で終わる / - [ ] `output/report.pdf` が生成される"


def check_specs(root_dir: Path) -> list[dict]:
    spec_dir = Path(root_dir) / SPEC_DIR
    if not spec_dir.is_dir():
        return [{
            "file": SPEC_DIR,
            "line": 0,
            "problem": "仕様書フォルダがない",
            "fix": f"`{SPEC_DIR}/` を作り、機能ごとの仕様書を置く（repo-harness の install.mjs を --apply で再実行すると雛形が入る）",
        }]
    problems: list[dict] = []
    for path in sorted(spec_dir.glob("*.md")):
        if path.name in SKIP_FILES:
            continue
        problems.extend(check_spec_file(f"{SPEC_DIR}/{path.name}", path.read_text(encoding="utf-8")))
    return problems


def check_spec_file(file: str, text: str) -> list[dict]:
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if DONE_HEADING.match(line)), -1)
    if start == -1:
        return [{
            "file": file,
            "line": 0,
            "problem": "「## 完了条件」の見出しがない",
            "fix": f"末尾に「## 完了条件」を追加し、判定方法つきのチェックボックスを1つ以上書く。例: {GOOD_EXAMPLE}",
        }]
    problems: list[dict] = []
    items = 0
    for i in range(start + 1, len(lines)):
        if ANY_HEADING.match(lines[i]):
            break
        match = CHECKBOX.match(lines[i])
        if not match:
            continue
        items += 1
        body = match.group(1).strip()
        if not CODE_SPAN.search(body):
            problems.append({
                "file": file,
                "line": i + 1,
                "problem": f"完了条件「{body}」に判定方法（コマンドやファイルパス）がない",
                "fix": f"判定に使うコマンドか生成物のパスをバッククォートで囲んで書く。例: {GOOD_EXAMPLE}",
            })
        prose = re.sub(r"`[^`]*`", "", body)
        vague = [word for word in VAGUE_WORDS if word in prose]
        if vague:
            problems.append({
                "file": file,
                "line": i + 1,
                "problem": f"完了条件「{body}」に主観的な言葉（{'、'.join(vague)}）がある",
                "fix": "数値・終了コード・ファイルの有無・出力に含まれる文字列など、誰が見ても同じ結果になる基準に置き換える",
            })
    if items == 0:
        problems.append({
            "file": file,
            "line": start + 1,
            "problem": "「## 完了条件」にチェックボックスの項目がない",
            "fix": f"「- [ ] 」で始まる項目を1つ以上書く。例: {GOOD_EXAMPLE}",
        })
    return problems


def format_problems(problems: list[dict]) -> str:
    if not problems:
        return "仕様書チェック: 問題なし"
    blocks = []
    for p in problems:
        where = f"{p['file']}:{p['line']}" if p["line"] > 0 else p["file"]
        blocks.append(f"✖ {where}\n  問題: {p['problem']}\n  直し方: {p['fix']}")
    return "\n".join([
        *blocks,
        "",
        f"仕様書チェック: {len(problems)}件の問題があります。各「直し方」を適用してから `python3 scripts/harness/check_specs.py` を再実行してください。",
        f"書き方の詳細: {SPEC_DIR}/README.md",
    ])


if __name__ == "__main__":
    found = check_specs(Path(__file__).resolve().parents[2])
    output = format_problems(found)
    if found:
        print(output, file=sys.stderr)
        sys.exit(1)
    print(output)
