"""HWPX 검증기 패키지.

사용법 (Python):
    from validators import validate_all
    report = validate_all("output.hwpx")
    print(report.to_json())

CLI:
    python3 v4/scripts/validators/validate.py <hwpx_path>
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# validators 패키지 디렉터리를 sys.path 에 추가 (상대 import 편의)
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from report import ValidationReport  # noqa: E402
from container import validate_container  # noqa: E402
from structure import validate_structure  # noqa: E402


def validate_all(hwpx_path: str | Path) -> ValidationReport:
    """전체 축을 순차 실행하고 합친 결과를 반환한다."""
    total = ValidationReport()
    total.extend(validate_container(hwpx_path))
    total.extend(validate_structure(hwpx_path))
    # 향후 rule / schema 축 추가 위치
    return total


__all__ = ["ValidationReport", "validate_all", "validate_container", "validate_structure"]
