"""Import shim for Python's internal regex parser.

The stdlib's own regex parser moved from ``sre_parse``/``sre_constants``
(Python < 3.11) to ``re._parser``/``re._constants`` (Python >= 3.11). Both
are private APIs, so every other module in this package imports the parser
and its opcodes from here instead of from ``re`` directly, keeping the
version-compatibility knowledge in one place.
"""

try:
    from re import _parser as sre_parse  # Python 3.11+
    from re import _constants as sre_constants
except ImportError:  # pragma: no cover - exercised only on Python < 3.11
    import sre_parse
    import sre_constants

parse = sre_parse.parse
OPCODES = sre_constants
MAXREPEAT = sre_constants.MAXREPEAT
