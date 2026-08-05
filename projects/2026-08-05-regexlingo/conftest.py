import os
import sys

_SRC = os.path.join(os.path.dirname(__file__), "src")

if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

# Subprocess-based CLI tests spawn a fresh interpreter, so it needs the same
# path on its PYTHONPATH to find the regexlingo package.
os.environ["PYTHONPATH"] = os.pathsep.join(filter(None, [_SRC, os.environ.get("PYTHONPATH")]))
