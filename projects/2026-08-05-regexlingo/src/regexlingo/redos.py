"""Best-effort static detection of catastrophic-backtracking (ReDoS) shapes.

This is a heuristic, not a proof. It looks for two well-known danger
shapes that account for the large majority of real-world ReDoS incidents:

* nested unbounded quantifiers, e.g. ``(a+)+``, ``(a*)*``
* an unbounded-repeated group whose alternation branches can match
  overlapping text, e.g. ``(a|a)+``, ``(a|ab)+``

It intentionally does not attempt full ambiguity analysis (that problem is
PSPACE-hard in general) — patterns that don't match either shape are *not*
guaranteed safe, and the CLI output says so.
"""

from dataclasses import dataclass

from . import _parser_compat as _rx

_OP = _rx.OPCODES

_REPEAT_OPS = (_OP.MAX_REPEAT, _OP.MIN_REPEAT)


@dataclass
class Risk:
    kind: str
    message: str
    fragment: str


def _is_unbounded(min_, max_):
    return max_ == _rx.MAXREPEAT


def _effective_body(body):
    """The body of a MAX_REPEAT/MIN_REPEAT node is always a single atom (a
    grouped sub-pattern, since Python's re syntax forbids stacking two
    quantifiers directly). Peel a group wrapper, if any, to get at what is
    actually being repeated — this is where the sre parser's own
    optimizations (e.g. common-prefix factoring in alternation) surface, so
    scanning the peeled sequence is what lets us catch shapes like
    ``(a|a)+``, which the parser rewrites to ``a`` followed by a branch of
    two empty alternatives rather than keeping a literal BRANCH of 'a'|'a'.
    """
    op, av = body[0]
    if op == _OP.SUBPATTERN:
        return list(av[3])
    return body


def _contains_unbounded_repeat(seq):
    for op, av in seq:
        if op in _REPEAT_OPS:
            min_, max_, _ = av
            if _is_unbounded(min_, max_):
                return True
    return False


def _find_branch(seq):
    for op, av in seq:
        if op == _OP.BRANCH:
            return av
    return None


def _to_source(seq):
    """Best-effort reconstruction of a regex source fragment from an AST,
    for display in warning messages. Falls back to '...' for anything
    outside the literal/class/group/repeat/alternation subset."""
    parts = []
    for op, av in seq:
        if op == _OP.LITERAL:
            parts.append(chr(av))
        elif op == _OP.IN:
            negate, items = _in_source_items(av)
            if negate == "bare":
                parts.append(items)
            else:
                parts.append(f"[{'^' if negate else ''}{items}]")
        elif op == _OP.SUBPATTERN:
            group, _, _, subpattern = av
            inner = _to_source(list(subpattern))
            parts.append(f"({inner})" if group is not None else f"(?:{inner})")
        elif op in _REPEAT_OPS:
            min_, max_, body = av
            inner = _to_source(list(body))
            parts.append(f"{inner}{_repeat_suffix(min_, max_)}")
        elif op == _OP.BRANCH:
            _, branches = av
            parts.append("|".join(_to_source(list(b)) for b in branches))
        else:
            parts.append("...")
    return "".join(parts)


def _repeat_suffix(min_, max_):
    if min_ == 0 and max_ == _rx.MAXREPEAT:
        return "*"
    if min_ == 1 and max_ == _rx.MAXREPEAT:
        return "+"
    if min_ == 0 and max_ == 1:
        return "?"
    if max_ == _rx.MAXREPEAT:
        return f"{{{min_},}}"
    if min_ == max_:
        return f"{{{min_}}}"
    return f"{{{min_},{max_}}}"


_CATEGORY_ESCAPES = {
    _OP.CATEGORY_DIGIT: r"\d",
    _OP.CATEGORY_NOT_DIGIT: r"\D",
    _OP.CATEGORY_WORD: r"\w",
    _OP.CATEGORY_NOT_WORD: r"\W",
    _OP.CATEGORY_SPACE: r"\s",
    _OP.CATEGORY_NOT_SPACE: r"\S",
}


def _in_source_items(av):
    negate = bool(av) and av[0][0] == _OP.NEGATE
    items = av[1:] if negate else av
    # A lone, non-negated category class (e.g. plain \d) reads better
    # without the surrounding brackets that the caller adds.
    if not negate and len(items) == 1 and items[0][0] == _OP.CATEGORY:
        return "bare", _CATEGORY_ESCAPES.get(items[0][1], "...")
    text = []
    for op, item_av in items:
        if op == _OP.LITERAL:
            text.append(chr(item_av))
        elif op == _OP.RANGE:
            lo, hi = item_av
            text.append(f"{chr(lo)}-{chr(hi)}")
        elif op == _OP.CATEGORY:
            text.append(_CATEGORY_ESCAPES.get(item_av, "..."))
    return negate, "".join(text)


def _first_chars(seq):
    """Approximate the set of characters ``seq`` could start matching with.

    Returns a frozenset of char codes, or None if the set is unknown/huge
    enough that it should be treated conservatively as "could overlap with
    anything" (e.g. '.', a negated class, or a branch that can match the
    empty string).
    """
    if not seq:
        return None
    op, av = seq[0]
    if op == _OP.LITERAL:
        return frozenset({av})
    if op in (_OP.NOT_LITERAL, _OP.ANY):
        return None
    if op == _OP.IN:
        negate = bool(av) and av[0][0] == _OP.NEGATE
        if negate:
            return None
        chars = set()
        for iop, iav in av:
            if iop == _OP.LITERAL:
                chars.add(iav)
            elif iop == _OP.RANGE:
                lo, hi = iav
                if hi - lo > 128:
                    return None
                chars.update(range(lo, hi + 1))
            else:
                return None
        return frozenset(chars)
    if op == _OP.SUBPATTERN:
        return _first_chars(list(av[3]))
    if op in _REPEAT_OPS:
        min_, max_, body = av
        if min_ == 0:
            return None
        return _first_chars(list(body))
    if op == _OP.BRANCH:
        _, branches = av
        result = set()
        for branch in branches:
            fc = _first_chars(list(branch))
            if fc is None:
                return None
            result |= fc
        return frozenset(result)
    if op in (_OP.AT,):
        return _first_chars(seq[1:])
    return None


def _branches_overlap(branches):
    seen = set()
    for branch in branches:
        fc = _first_chars(list(branch))
        if fc is None:
            return True
        if seen & fc:
            return True
        seen |= fc
    return False


def _walk(seq, risks):
    for op, av in seq:
        if op in _REPEAT_OPS:
            min_, max_, body = av
            body = list(body)
            if _is_unbounded(min_, max_):
                effective = _effective_body(body)
                if _contains_unbounded_repeat(effective):
                    risks.append(
                        Risk(
                            kind="nested-quantifier",
                            message=(
                                "nested unbounded quantifiers can cause exponential "
                                "backtracking on strings that almost, but don't quite, match"
                            ),
                            fragment=_to_source([(op, av)]),
                        )
                    )
                branch_av = _find_branch(effective)
                if branch_av is not None:
                    _, branches = branch_av
                    if _branches_overlap(branches):
                        risks.append(
                            Risk(
                                kind="overlapping-alternation",
                                message=(
                                    "a repeated group has alternation branches that can match "
                                    "overlapping text, which can cause polynomial-to-exponential "
                                    "backtracking"
                                ),
                                fragment=_to_source([(op, av)]),
                            )
                        )
            _walk(body, risks)
        elif op == _OP.SUBPATTERN:
            _walk(list(av[3]), risks)
        elif op == _OP.BRANCH:
            _, branches = av
            for branch in branches:
                _walk(branch, risks)
        elif op in (_OP.ASSERT, _OP.ASSERT_NOT):
            _walk(list(av[1]), risks)
        elif op == _OP.GROUPREF_EXISTS:
            _, yes_pattern, no_pattern = av
            _walk(list(yes_pattern), risks)
            if no_pattern:
                _walk(list(no_pattern), risks)


def find_risks(pattern, flags=0):
    """Return a list of :class:`Risk` found in ``pattern`` (best-effort)."""
    parsed = _rx.parse(pattern, flags)
    risks = []
    _walk(list(parsed), risks)
    return risks
