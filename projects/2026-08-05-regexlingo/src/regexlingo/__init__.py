"""RegexLingo — explain a regex in plain English, test it, and check for
catastrophic-backtracking risk, all from the standard library."""

from .explain import explain
from .matcher import MatchResult, test_pattern
from .redos import Risk, find_risks

__all__ = ["explain", "test_pattern", "MatchResult", "find_risks", "Risk"]
__version__ = "0.1.0"
