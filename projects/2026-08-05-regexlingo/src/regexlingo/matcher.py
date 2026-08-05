"""Run a compiled pattern against sample strings for the ``--test`` flag."""

import re
from dataclasses import dataclass, field


@dataclass
class MatchResult:
    string: str
    matched: bool
    span: tuple | None = None
    groups: dict = field(default_factory=dict)


def test_pattern(pattern, flags, strings):
    """Compile ``pattern`` once and run it (via ``search``) against each of
    ``strings``, returning one :class:`MatchResult` per string."""
    compiled = re.compile(pattern, flags)
    results = []
    for s in strings:
        m = compiled.search(s)
        if m is None:
            results.append(MatchResult(string=s, matched=False))
            continue
        groups = {str(i): g for i, g in enumerate(m.groups(), start=1)}
        groups.update(m.groupdict())
        results.append(MatchResult(string=s, matched=True, span=m.span(), groups=groups))
    return results
