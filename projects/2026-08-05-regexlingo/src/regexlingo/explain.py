"""Turn a parsed regex AST into a plain-English, indented explanation."""

import re

from . import _parser_compat as _rx

_OP = _rx.OPCODES
INDENT = "  "

_SPECIAL_CHARS = {
    9: "a tab character",
    10: "a newline character",
    13: "a carriage return character",
    32: "a space character",
}

_CATEGORY_DESCRIPTIONS = {
    _OP.CATEGORY_DIGIT: "a digit (0-9)",
    _OP.CATEGORY_NOT_DIGIT: "any character that is not a digit",
    _OP.CATEGORY_WORD: "a word character (letter, digit, or underscore)",
    _OP.CATEGORY_NOT_WORD: "any character that is not a word character",
    _OP.CATEGORY_SPACE: "a whitespace character",
    _OP.CATEGORY_NOT_SPACE: "any character that is not whitespace",
}


def _char_repr(code):
    if code in _SPECIAL_CHARS:
        return _SPECIAL_CHARS[code]
    return f"the character {chr(code)!r}"


def _repeat_phrase(min_, max_):
    if min_ == 0 and max_ == _rx.MAXREPEAT:
        return "zero or more times"
    if min_ == 1 and max_ == _rx.MAXREPEAT:
        return "one or more times"
    if min_ == 0 and max_ == 1:
        return "zero or one time (optional)"
    if max_ == _rx.MAXREPEAT:
        return f"{min_} or more times"
    if min_ == max_:
        return f"exactly {min_} time{'s' if min_ != 1 else ''}"
    return f"between {min_} and {max_} times"


def _in_items_description(items):
    negate = bool(items) and items[0][0] == _OP.NEGATE
    if negate:
        items = items[1:]
    parts = []
    for op, av in items:
        if op == _OP.LITERAL:
            parts.append(_char_repr(av))
        elif op == _OP.RANGE:
            lo, hi = av
            parts.append(f"any character from {chr(lo)!r} to {chr(hi)!r}")
        elif op == _OP.CATEGORY:
            parts.append(_CATEGORY_DESCRIPTIONS.get(av, "a character in an unrecognized category"))
        else:
            parts.append("a character matching an unsupported sub-pattern")
    return negate, parts


class Explainer:
    def __init__(self, group_names, flags=0):
        self.group_names = group_names
        self.multiline = bool(flags & re.MULTILINE)
        self.dotall = bool(flags & re.DOTALL)

    def group_label(self, number):
        name = self.group_names.get(number)
        if name:
            return f"group {number} (named {name!r})"
        return f"group {number}"

    def explain_seq(self, seq, indent):
        lines = []
        for op, av in seq:
            lines.extend(self.explain_node(op, av, indent))
        return lines

    def explain_node(self, op, av, indent):
        pad = INDENT * indent
        handler = getattr(self, f"_op_{str(op).lower()}", None)
        if handler is None:
            return [f"{pad}an unsupported construct ({op})"]
        return handler(av, indent, pad)

    # -- individual opcode handlers -------------------------------------

    def _op_literal(self, av, indent, pad):
        return [f"{pad}match {_char_repr(av)}"]

    def _op_not_literal(self, av, indent, pad):
        return [f"{pad}match any character except {_char_repr(av)}"]

    def _op_any(self, av, indent, pad):
        if self.dotall:
            return [f"{pad}match any character, including newline (DOTALL is set)"]
        return [f"{pad}match any character except newline"]

    def _op_in(self, av, indent, pad):
        negate, parts = _in_items_description(av)
        if not negate and len(av) == 1 and av[0][0] == _OP.CATEGORY:
            return [f"{pad}match {parts[0]}"]
        verb = "match any character that is none of" if negate else "match one of"
        return [f"{pad}{verb}: {', '.join(parts)}"]

    def _op_branch(self, av, indent, pad):
        _, branches = av
        lines = [f"{pad}match one of the following alternatives:"]
        for i, branch in enumerate(branches, start=1):
            lines.append(f"{pad}{INDENT}alternative {i}:")
            lines.extend(self.explain_seq(branch, indent + 2))
        return lines

    def _op_subpattern(self, av, indent, pad):
        group, _add_flags, _del_flags, subpattern = av
        if group is None:
            lines = [f"{pad}start a local-scope group:"]
        else:
            lines = [f"{pad}start capturing {self.group_label(group)}:"]
        lines.extend(self.explain_seq(list(subpattern), indent + 1))
        return lines

    def _repeat(self, av, indent, pad, lazy):
        min_, max_, body = av
        phrase = _repeat_phrase(min_, max_)
        suffix = " (lazy — matches as few as possible)" if lazy else ""
        lines = [f"{pad}repeat {phrase}{suffix}:"]
        lines.extend(self.explain_seq(list(body), indent + 1))
        return lines

    def _op_max_repeat(self, av, indent, pad):
        return self._repeat(av, indent, pad, lazy=False)

    def _op_min_repeat(self, av, indent, pad):
        return self._repeat(av, indent, pad, lazy=True)

    def _op_at(self, av, indent, pad):
        if av == _OP.AT_BEGINNING:
            text = "anchor: start of a line (MULTILINE is set)" if self.multiline else "anchor: start of the string"
        elif av == _OP.AT_END:
            text = (
                "anchor: end of a line (MULTILINE is set)"
                if self.multiline
                else "anchor: end of the string (or just before a trailing newline)"
            )
        elif av == _OP.AT_BEGINNING_STRING:
            text = "anchor: absolute start of the string"
        elif av == _OP.AT_END_STRING:
            text = "anchor: absolute end of the string"
        elif av == _OP.AT_BOUNDARY:
            text = "anchor: a word boundary"
        elif av == _OP.AT_NON_BOUNDARY:
            text = "anchor: not a word boundary"
        else:
            text = "anchor: an unrecognized position"
        return [f"{pad}{text}"]

    def _op_groupref(self, av, indent, pad):
        return [f"{pad}match the same text already matched by {self.group_label(av)}"]

    def _op_groupref_exists(self, av, indent, pad):
        group, yes_pattern, no_pattern = av
        lines = [f"{pad}if {self.group_label(group)} matched, then:"]
        lines.extend(self.explain_seq(list(yes_pattern), indent + 1))
        if no_pattern:
            lines.append(f"{pad}otherwise:")
            lines.extend(self.explain_seq(list(no_pattern), indent + 1))
        return lines

    def _assert(self, av, indent, pad, negated):
        direction, subpattern = av
        where = "follows" if direction == 1 else "precedes"
        polarity = "is NOT" if negated else "is"
        lines = [f"{pad}assert what {where} this point {polarity}:"]
        lines.extend(self.explain_seq(list(subpattern), indent + 1))
        return lines

    def _op_assert(self, av, indent, pad):
        return self._assert(av, indent, pad, negated=False)

    def _op_assert_not(self, av, indent, pad):
        return self._assert(av, indent, pad, negated=True)


def explain(pattern, flags=0):
    """Return a plain-English, multi-line explanation of ``pattern``."""
    parsed = _rx.parse(pattern, flags)
    group_names = {number: name for name, number in parsed.state.groupdict.items()}
    explainer = Explainer(group_names, flags=parsed.state.flags)
    lines = explainer.explain_seq(list(parsed), indent=0)
    if not lines:
        return "matches the empty string"
    return "\n".join(lines)
