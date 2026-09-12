"""エージェント本体（AFTER の 7 段をつなぐ）。

  1 要件抽出(AI) → 2 分類(AI) → 3 照合(AI/判定基準表) → 4 候補抽出(AI)
    → 5 対応確認(人) → 6 成立判断(人) → 7 質問作成(AI)

5・6 は人。ここを飛ばすとレポートは「未確定」のまま出る。
"""

from __future__ import annotations

import pathlib

from . import human_review, pipeline, render, store
from .config import Config
from .criteria import CriteriaTable
from .llm.base import ChatClient
from .models import Session
from .security import redaction, sanitize
from .security.audit import AuditLog, sha256_text
from .security.policy import EgressNotice, confirm_egress


class Agent:
    def __init__(
        self,
        *,
        config: Config,
        criteria: CriteriaTable,
        client: ChatClient,
        audit: AuditLog | None = None,
        print_fn=None,
    ) -> None:
        self.config = config
        self.criteria = criteria
        self.client = client
        self.audit = audit
        self.print = print_fn or print

    # --- 準備 ---------------------------------------------------------
    def prepare(self, document: str, source_name: str) -> tuple[Session, str, redaction.RedactionResult]:
        """正規化 → 注入検知 → マスキングまでを行い、送信用テキストを作る。"""
        normalized = sanitize.normalize(document)
        session = Session(
            source_name=source_name,
            source_sha256=sha256_text(document),
            criteria_name=f"{self.criteria.name} ({self.criteria.version})",
            criteria_sha256=self.criteria.sha256,
            model=self.client.model if self.client else "",
        )
        session.injection_flags = sanitize.detect_injection(normalized)

        if self.config.redact:
            masked = redaction.redact(normalized)
        else:
            masked = redaction.RedactionResult(text=normalized, mapping={}, counts={})
        session.redaction_summary = dict(masked.counts)

        if self.audit:
            self.audit.record(
                "session_start",
                session=session.id,
                source=source_name,
                source_sha256=session.source_sha256,
                criteria_sha256=self.criteria.sha256,
                model=self.client.model if self.client else "",
                redaction=self.config.redact,
                masked=session.redaction_summary,
                injection_flags=len(session.injection_flags),
            )
        return session, masked.text, masked

    def confirm_before_send(
        self, session: Session, payload: str, *, assume_yes: bool, input_fn=None
    ) -> None:
        notice = EgressNotice(
            host=self.config.host,
            model=self.client.model if self.client else "",
            source_name=session.source_name,
            chars=len(payload),
            redacted_counts=session.redaction_summary,
            redaction_enabled=self.config.redact,
        )
        confirm_egress(notice, assume_yes=assume_yes, input_fn=input_fn or input)
        if self.audit:
            self.audit.record(
                "egress_approved",
                session=session.id,
                host=self.config.host,
                chars=len(payload),
                mode="auto(--yes)" if assume_yes else "interactive",
            )

    # --- AI 4 段 -------------------------------------------------------
    def run_ai_phase(self, session: Session, payload: str, masked: redaction.RedactionResult) -> None:
        self.print("\n── AI: 要件抽出 ──")
        result = pipeline.extract_requirements(self.client, session, payload)
        self.print(f"   要件 {result.describe()}")

        self.print("── AI: 分類 ──")
        result = pipeline.classify_requirements(self.client, session)
        self.print(f"   分類 {result.describe()}")

        self.print("── AI: 判定基準表との照合 ──")
        result = pipeline.crosscheck(self.client, session, self.criteria)
        self.print(f"   指摘 {result.describe()}")
        for note in result.notes:
            self.print(f"   注記: {note}")

        self.print("── AI: 対応案・代替案の候補抽出 ──")
        result = pipeline.propose_options(self.client, session)
        self.print(f"   候補 {result.describe()}")

        # マスキングした値を、ローカルの対応表で元に戻す。
        if masked.mapping:
            self._restore(session, masked.mapping)

    def _restore(self, session: Session, mapping: dict[str, str]) -> None:
        for req in session.requirements:
            for field in ("title", "detail", "owner", "due", "source_quote"):
                setattr(req, field, redaction.restore_all(getattr(req, field), mapping))
        for finding in session.findings:
            finding.summary = redaction.restore_all(finding.summary, mapping)
            finding.rationale = redaction.restore_all(finding.rationale, mapping)
            finding.evidence_quotes = redaction.restore_all(finding.evidence_quotes, mapping)
        for proposal in session.proposals:
            proposal.text = redaction.restore_all(proposal.text, mapping)
            proposal.tradeoff = redaction.restore_all(proposal.tradeoff, mapping)

    # --- 人間 2 段 -----------------------------------------------------
    def run_human_phase(self, session: Session, *, input_fn=None) -> None:
        human_review.review_owners(session, input_fn=input_fn, print_fn=self.print, audit=self.audit)
        human_review.review_judgements(session, input_fn=input_fn, print_fn=self.print, audit=self.audit)

    # --- 質問作成 ------------------------------------------------------
    def run_questions(self, session: Session) -> None:
        self.print("\n── AI: 質問作成 ──")
        result = pipeline.draft_questions(self.client, session)
        self.print(f"   質問 {result.describe()}")
        for note in result.notes:
            self.print(f"   注記: {note}")

    # --- 出力 ----------------------------------------------------------
    def write_outputs(self, session: Session, out_dir: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
        session_path = store.save_session(session, out_dir / f"{session.id}.json")
        report_path = store.write_text(
            out_dir / f"{session.id}.md", render.render_report(session, self.criteria)
        )
        if self.audit:
            self.audit.record(
                "outputs_written",
                session=session.id,
                report=str(report_path),
                confirmed=session.owner_review_done and session.judgement_review_done,
            )
        return session_path, report_path

