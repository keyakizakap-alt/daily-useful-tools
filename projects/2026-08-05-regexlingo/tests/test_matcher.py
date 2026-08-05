import re

from regexlingo.matcher import test_pattern as run_pattern_test


def test_match_reports_span():
    [result] = run_pattern_test(r"\d+", 0, ["abc123"])
    assert result.matched
    assert result.span == (3, 6)


def test_no_match():
    [result] = run_pattern_test(r"\d+", 0, ["abcdef"])
    assert not result.matched
    assert result.span is None


def test_numbered_groups():
    [result] = run_pattern_test(r"(\d{4})-(\d{2})", 0, ["2024-08"])
    assert result.groups["1"] == "2024"
    assert result.groups["2"] == "08"


def test_named_groups_included_alongside_numbers():
    [result] = run_pattern_test(r"(?P<year>\d{4})", 0, ["2024"])
    assert result.groups["1"] == "2024"
    assert result.groups["year"] == "2024"


def test_multiple_strings_preserve_order():
    results = run_pattern_test(r"^a$", 0, ["a", "b", "a"])
    assert [r.matched for r in results] == [True, False, True]


def test_flags_are_applied():
    [result] = run_pattern_test(r"^abc$", re.IGNORECASE, ["ABC"])
    assert result.matched
