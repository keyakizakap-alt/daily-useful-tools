import pytest

from regexlingo.redos import find_risks


@pytest.mark.parametrize(
    "pattern",
    [
        r"(a+)+",
        r"(a*)*",
        r"(a+)*b",
        r"(a*)+c",
        r"(xa+)+",
        r"(a+x)+",
        r"(\d+)+",
    ],
)
def test_nested_quantifiers_are_flagged(pattern):
    risks = find_risks(pattern)
    assert any(r.kind == "nested-quantifier" for r in risks)


@pytest.mark.parametrize(
    "pattern",
    [
        r"(a|a)+",
        r"(a|ab)+",
        r"(a|ab)*",
    ],
)
def test_overlapping_alternation_is_flagged(pattern):
    risks = find_risks(pattern)
    assert any(r.kind == "overlapping-alternation" for r in risks)


@pytest.mark.parametrize(
    "pattern",
    [
        r"a{1,100}",
        r"(abc){2,5}",
        r"a+",
        r"a*",
        r"^[a-z]+@[a-z]+\.[a-z]+$",
        r"(a|b)+",
        r"(ab|ac)+",
        r"\d{4}-\d{2}-\d{2}",
        r"(abc)+",
    ],
)
def test_safe_patterns_are_not_flagged(pattern):
    assert find_risks(pattern) == []


def test_risk_fragment_reflects_offending_part():
    risks = find_risks(r"^prefix-(a+)+-suffix$")
    assert len(risks) == 1
    assert risks[0].fragment == "(a+)+"


def test_risk_message_says_heuristic_not_a_guarantee():
    # The module docstring / CLI must not overclaim certainty; spot-check
    # that at least the messages we produce read as heuristic advice.
    risks = find_risks(r"(a+)+")
    assert "can cause" in risks[0].message
