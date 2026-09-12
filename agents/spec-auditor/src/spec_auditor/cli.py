"""コマンドラインインターフェース。

    spec-auditor run <仕様書>        … 7 段を通す（対話）
    spec-auditor review <session>    … 中断した人間判断から再開する
    spec-auditor report <session>    … 保存済みセッションからレポートを出し直す
    spec-auditor verify-audit <log>  … 監査ログの改ざん有無を検証する
    spec-auditor check-criteria      … 判定基準表の記述を検証する
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from . import pipeline, store
from .agent import Agent
from .config import Config, ConfigError, load_config
from .criteria import CriteriaError, load_criteria
from .human_review import ReviewAborted
from .llm.base import LLMError, MockChatClient
from .llm.orcarouter import OrcaRouterClient
from .render import render_report
from .security.audit import AuditLog
from .security.policy import Budget, PolicyError
from .security.validate import ResponseError

DEFAULT_OUT = pathlib.Path("./out")
DEFAULT_AUDIT = DEFAULT_OUT / "audit.jsonl"
MAX_FILE_BYTES = 5 * 1024 * 1024


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="spec-auditor",
        description="仕様書・会議メモから矛盾・実現不能箇所を抽出する（AIが整理、人が判断）",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="仕様書を解析して 7 段を通す")
    run.add_argument("document", type=pathlib.Path, help="仕様書・会議メモ（テキスト/Markdown）")
    run.add_argument("--criteria", type=pathlib.Path, default=None, help="判定基準表 TOML")
    run.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT, help="出力ディレクトリ")
    run.add_argument("--model", default=None, help="モデル ID（例 anthropic/claude-opus-4.7）")
    run.add_argument("--base-url", default=None, help="OpenAI 互換エンドポイント（自己ホスト時）")
    run.add_argument("--yes", action="store_true", help="外部送信の確認を省略（非対話実行用）")
    run.add_argument(
        "--no-redact",
        action="store_true",
        help="秘匿情報のマスキングを無効化する（非推奨・警告を出します）",
    )
    run.add_argument(
        "--skip-human",
        action="store_true",
        help="人間判断を後回しにして AI 段だけ実行する（レポートは未確定のまま出ます）",
    )
    run.add_argument("--max-requests", type=int, default=None, help="LLM 呼び出し回数の上限")
    run.add_argument("--max-chars", type=int, default=None, help="送信文字数の上限")
    run.add_argument("--audit-log", type=pathlib.Path, default=None, help="監査ログの出力先")
    run.add_argument(
        "--mock-responses",
        type=pathlib.Path,
        default=None,
        help="LLM を呼ばず、purpose→応答 の JSON で動かす（動作確認・デモ用）",
    )

    review = sub.add_parser("review", help="保存済みセッションの人間判断を実施／再開する")
    review.add_argument("session", type=pathlib.Path)
    review.add_argument("--criteria", type=pathlib.Path, default=None)
    review.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    review.add_argument("--audit-log", type=pathlib.Path, default=None)
    review.add_argument("--model", default=None)
    review.add_argument("--base-url", default=None)
    review.add_argument("--yes", action="store_true")
    review.add_argument("--mock-responses", type=pathlib.Path, default=None)
    review.add_argument(
        "--no-questions",
        action="store_true",
        help="質問作成（AI）を行わず、人間判断の結果だけを書き出す",
    )

    report = sub.add_parser("report", help="保存済みセッションからレポートを出し直す")
    report.add_argument("session", type=pathlib.Path)
    report.add_argument("--criteria", type=pathlib.Path, default=None)
    report.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)

    verify = sub.add_parser("verify-audit", help="監査ログのハッシュチェーンを検証する")
    verify.add_argument("log", type=pathlib.Path, nargs="?", default=DEFAULT_AUDIT)

    check = sub.add_parser("check-criteria", help="判定基準表を検証して一覧表示する")
    check.add_argument("--criteria", type=pathlib.Path, default=None)

    return parser


def _read_document(path: pathlib.Path) -> str:
    if not path.is_file():
        raise ConfigError(f"仕様書が見つかりません: {path}")
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        raise ConfigError(
            f"ファイルが大きすぎます（{size:,} バイト / 上限 {MAX_FILE_BYTES:,}）。分割してください。"
        )
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise ConfigError(
            f"UTF-8 として読めませんでした: {path}（PDF/Word はテキストに変換してから渡してください）"
        ) from None


def _make_client(args, config: Config, budget: Budget, audit: AuditLog | None, session_id: str):
    mock_path = getattr(args, "mock_responses", None)
    if mock_path:
        data = json.loads(pathlib.Path(mock_path).read_text(encoding="utf-8"))
        return MockChatClient({k: json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
                               for k, v in data.items()}, model=config.model)
    return OrcaRouterClient(config, budget=budget, audit=audit, session_id=session_id)


def _load_config_for(args, *, require_key: bool) -> Config:
    config = load_config(
        model=getattr(args, "model", None),
        base_url=getattr(args, "base_url", None),
        redact=not getattr(args, "no_redact", False),
        require_key=require_key,
    )
    if getattr(args, "no_redact", False):
        print(
            "警告: --no-redact が指定されています。メールアドレス・電話番号・APIキー等が"
            "そのまま外部へ送信されます。",
            file=sys.stderr,
        )
    return config


def cmd_run(args) -> int:
    document = _read_document(args.document)
    table = load_criteria(args.criteria)
    use_mock = args.mock_responses is not None
    config = _load_config_for(args, require_key=not use_mock)

    if len(document) > config.max_input_chars:
        raise PolicyError(
            f"文書が上限 {config.max_input_chars:,} 文字を超えています（{len(document):,} 文字）。"
            "章ごとに分けて実行してください。"
        )

    audit = AuditLog(args.audit_log or (args.out / "audit.jsonl"))
    budget = Budget(
        max_requests=args.max_requests or config.max_requests,
        max_chars=args.max_chars or config.max_egress_chars,
    )

    client = _make_client(args, config, budget, audit, session_id="")
    agent = Agent(config=config, criteria=table, client=client, audit=audit)
    session, payload, masked = agent.prepare(document, args.document.name)
    client.session_id = session.id

    print(f"セッション {session.id} / 判定基準表 {table.name}（{len(table.rules)} 件）")
    if session.injection_flags:
        print(
            f"注意: 資料内に指示らしきテキストを {len(session.injection_flags)} 箇所検知しました。"
            "資料として扱い、実行はしません。レポートに一覧を残します。"
        )

    if not use_mock:
        agent.confirm_before_send(session, payload, assume_yes=args.yes)

    agent.run_ai_phase(session, payload, masked)
    store.save_session(session, args.out / f"{session.id}.json")

    if args.skip_human:
        print("\n人間判断（対応確認・成立判断）は未実施です。")
        print(f"  再開: spec-auditor review {args.out / (session.id + '.json')}")
    else:
        try:
            agent.run_human_phase(session)
        except (ReviewAborted, KeyboardInterrupt):
            store.save_session(session, args.out / f"{session.id}.json")
            print(f"\n中断しました。再開: spec-auditor review {args.out / (session.id + '.json')}")
            return 130
        agent.run_questions(session)

    session_path, report_path = agent.write_outputs(session, args.out)
    print(f"\nレポート: {report_path}")
    print(f"セッション: {session_path}")
    print(f"使用量: {budget.summary()}" if not use_mock else "使用量: モック実行のため送信なし")
    return 0


def cmd_review(args) -> int:
    session = store.load_session(args.session)
    table = load_criteria(args.criteria)
    use_mock = args.mock_responses is not None
    need_llm = not args.no_questions
    config = _load_config_for(args, require_key=need_llm and not use_mock)
    audit = AuditLog(args.audit_log or (args.out / "audit.jsonl"))
    budget = Budget(max_requests=config.max_requests, max_chars=config.max_egress_chars)

    agent = Agent(config=config, criteria=table, client=None, audit=audit)
    try:
        agent.run_human_phase(session)
    except (ReviewAborted, KeyboardInterrupt):
        store.save_session(session, args.session)
        print(f"\n中断しました。進捗は保存済みです: {args.session}")
        return 130

    if need_llm:
        payload = pipeline.build_questions_payload(session)
        if payload is None:
            print("\n未確認・保留の項目が無いため、質問作成は行いません。")
        else:
            agent.client = _make_client(args, config, budget, audit, session_id=session.id)
            if not use_mock:
                # 質問作成で外へ出るのは未確定項目の一覧のみ（仕様書の全文ではない）
                agent.confirm_before_send(session, payload, assume_yes=args.yes)
            agent.run_questions(session)

    store.save_session(session, args.session)
    report_path = store.write_text(
        args.out / f"{session.id}.md", render_report(session, table)
    )
    print(f"\nレポート: {report_path}")
    return 0


def cmd_report(args) -> int:
    session = store.load_session(args.session)
    table = load_criteria(args.criteria)
    path = store.write_text(args.out / f"{session.id}.md", render_report(session, table))
    print(path)
    return 0


def cmd_verify_audit(args) -> int:
    ok, message = AuditLog(args.log).verify_chain()
    print(message)
    return 0 if ok else 1


def cmd_check_criteria(args) -> int:
    table = load_criteria(args.criteria)
    print(f"{table.name}（version {table.version}） / {table.path}")
    print(f"SHA-256: {table.sha256}")
    print(f"rule 件数: {len(table.rules)}\n")
    for rule in table.rules:
        print(f"  {rule.id} [{rule.category}/{rule.severity}] {rule.title}")
    return 0


_COMMANDS = {
    "run": cmd_run,
    "review": cmd_review,
    "report": cmd_report,
    "verify-audit": cmd_verify_audit,
    "check-criteria": cmd_check_criteria,
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return _COMMANDS[args.command](args)
    except (ConfigError, CriteriaError, PolicyError, LLMError, ResponseError, store.StoreError) as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\n中断しました。", file=sys.stderr)
        return 130
