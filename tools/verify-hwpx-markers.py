#!/usr/bin/env python3
"""Verify that a built HWPX file contains the given marker strings.

Usage:
    python3 v2/tools/verify-hwpx-markers.py <hwpx_path> MARKER1 [MARKER2 ...]

Exit 0 if ALL markers are present, 1 otherwise.

Example (CI-style usage):
    python3 v2/tools/verify-hwpx-markers.py /tmp/out.hwpx "배경 및 목적" "MARKER_A"

Why this exists:
    R1 (CLAUDE.md) — never claim "완료" without byte-level evidence. This is
    the definitive test that AI/user content actually reached the output.
"""
from __future__ import annotations

import sys
import zipfile
import xml.etree.ElementTree as ET

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"


def extract_text(hwpx_path: str) -> str:
    with zipfile.ZipFile(hwpx_path, "r") as z:
        with z.open("Contents/section0.xml") as f:
            tree = ET.parse(f)
    root = tree.getroot()
    texts = []
    for p in root.iter(f"{{{HP}}}p"):
        for t in p.findall(f".//{{{HP}}}t"):
            if t.text and t.text.strip():
                texts.append(t.text.strip())
    return "\n".join(texts)


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    hwpx_path = sys.argv[1]
    markers = sys.argv[2:]

    try:
        full_text = extract_text(hwpx_path)
    except Exception as exc:
        print(f"ERROR: cannot extract text from {hwpx_path}: {exc}", file=sys.stderr)
        return 2

    missing = []
    for m in markers:
        occurrences = full_text.count(m)
        symbol = "✓" if occurrences >= 1 else "✗"
        print(f"  {symbol} {m!r}: {occurrences} 회")
        if occurrences < 1:
            missing.append(m)

    if missing:
        print(f"\n❌ {len(missing)} / {len(markers)} markers missing: {missing}")
        return 1
    print(f"\n✅ all {len(markers)} markers present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
