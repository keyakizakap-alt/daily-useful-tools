"""ドメインモデル。

パイプライン各段の入出力をここに集約する。すべて JSON へ往復できる
dataclass として定義し、セッションの保存・再開に使う。
"""

from __future__ import annotations

import dataclasses
import datetime as _dt
import enum
import uuid
from typing import Any


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


UNCONFIRMED = "未確認"
"""記載のない情報に入れる値。AI に推測させないための番兵。"""


class Severity(str, enum.Enum):
    HIGH = "高"
    MEDIUM = "中"
    LOW = "低"


class Judgement(str, enum.Enum):
    """成立判断（人）の結果。"""

    ACCEPTED = "採用"
    HOLD = "保留"
    REJECTED = "却下"
    PENDING = "未判断"


@dataclasses.dataclass
class Requirement:
    """仕様書から抽出した一件の要件・タスク。"""

    id: str = dataclasses.field(default_factory=lambda: _new_id("REQ"))
    title: str = ""
    detail: str = ""
    kind: str = UNCONFIRMED          # タスク / 制約 / 前提 / 決定事項
    owner: str = UNCONFIRMED         # 担当候補
    due: str = UNCONFIRMED           # 期限候補
    source_quote: str = ""           # 原文からの引用（根拠）
    depends_on: list[str] = dataclasses.field(default_factory=list)
    group: str = UNCONFIRMED         # 分類段で付与
    unconfirmed_fields: list[str] = dataclasses.field(default_factory=list)
    human_confirmed: bool = False    # 対応確認（人）を通過したか
    human_note: str = ""


@dataclasses.dataclass
class Finding:
    """判定基準表との照合で見つかった矛盾・実現不能箇所。"""

    id: str = dataclasses.field(default_factory=lambda: _new_id("FND"))
    rule_id: str = ""
    category: str = ""
    severity: str = Severity.MEDIUM.value
    summary: str = ""
    rationale: str = ""
    requirement_ids: list[str] = dataclasses.field(default_factory=list)
    evidence_quotes: list[str] = dataclasses.field(default_factory=list)
    judgement: str = Judgement.PENDING.value   # 成立判断（人）
    priority: str = UNCONFIRMED                # 人が付ける優先度
    feasibility_note: str = ""                 # 実現可能性についての人のメモ


@dataclasses.dataclass
class Proposal:
    """検出事項に対する対応案・代替案の候補（AI が出し、人が選ぶ）。"""

    id: str = dataclasses.field(default_factory=lambda: _new_id("PRP"))
    finding_id: str = ""
    kind: str = "対応案"      # 対応案 / 代替案
    text: str = ""
    tradeoff: str = ""
    selected: bool = False


@dataclasses.dataclass
class Question:
    """不明点を仕様の書き手に返すための質問。"""

    id: str = dataclasses.field(default_factory=lambda: _new_id("QST"))
    target: str = UNCONFIRMED     # 誰に聞くか
    text: str = ""
    why: str = ""
    ref_ids: list[str] = dataclasses.field(default_factory=list)


@dataclasses.dataclass
class InjectionFlag:
    """入力文書内で検知した指示様テキスト（プロンプトインジェクション疑い）。"""

    line_no: int
    pattern: str
    excerpt: str


@dataclasses.dataclass
class Session:
    """1 回の監査セッション全体。JSON に保存して再開できる。"""

    id: str = dataclasses.field(default_factory=lambda: _new_id("SES"))
    created_at: str = dataclasses.field(default_factory=_now)
    updated_at: str = dataclasses.field(default_factory=_now)
    source_name: str = ""
    source_sha256: str = ""
    criteria_name: str = ""
    criteria_sha256: str = ""
    model: str = ""
    requirements: list[Requirement] = dataclasses.field(default_factory=list)
    findings: list[Finding] = dataclasses.field(default_factory=list)
    proposals: list[Proposal] = dataclasses.field(default_factory=list)
    questions: list[Question] = dataclasses.field(default_factory=list)
    injection_flags: list[InjectionFlag] = dataclasses.field(default_factory=list)
    redaction_summary: dict[str, int] = dataclasses.field(default_factory=dict)
    stage: str = "created"
    # 人間判断ゲートの通過状況。report が「確定」を名乗れるのはここが両方 True のときだけ。
    owner_review_done: bool = False
    judgement_review_done: bool = False

    # --- シリアライズ -------------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        self.updated_at = _now()
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Session":
        def build(klass, rows):
            fields = {f.name for f in dataclasses.fields(klass)}
            return [klass(**{k: v for k, v in row.items() if k in fields}) for row in rows]

        known = {f.name for f in dataclasses.fields(cls)}
        scalars = {
            k: v
            for k, v in data.items()
            if k in known
            and k
            not in {
                "requirements",
                "findings",
                "proposals",
                "questions",
                "injection_flags",
            }
        }
        return cls(
            **scalars,
            requirements=build(Requirement, data.get("requirements", [])),
            findings=build(Finding, data.get("findings", [])),
            proposals=build(Proposal, data.get("proposals", [])),
            questions=build(Question, data.get("questions", [])),
            injection_flags=build(InjectionFlag, data.get("injection_flags", [])),
        )

    # --- 参照ヘルパ ---------------------------------------------------
    def requirement(self, req_id: str) -> Requirement | None:
        return next((r for r in self.requirements if r.id == req_id), None)

    def finding(self, finding_id: str) -> Finding | None:
        return next((f for f in self.findings if f.id == finding_id), None)

    def proposals_for(self, finding_id: str) -> list[Proposal]:
        return [p for p in self.proposals if p.finding_id == finding_id]
