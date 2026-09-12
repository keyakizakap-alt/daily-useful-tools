"""レポート生成。

LLM の出力も仕様書の本文も、Markdown として解釈されうる文字は
すべてエスケープしてから差し込む（リンク・画像・生 HTML への化けを防ぐ）。
"""

from __future__ import annotations

import datetime as _dt

from .criteria import CriteriaTable
from .models import UNCONFIRMED, Judgement, Session
from .security.validate import escape_markdown as esc

_SEVERITY_ORDER = {"高": 0, "中": 1, "低": 2}


def _status_line(session: Session) -> str:
    if session.owner_review_done and session.judgement_review_done:
        return "**確定**（対応確認・成立判断の両方を人が通過済み）"
    pending = []
    if not session.owner_review_done:
        pending.append("対応確認")
    if not session.judgement_review_done:
        pending.append("成立判断")
    return f"**未確定**（人の{('・'.join(pending))}が未実施。この内容で依頼を出さないでください）"


def render_report(session: Session, table: CriteriaTable | None = None) -> str:
    now = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines: list[str] = []
    add = lines.append

    add("# 仕様書の矛盾・実現不能箇所レポート")
    add("")
    add(f"- 対象文書: {esc(session.source_name)}（SHA-256: `{session.source_sha256[:16]}…`）")
    add(f"- 判定基準表: {esc(session.criteria_name)}（SHA-256: `{session.criteria_sha256[:16]}…`）")
    add(f"- 使用モデル: `{esc(session.model)}`")
    add(f"- 生成日時: {now} / セッション: `{session.id}`")
    add(f"- 状態: {_status_line(session)}")
    add("")
    add(
        "> このレポートは AI が整理した下書きです。担当者・期限の確定と成立判断は人が行っています。"
        f"「{UNCONFIRMED}」は資料に記載が無かった箇所であり、AI の推測では埋めていません。"
    )
    add("")

    # --- サマリ ---
    counts: dict[str, int] = {}
    for finding in session.findings:
        counts[finding.category] = counts.get(finding.category, 0) + 1
    add("## サマリ")
    add("")
    add(f"- 抽出した要件: {len(session.requirements)} 件")
    add(f"- 検出した指摘: {len(session.findings)} 件" + (
        "（" + "、".join(f"{k} {v}" for k, v in sorted(counts.items())) + "）" if counts else ""
    ))
    accepted = sum(1 for f in session.findings if f.judgement == Judgement.ACCEPTED.value)
    hold = sum(1 for f in session.findings if f.judgement == Judgement.HOLD.value)
    rejected = sum(1 for f in session.findings if f.judgement == Judgement.REJECTED.value)
    pending = sum(1 for f in session.findings if f.judgement == Judgement.PENDING.value)
    add(f"- 人の成立判断: 採用 {accepted} / 保留 {hold} / 却下 {rejected} / 未判断 {pending}")
    unresolved = sum(
        1 for r in session.requirements if r.owner == UNCONFIRMED or r.due == UNCONFIRMED
    )
    add(f"- 担当者または期限が未確認のまま残っている要件: {unresolved} 件")
    add(f"- 返すべき質問: {len(session.questions)} 件")
    add("")

    # --- セキュリティ上の注意 ---
    if session.injection_flags or session.redaction_summary:
        add("## 取り扱い上の注意")
        add("")
        if session.redaction_summary:
            masked = "、".join(f"{k} {v} 件" for k, v in sorted(session.redaction_summary.items()))
            add(f"- 外部送信前にマスキングした値: {masked}（原文はローカルにのみ保持）")
        if session.injection_flags:
            add(
                f"- **資料の中に、AI への指示に見えるテキストが {len(session.injection_flags)} 箇所ありました。**"
                " エージェントはこれらを指示として実行していませんが、意図的な混入の可能性があるため確認してください。"
            )
            add("")
            add("  | 行 | 種別 | 抜粋 |")
            add("  |---:|---|---|")
            for flag in session.injection_flags[:20]:
                add(f"  | {flag.line_no} | {esc(flag.pattern)} | {esc(flag.excerpt)} |")
        add("")

    # --- 指摘 ---
    add("## 検出した矛盾・実現不能箇所")
    add("")
    if not session.findings:
        add("判定基準表に該当する指摘はありませんでした。")
        add("")
    else:
        ordered = sorted(
            session.findings,
            key=lambda f: (_SEVERITY_ORDER.get(f.severity, 9), f.category, f.id),
        )
        for finding in ordered:
            add(f"### {esc(finding.summary)}")
            add("")
            add(
                f"- 分類: {esc(finding.category)} / 重要度: {esc(finding.severity)} / "
                f"基準: `{esc(finding.rule_id)}`"
                + (f"（{esc(table.get(finding.rule_id).title)}）" if table and table.get(finding.rule_id) else "")
            )
            add(f"- 人の判断: **{esc(finding.judgement)}** / 優先度: {esc(finding.priority)}")
            if finding.feasibility_note:
                add(f"- 実現可能性メモ: {esc(finding.feasibility_note)}")
            if finding.rationale:
                add(f"- 根拠: {esc(finding.rationale)}")
            for quote in finding.evidence_quotes:
                add(f"  - 引用: 「{esc(quote)}」")
            for req_id in finding.requirement_ids:
                req = session.requirement(req_id)
                if req:
                    add(
                        f"  - 関連要件: `{req.id}` {esc(req.title)}"
                        f"（担当 {esc(req.owner)} / 期限 {esc(req.due)}）"
                    )
            options = session.proposals_for(finding.id)
            if options:
                add("")
                add("  対応案・代替案:")
                for proposal in options:
                    mark = "**採用** " if proposal.selected else ""
                    add(f"  - {mark}[{esc(proposal.kind)}] {esc(proposal.text)}")
                    if proposal.tradeoff:
                        add(f"    - 引き換え: {esc(proposal.tradeoff)}")
            add("")

    # --- 要件一覧 ---
    add("## 要件・タスク一覧")
    add("")
    if not session.requirements:
        add("要件を抽出できませんでした。")
        add("")
    else:
        add("| ID | まとまり | 区分 | 件名 | 担当 | 期限 | 人の確認 |")
        add("|---|---|---|---|---|---|---|")
        for req in session.requirements:
            add(
                f"| `{req.id}` | {esc(req.group)} | {esc(req.kind)} | {esc(req.title)} | "
                f"{esc(req.owner)} | {esc(req.due)} | {'済' if req.human_confirmed else '未'} |"
            )
        add("")

    # --- 質問 ---
    add("## 確認すべき質問")
    add("")
    if not session.questions:
        add("未確認・保留の項目はありません。")
        add("")
    else:
        for index, question in enumerate(session.questions, start=1):
            add(f"{index}. **{esc(question.target)} へ**: {esc(question.text)}")
            if question.why:
                add(f"   - 必要な理由: {esc(question.why)}")
            if question.ref_ids:
                add("   - 関連: " + "、".join(f"`{esc(i)}`" for i in question.ref_ids))
        add("")

    return "\n".join(lines) + "\n"
