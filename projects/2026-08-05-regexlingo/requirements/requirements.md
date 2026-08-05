# RegexLingo — Requirements

## Idea

A command-line tool that explains a regular expression in plain English,
tests it against sample strings, and flags patterns that are at risk of
catastrophic backtracking (ReDoS).

## Use case

Developers spend a disproportionate amount of time deciphering regexes
written by someone else (or by themselves, six months ago). Existing online
"regex explainer" tools require pasting a pattern into a browser and are
not scriptable. RegexLingo brings the same idea to the terminal so it can be
used while reviewing code, during a PR review, or piped into other tools.

Secondary use case: catching accidentally-quadratic/exponential regexes
(nested quantifiers like `(a+)+`) before they ship and cause an outage.

## Functional requirements

1. Given a regex pattern, print a structured, human-readable explanation of
   every component: literals, character classes, anchors, groups
   (capturing/non-capturing/named), quantifiers, alternation, backreferences,
   lookaheads/lookbehinds.
2. Support common inline flags via a `--flags` CLI option (`i`, `m`, `s`, `x`).
3. Accept zero or more `--test STRING` arguments; report whether each string
   matches, and if so, the matched span and any captured groups.
4. Detect common catastrophic-backtracking shapes (nested quantifiers,
   quantified alternation with overlapping branches) and print a warning
   with the offending sub-pattern.
5. Exit with a non-zero status and a clear error message for invalid regex
   syntax, rather than a raw Python traceback.
6. Usable both as a CLI (`python -m regexlingo ...`) and as a library
   (`from regexlingo import explain`).

## Non-functional requirements

- Standard library only — no third-party dependencies, so it is trivially
  installable anywhere Python 3.9+ runs.
- Explanations must be deterministic (no reliance on dict ordering quirks,
  wall-clock time, etc.) so tests are stable.
- The ReDoS heuristic is best-effort static analysis, not a proof — it must
  say so in its output rather than implying certainty.

## Out of scope (for this MVP)

- A GUI / web front-end.
- Full regex-flavor portability (this targets Python's `re` dialect only).
- Auto-fixing unsafe regexes.
