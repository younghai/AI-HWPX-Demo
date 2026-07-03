import sys
from pathlib import Path

# Put scripts/ and scripts/office/ on the path so tests import the pipeline
# modules the same way build_hwpx.py does at runtime.
SCRIPTS_DIR = Path(__file__).resolve().parent.parent
for _p in (SCRIPTS_DIR, SCRIPTS_DIR / "office"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))
