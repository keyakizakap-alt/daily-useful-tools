"""判定基準表のローダ。

照合段はこの表に載っている rule_id でしか指摘を出せない。表に無い理由で
LLM が何か言ってきた場合は捨てる（後段の検証で弾く）。
"""

from __future__ import annotations

import dataclasses
import hashlib
import pathlib
import tomllib

DEFAULT_PATH = pathlib.Path(__file__).resolve().parent / "data" / "default_criteria.toml"


class CriteriaError(ValueError):
    pass


@dataclasses.dataclass(frozen=True)
class Rule:
    id: str
    category: str
    title: str
    description: str
    severity: str
    check_hint: str = ""


@dataclasses.dataclass(frozen=True)
class CriteriaTable:
    name: str
    version: str
    rules: tuple[Rule, ...]
    sha256: str
    path: pathlib.Path

    def get(self, rule_id: str) -> Rule | None:
        return next((r for r in self.rules if r.id == rule_id), None)

    @property
    def rule_ids(self) -> set[str]:
        return {r.id for r in self.rules}

    def as_prompt_block(self) -> str:
        """LLM に渡す表形式のテキスト。"""
        lines = []
        for r in self.rules:
            lines.append(
                f"- {r.id} [{r.category}/重要度{r.severity}] {r.title}\n"
                f"    定義: {r.description}\n"
                f"    見方: {r.check_hint or '（指定なし）'}"
            )
        return "\n".join(lines)


_ALLOWED_SEVERITY = {"高", "中", "低"}


def load_criteria(path: pathlib.Path | str | None = None) -> CriteriaTable:
    target = pathlib.Path(path) if path else DEFAULT_PATH
    if not target.is_file():
        raise CriteriaError(f"判定基準表が見つかりません: {target}")

    raw = target.read_bytes()
    data = tomllib.loads(raw.decode("utf-8"))

    meta = data.get("meta", {})
    rows = data.get("rule", [])
    if not rows:
        raise CriteriaError(f"判定基準表に rule が 1 件もありません: {target}")

    rules: list[Rule] = []
    seen: set[str] = set()
    for i, row in enumerate(rows, start=1):
        missing = [k for k in ("id", "category", "title", "description", "severity") if not row.get(k)]
        if missing:
            raise CriteriaError(f"{target}: {i} 件目の rule に必須項目がありません: {', '.join(missing)}")
        if row["id"] in seen:
            raise CriteriaError(f"{target}: rule id が重複しています: {row['id']}")
        if row["severity"] not in _ALLOWED_SEVERITY:
            raise CriteriaError(
                f"{target}: {row['id']} の severity は 高/中/低 のいずれかにしてください: {row['severity']!r}"
            )
        seen.add(row["id"])
        rules.append(
            Rule(
                id=str(row["id"]),
                category=str(row["category"]),
                title=str(row["title"]),
                description=str(row["description"]),
                severity=str(row["severity"]),
                check_hint=str(row.get("check_hint", "")),
            )
        )

    return CriteriaTable(
        name=str(meta.get("name", target.stem)),
        version=str(meta.get("version", "")),
        rules=tuple(rules),
        sha256=hashlib.sha256(raw).hexdigest(),
        path=target,
    )
