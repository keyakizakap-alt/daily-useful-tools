# Feedback — Round 2 (after round-1 fixes)

## Follow-up finding

While re-reading round 1's fixes, noticed the multiline-anchor test
(`test_multiline_flag_mentioned_in_anchor`) only checked that the string
`"MULTILINE"` appeared in the output — but the anchor explanation text was
*static*, always containing that word regardless of whether `re.MULTILINE`
was actually passed in. The test was accidentally tautological: it would
have passed even if the explainer ignored flags completely (which, in
fact, it did — `Explainer` never received the parsed flags at all).

Also affected `.`'s explanation: it always said "(except newline, unless
DOTALL is set)" instead of stating which case actually applied.

## Fix

- `Explainer` now takes the pattern's *effective* flags (`parsed.state.flags`,
  which already merges CLI `--flags` with any inline `(?im)`-style flags —
  no extra plumbing needed) and uses them to pick between "start of the
  string" / "start of a line (MULTILINE is set)", and between "except
  newline" / "including newline (DOTALL is set)".
- Strengthened the test: added `test_multiline_flag_not_mentioned_when_absent`
  (asserts the word is *absent* without the flag), `test_inline_multiline_flag_is_detected`
  (covers the `(?m)...` inline-flag path, not just the CLI `--flags` path),
  and `test_dotall_flag_changes_any_explanation`.
- Verified via the CLI directly: `^abc$` alone says "start of the string";
  `^abc$ --flags m` says "start of a line (MULTILINE is set)"; `. --flags s`
  says "including newline (DOTALL is set)".

## Final state

- 64 tests, all passing (`python3 -m pytest -q` from the project root, with
  `conftest.py` putting `src/` on the path for both in-process imports and
  the subprocess-driven CLI tests).
- Manually exercised: literals, character classes (positive/negative/mixed
  ranges), shorthand classes, alternation, capturing/named/non-capturing
  groups, all quantifier shapes (greedy, lazy, exact, range, unbounded),
  anchors under both flag states, word boundaries, backreferences,
  lookaround (all four variants), conditional group references, inline
  flags, `--test`, `--json`, and the invalid-pattern error path.
- No open bugs. Documented (not "fixed", since it's inherent to a
  heuristic) limitation: the ReDoS checker can have false negatives on
  ambiguity patterns spread across 3+ nested groups — this is called out
  explicitly in the CLI output ("heuristic, not a guarantee") and in the
  design doc, rather than silently implying certainty.

This closes out the MVP for today's iteration budget. Natural next steps
for a future session, not pursued now to keep this MVP-scoped: a
`--explain-only`/`--redos-only` flag to suppress sections, and surfacing
group *names* (not just numbers) in `--test` match output ordering.
