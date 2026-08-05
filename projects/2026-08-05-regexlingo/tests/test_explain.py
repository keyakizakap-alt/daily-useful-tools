import re

import pytest

from regexlingo.explain import explain


def test_literal_sequence():
    assert "match the character 'a'" in explain("a")


def test_any():
    assert "any character" in explain(".")


def test_character_class_range():
    out = explain("[a-z0-9_]")
    assert "'a' to 'z'" in out
    assert "'0' to '9'" in out
    assert "'_'" in out


def test_negated_character_class():
    out = explain("[^abc]")
    assert "none of" in out


def test_shorthand_class_reads_naturally():
    out = explain(r"\d")
    assert out == "match a digit (0-9)"


def test_alternation():
    out = explain("cat|dog")
    assert "one of the following alternatives" in out
    assert "alternative 1" in out
    assert "alternative 2" in out


def test_capturing_group_numbered():
    out = explain("(abc)")
    assert "capturing group 1" in out


def test_named_group():
    out = explain(r"(?P<year>\d{4})")
    assert "named 'year'" in out


def test_non_capturing_group_is_transparent():
    out = explain("(?:abc)")
    assert "group" not in out
    assert "match the character 'a'" in out


def test_quantifier_star():
    assert "zero or more times" in explain("a*")


def test_quantifier_plus():
    assert "one or more times" in explain("a+")


def test_quantifier_optional():
    assert "optional" in explain("a?")


def test_quantifier_exact_count():
    assert "exactly 4 times" in explain(r"\d{4}")


def test_quantifier_range():
    assert "between 2 and 5 times" in explain("a{2,5}")


def test_lazy_quantifier_is_labeled():
    out = explain("a+?")
    assert "lazy" in out


def test_anchors():
    out = explain("^abc$")
    assert "start of the string" in out
    assert "end of the string" in out


def test_word_boundary():
    out = explain(r"\bword\B")
    assert "word boundary" in out
    assert "not a word boundary" in out


def test_backreference_mentions_group():
    out = explain(r"(a)\1")
    assert "group 1" in out


def test_lookahead():
    out = explain("(?=abc)")
    assert "follows" in out
    assert "NOT" not in out


def test_negative_lookahead():
    out = explain("(?!abc)")
    assert "NOT" in out
    assert "follows" in out


def test_lookbehind():
    out = explain("(?<=abc)")
    assert "precedes" in out


def test_negative_lookbehind():
    out = explain("(?<!abc)")
    assert "NOT" in out
    assert "precedes" in out


def test_conditional_groupref():
    out = explain(r"(a)(?(1)yes|no)")
    assert "group 1" in out
    assert "otherwise" in out


def test_multiline_flag_mentioned_in_anchor():
    out = explain("^abc$", re.MULTILINE)
    assert "MULTILINE" in out


def test_multiline_flag_not_mentioned_when_absent():
    out = explain("^abc$")
    assert "MULTILINE" not in out
    assert "start of the string" in out


def test_inline_multiline_flag_is_detected():
    out = explain("(?m)^abc$")
    assert "MULTILINE" in out


def test_dotall_flag_changes_any_explanation():
    assert "except newline" in explain(".")
    assert "including newline" in explain(".", re.DOTALL)


def test_invalid_pattern_raises():
    with pytest.raises(re.error):
        explain("(unclosed")


def test_explanation_is_indented_outline():
    out = explain(r"(a+)")
    lines = out.splitlines()
    assert lines[0].startswith("start capturing")
    assert lines[1].startswith("  ")
