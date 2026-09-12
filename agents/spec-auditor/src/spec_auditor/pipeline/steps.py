"""AI が担当する 5 段（要件抽出・分類・照合・候補抽出・質問作成）。

いずれの関数も「LLM に投げる → 応答を厳格に検証 → セッションを更新」だけを行う。
検証を通らなかった要素は黙って捨て、捨てた件数を戻り値で返す（握り潰さない）。
"""

from __future__ import annotations

import dataclasses
import json

from ..criteria import CriteriaTable
from ..llm.base import ChatClient
from ..models import (
    UNCONFIRMED,
    Finding,
    Judgement,
    Proposal,
    Question,
    Requirement,
    Session,
)
from ..security import sanitize, validate
from . import prompts

_KINDS = {"タスク", "制約", "前提", "決定事項"}
_PROPOSAL_KINDS = {"対応案", "代替案"}


@dataclasses.dataclass
class StepResult:
    added: int = 0
    dropped: int = 0
    notes: list[str] = dataclasses.field(default_factory=list)

    def describe(self) -> str:
        text = f"{self.added} 件"
        if self.dropped:
            text += f"（検証で除外 {self.dropped} 件）"
        return text


def _requirements_block(session: Session) -> str:
    rows = [
        {
            "id": r.id,
            "title": r.title,
            "detail": r.detail,
            "kind": r.kind,
            "owner": r.owner,
            "due": r.due,
            "group": r.group,
            "depends_on": r.depends_on,
        }
        for r in session.requirements
    ]
    return json.dumps(rows, ensure_ascii=False, indent=1)


# --- 1. 要件抽出 --------------------------------------------------------
def extract_requirements(client: ChatClient, session: Session, document: str) -> StepResult:
    user = (
        "次の資料から要件を抽出してください。\n\n"
        + sanitize.wrap_untrusted(document, label="仕様書・会議メモ")
    )
    payload = validate.parse_json_object(
        client.complete_json(system=prompts.EXTRACT_SYSTEM, user=user, purpose="extract")
    )
    rows = validate.require_list(payload, "requirements")

    result = StepResult()
    for row in rows:
        title = validate.clean_str(row.get("title"), limit=200)
        if not title:
            result.dropped += 1
            continue
        req = Requirement(
            title=title,
            detail=validate.clean_str(row.get("detail"), limit=1_500),
            kind=validate.clean_enum(row.get("kind"), _KINDS, default=UNCONFIRMED),
            owner=validate.clean_str(row.get("owner"), default=UNCONFIRMED, limit=120),
            due=validate.clean_str(row.get("due"), default=UNCONFIRMED, limit=120),
            source_quote=validate.clean_str(row.get("source_quote"), limit=400),
            depends_on=validate.clean_str_list(row.get("depends_on"), limit=10),
        )
        req.unconfirmed_fields = [
            name for name in ("kind", "owner", "due") if getattr(req, name) == UNCONFIRMED
        ]
        session.requirements.append(req)
        result.added += 1

    session.stage = "extracted"
    return result


# --- 2. 分類 ------------------------------------------------------------
def classify_requirements(client: ChatClient, session: Session) -> StepResult:
    if not session.requirements:
        return StepResult(notes=["要件が 0 件のため分類をスキップしました。"])

    user = "次の要件一覧に group を付けてください。\n\n" + _requirements_block(session)
    payload = validate.parse_json_object(
        client.complete_json(system=prompts.CLASSIFY_SYSTEM, user=user, purpose="classify")
    )
    rows = validate.require_list(payload, "groups")

    result = StepResult()
    for row in rows:
        req = session.requirement(validate.clean_str(row.get("id"), limit=64))
        if req is None:
            # 存在しない id を返してきた場合は捨てる（幻の要件を作らない）。
            result.dropped += 1
            continue
        req.group = validate.clean_str(row.get("group"), default=UNCONFIRMED, limit=120)
        result.added += 1

    session.stage = "classified"
    return result


# --- 3. 照合（判定基準表） ----------------------------------------------
def crosscheck(client: ChatClient, session: Session, table: CriteriaTable) -> StepResult:
    if not session.requirements:
        return StepResult(notes=["要件が 0 件のため照合をスキップしました。"])

    user = (
        "【判定基準表】\n"
        + table.as_prompt_block()
        + "\n\n【要件一覧】\n"
        + _requirements_block(session)
        + "\n\n判定基準表の rule_id に該当する指摘だけを挙げてください。"
    )
    payload = validate.parse_json_object(
        client.complete_json(system=prompts.CROSSCHECK_SYSTEM, user=user, purpose="crosscheck")
    )
    rows = validate.require_list(payload, "findings")

    known_ids = {r.id for r in session.requirements}
    result = StepResult()
    for row in rows:
        rule = table.get(validate.clean_str(row.get("rule_id"), limit=32))
        if rule is None:
            # 判定基準表に無い理由での指摘は採用しない。
            result.dropped += 1
            continue
        summary = validate.clean_str(row.get("summary"), limit=400)
        refs = [rid for rid in validate.clean_str_list(row.get("requirement_ids"), limit=20) if rid in known_ids]
        if not summary or not refs:
            result.dropped += 1
            continue
        session.findings.append(
            Finding(
                rule_id=rule.id,
                category=rule.category,
                severity=rule.severity,
                summary=summary,
                rationale=validate.clean_str(row.get("rationale"), limit=1_200),
                requirement_ids=refs,
                evidence_quotes=validate.clean_str_list(row.get("evidence_quotes"), limit=10),
            )
        )
        result.added += 1

    if result.dropped:
        result.notes.append(
            f"判定基準表に無い rule_id・根拠不明の指摘を {result.dropped} 件除外しました。"
        )
    session.stage = "crosschecked"
    return result


# --- 4. 候補抽出 --------------------------------------------------------
def propose_options(client: ChatClient, session: Session) -> StepResult:
    if not session.findings:
        return StepResult(notes=["指摘が 0 件のため候補抽出をスキップしました。"])

    findings_block = json.dumps(
        [
            {
                "finding_id": f.id,
                "rule": f.rule_id,
                "category": f.category,
                "summary": f.summary,
                "rationale": f.rationale,
                "requirements": [
                    {"id": r.id, "title": r.title, "owner": r.owner, "due": r.due}
                    for r in (session.requirement(i) for i in f.requirement_ids)
                    if r
                ],
            }
            for f in session.findings
        ],
        ensure_ascii=False,
        indent=1,
    )
    user = "【指摘一覧】\n" + findings_block + "\n\n各指摘への対応案・代替案の候補を出してください。"
    payload = validate.parse_json_object(
        client.complete_json(system=prompts.PROPOSE_SYSTEM, user=user, purpose="propose")
    )
    rows = validate.require_list(payload, "proposals")

    known = {f.id for f in session.findings}
    result = StepResult()
    for row in rows:
        finding_id = validate.clean_str(row.get("finding_id"), limit=64)
        text = validate.clean_str(row.get("text"), limit=1_200)
        if finding_id not in known or not text:
            result.dropped += 1
            continue
        session.proposals.append(
            Proposal(
                finding_id=finding_id,
                kind=validate.clean_enum(row.get("kind"), _PROPOSAL_KINDS, default="対応案"),
                text=text,
                tradeoff=validate.clean_str(row.get("tradeoff"), limit=800),
            )
        )
        result.added += 1

    session.stage = "proposed"
    return result


# --- 7. 質問作成 --------------------------------------------------------
def build_questions_payload(session: Session) -> str | None:
    """質問作成で送る本文を組み立てる。未確定・保留が無ければ None。

    送信前の確認画面で実際の送信内容と量を示すため、生成と送信を分けてある。
    """
    open_reqs = [
        r
        for r in session.requirements
        if (r.owner == UNCONFIRMED or r.due == UNCONFIRMED or not r.human_confirmed)
    ]
    open_findings = [
        f
        for f in session.findings
        if f.judgement in {Judgement.PENDING.value, Judgement.HOLD.value}
    ]
    if not open_reqs and not open_findings:
        return None

    block = json.dumps(
        {
            "未確定の要件": [
                {
                    "id": r.id,
                    "title": r.title,
                    "owner": r.owner,
                    "due": r.due,
                    "人の確認済み": r.human_confirmed,
                    "人のメモ": r.human_note,
                }
                for r in open_reqs
            ],
            "保留中の指摘": [
                {
                    "id": f.id,
                    "summary": f.summary,
                    "判断": f.judgement,
                    "人のメモ": f.feasibility_note,
                }
                for f in open_findings
            ],
        },
        ensure_ascii=False,
        indent=1,
    )
    return "【未確定・保留の一覧】\n" + block + "\n\nこれらを埋めるための質問を作ってください。"


def draft_questions(client: ChatClient, session: Session) -> StepResult:
    """人が「未確認」「保留」のまま残した点だけを質問にする。

    人間判断ゲートより後ろに置くのは、既に人が確定させた項目まで
    質問してしまうと、相手に無駄な確認を投げることになるため。
    """
    user = build_questions_payload(session)
    if user is None:
        session.stage = "completed"
        return StepResult(notes=["未確認・保留の項目が無いため質問はありません。"])

    payload = validate.parse_json_object(
        client.complete_json(system=prompts.QUESTIONS_SYSTEM, user=user, purpose="questions")
    )
    rows = validate.require_list(payload, "questions")

    known = {r.id for r in session.requirements} | {f.id for f in session.findings}
    result = StepResult()
    for row in rows:
        text = validate.clean_str(row.get("text"), limit=800)
        if not text:
            result.dropped += 1
            continue
        session.questions.append(
            Question(
                target=validate.clean_str(row.get("target"), default=UNCONFIRMED, limit=120),
                text=text,
                why=validate.clean_str(row.get("why"), limit=600),
                ref_ids=[i for i in validate.clean_str_list(row.get("ref_ids"), limit=20) if i in known],
            )
        )
        result.added += 1

    session.stage = "completed"
    return result
