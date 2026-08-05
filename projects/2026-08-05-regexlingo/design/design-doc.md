# RegexLingo — Design Doc

## Approach

Python's standard library already contains a full regex parser used
internally by the `re` module (`re._parser` on 3.11+, `sre_parse` on older
versions). Rather than writing a second regex parser from scratch, RegexLingo
parses the pattern with that internal parser to get an AST, then walks the
AST to produce an English explanation. This guarantees the explanation
always matches how Python's `re` will actually interpret the pattern —
there is no risk of the explainer and the engine disagreeing.

`re._parser` is a private API, so it is wrapped behind a single import
shim (`regexlingo/_parser_compat.py`) that tries the 3.11+ name first and
falls back to `sre_parse`/`sre_constants` for older interpreters. All other
modules import from the shim, never from `re._parser` directly, so a future
stdlib rename only requires touching one file.

## Module layout

```
src/regexlingo/
  __init__.py          public API: explain(), test_pattern(), check_redos()
  __main__.py           `python -m regexlingo` entry point
  _parser_compat.py     stdlib regex-parser import shim
  explain.py             AST -> plain-English explanation
  redos.py               static catastrophic-backtracking heuristic
  cli.py                 argument parsing + output formatting
```

## Explanation algorithm

`explain.parse_and_explain(pattern, flags)`:

1. Parse `pattern` with the compat shim -> a list of `(opcode, argument)`
   nodes (the same shape `re` uses internally).
2. Recursively walk the tree. Each opcode has a dedicated `_explain_<op>`
   handler that returns one or more lines of text. Nested constructs (groups,
   repeats, alternation branches) are indented one level deeper than their
   parent so the output reads like an outline.
3. Group numbers are tracked as they are encountered so capturing groups can
   be labeled "capturing group 1", "named group 'year' (group 2)", etc.
4. The top-level call joins all lines with newlines and returns a single
   string. `explain()` in `__init__.py` is a thin wrapper so callers don't
   need to touch the AST directly.

Opcodes handled: `LITERAL`, `NOT_LITERAL`, `ANY`, `IN` (character classes,
including negated and ranges), `BRANCH` (alternation), `SUBPATTERN`
(capturing/non-capturing/named groups), `MAX_REPEAT`/`MIN_REPEAT`
(greedy/lazy quantifiers, including exact `{m,n}` counts), `AT` (anchors:
`^`, `$`, `\b`, `\B`), `CATEGORY` (`\d`, `\w`, `\s` and negations),
`GROUPREF`/`GROUPREF_EXISTS` (backreferences and conditionals), and
`ASSERT`/`ASSERT_NOT` (lookaround).

## Match testing

`test_pattern(pattern, flags, strings)` compiles the pattern once with
`re.compile` and calls `.search()` on each candidate string, returning a
list of small dataclasses (`MatchResult`) carrying `matched: bool`,
`span: tuple | None`, and `groups: dict`. Kept separate from `explain()` so
a caller can request only an explanation without needing throwaway test
strings, or vice versa.

## ReDoS heuristic

`redos.find_risks(pattern)` walks the same AST looking for two well-known
danger shapes:

- **Nested quantifiers**: a `MAX_REPEAT`/`MIN_REPEAT` node whose body
  contains another repeat over a sub-pattern that can match the same
  characters (e.g. `(a+)+`, `(a*)*`, `(a+)*`). This is the classic
  exponential-backtracking shape.
- **Repeated alternation with overlapping branches**: a repeated group whose
  alternation branches are not mutually exclusive by their first character
  (e.g. `(a|a)+`, `(a|ab)+`), which produces polynomial-to-exponential
  backtracking depending on the input.

This is intentionally a heuristic, not a full ambiguity analysis (that is
PSPACE-hard in general) — it is scoped to catch the shapes that show up
most often in real-world ReDoS incidents, and it says so in its output.

## CLI

```
python -m regexlingo PATTERN [--flags ims x] [--test STR ...] [--json]
```

- Default output is human-readable, sectioned as `Explanation:`,
  `ReDoS check:`, and `Match tests:` (sections are omitted if not
  applicable, e.g. no `Match tests:` section when `--test` wasn't passed).
- `--json` emits a single JSON object instead, for piping into other tools.
- Invalid patterns print `error: <message>` to stderr and exit 2, rather
  than a Python traceback.

## Testing strategy

`pytest` unit tests per module:

- `test_explain.py`: one test per opcode family, checking the explanation
  contains the expected phrases (substring checks, not full-string equality,
  so wording can be refined without churning every test).
- `test_redos.py`: known-bad patterns must be flagged; known-safe patterns
  (including ones that merely *look* risky, like `a{1,100}`) must not be.
- `test_cli.py`: exercises the CLI end-to-end via `subprocess`/`runpy`,
  covering the happy path, `--test`, `--json`, and the invalid-pattern error
  path.
