# Feedback — Round 1 (self-review + simulated user pass)

Reviewed the MVP as if a developer were picking it up for the first time:
ran the CLI against ~20 patterns spanning literals, classes, groups,
quantifiers, anchors, backreferences, lookaround, conditionals, inline
flags, and the two documented ReDoS shapes.

## What worked well

- The explanation output reads as an outline and is genuinely easier to
  parse than staring at a dense regex, even for nested groups
  (`((a)(b))c` produces a clean 3-level indent).
- The ReDoS heuristic correctly fired on `(a+)+`, `(a*)*`, `(xa+)+`,
  `(a+x)+`, and `(\d+)+`, and correctly stayed silent on `a{1,100}`,
  `(abc){2,5}`, and `(ab|ac)+`.
- `--json` output is valid, stable-shaped JSON — good for piping into
  other tools per the requirements doc.
- Invalid patterns exit cleanly with `error: ...` on stderr, no traceback.

## Bugs found during this pass (fixed before round 2)

1. **`re._parser` opcode objects aren't strings.** `explain.py` originally
   called `op.lower()` assuming `op` was a `str`; it's actually a
   `_NamedIntConstant`. Fixed by wrapping with `str(op).lower()`.

2. **The alternation-overlap ReDoS check missed the most classic example,
   `(a|a)+`.** Python's own regex parser optimizes alternation with a
   common literal prefix — `(a|a)+` is rewritten internally to `a`
   followed by `BRANCH(None, [[], []])` (two empty alternatives), not a
   literal `BRANCH` of `'a'|'a'`. My first implementation only looked for
   a `BRANCH` node when it was the *sole* element of the repeated group's
   body, so it missed this rewritten shape entirely. Verified empirically
   that `(a|a)+` genuinely hangs in Python's backtracking engine
   (`timeout 3 python3 -c '...'` → exit 124), so this wasn't a false
   negative I could shrug off. Rewrote the detector to peel one group
   wrapper and then scan the *entire* resulting sequence for a `BRANCH`
   node, not just a single-node body. Added `(a|a)+` and `(a|ab)+` as
   explicit regression tests.

3. **Leftover dead code** (`_to_source(seq[:1]) if False else ...`) from
   mid-edit iteration in `redos.py` — cleaned up.

4. **Category shorthand in ReDoS fragments was unreadable.** The
   reconstructed-source helper printed `[...]+ ` for `(\d+)+` instead of
   `(\d+)+`. Added an escape table (`\d`, `\D`, `\w`, `\W`, `\s`, `\S`) so
   warning fragments are legible.

5. **pytest self-collection trap.** `tests/test_matcher.py` did
   `from regexlingo.matcher import test_pattern`, which pytest then tried
   to collect *as a test function* (any top-level `test_*` name in a test
   module is fair game, imported or not) and failed because it expects
   pytest fixtures named after the parameters. Renamed the import alias to
   `run_pattern_test`. Left a note in mind for anyone adding new tests: any
   library function whose name starts with `test_` needs an aliased import
   in test files.

## Residual limitations (acceptable for MVP, documented rather than fixed)

- The ReDoS heuristic is deliberately conservative in one direction only:
  it can produce false negatives (real ReDoS shapes it doesn't recognize,
  e.g. ambiguity spread across three or more nested groups) but should not
  produce many false positives on hand-checked common patterns. This
  matches the requirements doc's explicit scoping ("best-effort, not a
  proof").
- No support for regex flavors other than Python's `re` (by design — see
  requirements doc's "out of scope" section).
