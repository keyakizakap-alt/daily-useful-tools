"""Command-line interface: ``python -m regexlingo PATTERN [options]``."""

import argparse
import json
import re
import sys

from .explain import explain
from .matcher import test_pattern
from .redos import find_risks

_FLAG_LETTERS = {
    "i": re.IGNORECASE,
    "m": re.MULTILINE,
    "s": re.DOTALL,
    "x": re.VERBOSE,
}


def _parse_flags(flag_string):
    flags = 0
    for ch in flag_string or "":
        try:
            flags |= _FLAG_LETTERS[ch]
        except KeyError:
            raise SystemExit(f"error: unknown flag {ch!r} (expected one of: {', '.join(_FLAG_LETTERS)})")
    return flags


def build_parser():
    parser = argparse.ArgumentParser(
        prog="regexlingo",
        description="Explain a regex in plain English, test it against sample strings, "
        "and check it for catastrophic-backtracking risk.",
    )
    parser.add_argument("pattern", help="the regular expression to explain")
    parser.add_argument(
        "--flags",
        default="",
        metavar="LETTERS",
        help="inline flag letters to apply, any combination of i,m,s,x (e.g. --flags im)",
    )
    parser.add_argument(
        "--test",
        dest="tests",
        action="append",
        default=[],
        metavar="STRING",
        help="a sample string to test the pattern against (repeatable)",
    )
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON instead of text")
    return parser


def _format_text(pattern, flag_string, explanation, risks, match_results):
    lines = [f"Pattern: {pattern}"]
    if flag_string:
        lines.append(f"Flags:   {flag_string}")
    lines.append("")
    lines.append("Explanation:")
    lines.extend(f"  {line}" for line in explanation.splitlines())
    lines.append("")
    lines.append("ReDoS check (heuristic, not a guarantee):")
    if risks:
        for risk in risks:
            lines.append(f"  ⚠ [{risk.kind}] near '{risk.fragment}': {risk.message}")
    else:
        lines.append("  no known catastrophic-backtracking shapes found")
    if match_results is not None:
        lines.append("")
        lines.append("Match tests:")
        for result in match_results:
            if result.matched:
                extra = f" groups={result.groups}" if result.groups else ""
                lines.append(f"  {result.string!r} -> MATCH span={result.span}{extra}")
            else:
                lines.append(f"  {result.string!r} -> NO MATCH")
    return "\n".join(lines)


def _format_json(pattern, flag_string, explanation, risks, match_results):
    payload = {
        "pattern": pattern,
        "flags": flag_string,
        "explanation": explanation,
        "redos_risks": [
            {"kind": r.kind, "message": r.message, "fragment": r.fragment} for r in risks
        ],
    }
    if match_results is not None:
        payload["match_tests"] = [
            {
                "string": r.string,
                "matched": r.matched,
                "span": list(r.span) if r.span else None,
                "groups": r.groups,
            }
            for r in match_results
        ]
    return json.dumps(payload, indent=2)


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    flags = _parse_flags(args.flags)

    try:
        explanation = explain(args.pattern, flags)
        risks = find_risks(args.pattern, flags)
        match_results = test_pattern(args.pattern, flags, args.tests) if args.tests else None
    except re.error as exc:
        print(f"error: invalid regular expression: {exc}", file=sys.stderr)
        return 2

    formatter = _format_json if args.json else _format_text
    print(formatter(args.pattern, args.flags, explanation, risks, match_results))
    return 0
