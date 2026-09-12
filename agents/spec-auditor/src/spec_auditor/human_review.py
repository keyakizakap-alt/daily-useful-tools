"""人間が担当する 2 段（対応確認・成立判断）。

図の AFTER で人のアイコンが付いている箇所。ここは自動化しない。
AI は候補を並べるところまでで、担当者・期限の確定と、実現可能性・優先度の
判断は必ず人が通す。``--yes`` でもここはスキップされない
（スキップした場合はレポートが「未確定」のまま出る）。
"""

from __future__ import annotations

from .models import UNCONFIRMED, Judgement, Session
from .security.audit import AuditLog

_JUDGEMENT_CHOICES = {
    "1": Judgement.ACCEPTED.value,
    "2": Judgement.HOLD.value,
    "3": Judgement.REJECTED.value,
}
_PRIORITY_CHOICES = {"1": "高", "2": "中", "3": "低"}


class ReviewAborted(RuntimeError):
    pass


def _resolve(input_fn, print_fn):
    """既定値を呼び出し時に解決する（テストや別UIから差し替えられるように）。"""
    return input_fn or input, print_fn or print


def _ask(prompt: str, *, current: str, input_fn) -> str:
    """Enter で現状維持。'-' で未確認に戻す。"""
    answer = input_fn(f"{prompt} [現在: {current}] > ").strip()
    if not answer:
        return current
    if answer == "-":
        return UNCONFIRMED
    return answer


def review_owners(
    session: Session,
    *,
    input_fn=None,
    print_fn=None,
    audit: AuditLog | None = None,
) -> None:
    """対応確認（人）: 担当者・期限を確定する。

    AI の推測で誤った依頼を出さないための関門。AI は空欄を "未確認" のままにし、
    埋めるのは人。
    """
    input_fn, print_fn = _resolve(input_fn, print_fn)
    print_fn("\n===== 対応確認（人） =====")
    print_fn("担当者・期限を確認します。Enter で現状維持、'-' で未確認に戻す、'q' で中断。\n")

    for index, req in enumerate(session.requirements, start=1):
        marks = "！" if req.unconfirmed_fields else " "
        print_fn(f"[{index}/{len(session.requirements)}]{marks} {req.id}  {req.title}")
        if req.detail:
            print_fn(f"      内容: {req.detail}")
        if req.source_quote:
            print_fn(f"      根拠: 「{req.source_quote}」")
        print_fn(f"      区分: {req.kind} / まとまり: {req.group}")

        owner = _ask("      担当者", current=req.owner, input_fn=input_fn)
        if owner.lower() == "q":
            raise ReviewAborted("対応確認を中断しました。")
        due = _ask("      期限  ", current=req.due, input_fn=input_fn)
        if due.lower() == "q":
            raise ReviewAborted("対応確認を中断しました。")
        note = input_fn("      メモ（任意） > ").strip()

        changed = (owner != req.owner) or (due != req.due)
        req.owner, req.due, req.human_note = owner, due, note
        req.unconfirmed_fields = [
            name for name in ("kind", "owner", "due") if getattr(req, name) == UNCONFIRMED
        ]
        req.human_confirmed = True

        if audit:
            audit.record(
                "human_owner_review",
                session=session.id,
                requirement=req.id,
                owner_set=req.owner != UNCONFIRMED,
                due_set=req.due != UNCONFIRMED,
                changed=changed,
            )
        print_fn("")

    session.owner_review_done = True


def review_judgements(
    session: Session,
    *,
    input_fn=None,
    print_fn=None,
    audit: AuditLog | None = None,
) -> None:
    """成立判断（人）: 指摘の実現可能性・優先度を判断し、採る案を選ぶ。"""
    input_fn, print_fn = _resolve(input_fn, print_fn)
    print_fn("\n===== 成立判断（人） =====")
    print_fn("各指摘について、採用 / 保留 / 却下 を決めます。'q' で中断。\n")

    for index, finding in enumerate(session.findings, start=1):
        print_fn(
            f"[{index}/{len(session.findings)}] {finding.id}  "
            f"[{finding.category}/重要度{finding.severity}] {finding.rule_id}"
        )
        print_fn(f"      指摘: {finding.summary}")
        if finding.rationale:
            print_fn(f"      理由: {finding.rationale}")
        for quote in finding.evidence_quotes:
            print_fn(f"      引用: 「{quote}」")
        for req_id in finding.requirement_ids:
            req = session.requirement(req_id)
            if req:
                print_fn(f"      関連: {req.id} {req.title}（担当 {req.owner} / 期限 {req.due}）")

        options = session.proposals_for(finding.id)
        for opt_index, proposal in enumerate(options, start=1):
            print_fn(f"      候補{opt_index} [{proposal.kind}] {proposal.text}")
            if proposal.tradeoff:
                print_fn(f"             引き換え: {proposal.tradeoff}")

        answer = input_fn("      判断 1=採用 2=保留 3=却下 > ").strip().lower()
        if answer == "q":
            raise ReviewAborted("成立判断を中断しました。")
        finding.judgement = _JUDGEMENT_CHOICES.get(answer, Judgement.HOLD.value)

        if finding.judgement == Judgement.ACCEPTED.value and options:
            picked = input_fn("      採る候補の番号（カンマ区切り / 空欄=なし） > ").strip()
            wanted = {p.strip() for p in picked.split(",") if p.strip()}
            for opt_index, proposal in enumerate(options, start=1):
                proposal.selected = str(opt_index) in wanted

        priority = input_fn("      優先度 1=高 2=中 3=低（空欄=未確認） > ").strip()
        finding.priority = _PRIORITY_CHOICES.get(priority, UNCONFIRMED)
        finding.feasibility_note = input_fn("      実現可能性についてのメモ（任意） > ").strip()

        if audit:
            audit.record(
                "human_judgement",
                session=session.id,
                finding=finding.id,
                rule=finding.rule_id,
                judgement=finding.judgement,
                priority=finding.priority,
                selected=[p.id for p in options if p.selected],
            )
        print_fn("")

    session.judgement_review_done = True
