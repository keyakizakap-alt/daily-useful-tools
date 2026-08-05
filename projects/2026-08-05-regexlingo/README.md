# RegexLingo

A standard-library-only CLI (and Python library) that explains a regular
expression in plain English, tests it against sample strings, and flags
patterns that risk catastrophic backtracking (ReDoS).

See [`requirements/requirements.md`](requirements/requirements.md) for the
full spec and [`design/design-doc.md`](design/design-doc.md) for how it's
built (it parses patterns with Python's own internal regex parser, so the
explanation can never disagree with what `re` actually does).

## Usage

```
python -m regexlingo PATTERN [--flags LETTERS] [--test STRING ...] [--json]
```

```
$ python -m regexlingo '(?P<year>\d{4})-(a+)+' --test "2024-aaa"
Pattern: (?P<year>\d{4})-(a+)+

Explanation:
  start capturing group 1 (named 'year'):
    repeat exactly 4 times:
      match a digit (0-9)
  match the character '-'
  repeat one or more times:
    start capturing group 2:
      repeat one or more times:
        match the character 'a'

ReDoS check (heuristic, not a guarantee):
  ⚠ [nested-quantifier] near '(a+)+': nested unbounded quantifiers can cause
    exponential backtracking on strings that almost, but don't quite, match

Match tests:
  '2024-aaa' -> MATCH span=(0, 8) groups={'1': '2024', '2': 'aaa', 'year': '2024'}
```

As a library:

```python
from regexlingo import explain, find_risks, test_pattern

print(explain(r"\d{4}-\d{2}-\d{2}"))
risks = find_risks(r"(a+)+")
results = test_pattern(r"\d+", 0, ["abc123"])
```

## Running the tests

```
python -m pip install pytest
python -m pytest
```

(`conftest.py` puts `src/` on `sys.path` and `PYTHONPATH` so both the
in-process unit tests and the subprocess-driven CLI tests can find the
`regexlingo` package without an install step.)

## Layout

```
design/         design doc
requirements/   requirements doc
src/regexlingo/ the package
tests/          pytest suite
feedback/       self-review notes from building this MVP
```
