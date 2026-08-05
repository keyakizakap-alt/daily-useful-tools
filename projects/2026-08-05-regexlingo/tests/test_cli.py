import json
import subprocess
import sys


def run_cli(*args):
    return subprocess.run(
        [sys.executable, "-m", "regexlingo", *args],
        capture_output=True,
        text=True,
    )


def test_happy_path_prints_explanation():
    result = run_cli(r"\d+")
    assert result.returncode == 0
    assert "Explanation:" in result.stdout
    assert "digit" in result.stdout


def test_redos_warning_shown_for_risky_pattern():
    result = run_cli(r"(a+)+")
    assert result.returncode == 0
    assert "nested-quantifier" in result.stdout


def test_no_redos_warning_for_safe_pattern():
    result = run_cli(r"a+")
    assert result.returncode == 0
    assert "no known catastrophic-backtracking shapes found" in result.stdout


def test_test_flag_reports_match_results():
    result = run_cli(r"^\d+$", "--test", "123", "--test", "abc")
    assert result.returncode == 0
    assert "'123' -> MATCH" in result.stdout
    assert "'abc' -> NO MATCH" in result.stdout


def test_flags_option_applies_ignorecase():
    result = run_cli(r"^abc$", "--flags", "i", "--test", "ABC")
    assert "'ABC' -> MATCH" in result.stdout


def test_json_output_is_valid_json():
    result = run_cli(r"\d+", "--test", "abc123", "--json")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["pattern"] == r"\d+"
    assert payload["match_tests"][0]["matched"] is True


def test_invalid_pattern_exits_nonzero_with_clean_error():
    result = run_cli("(unclosed")
    assert result.returncode == 2
    assert "error:" in result.stderr
    assert "Traceback" not in result.stderr


def test_unknown_flag_letter_is_rejected():
    result = run_cli(r"abc", "--flags", "z")
    assert result.returncode != 0
