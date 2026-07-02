#!/usr/bin/env python3
"""HWPX 검증 CLI.

사용:
    python3 v4/scripts/validators/validate.py <file.hwpx>                # JSON 출력
    python3 v4/scripts/validators/validate.py <file.hwpx> --format=text  # 사람용 텍스트
    python3 v4/scripts/validators/validate.py <file.hwpx> --strict       # 경고도 실패로

Exit code:
  0 — 에러 없음
  1 — 에러 발견 (--strict 시 경고도 포함)
  2 — 사용법 오류
"""
from __future__ import annotations

import argparse
import os
import sys

# 같은 폴더의 다른 모듈 import 경로 확보
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from container import validate_container  # noqa: E402
from structure import validate_structure  # noqa: E402
from report import ValidationReport        # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="HWPX 검증 도구 (polaris_dvc 4축 중 container + structure)")
    parser.add_argument("path", help="검증할 .hwpx 파일 경로")
    parser.add_argument("--format", choices=["json", "text"], default="json")
    parser.add_argument("--strict", action="store_true", help="경고도 실패로 간주")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(f"파일이 없습니다: {args.path}", file=sys.stderr)
        return 2

    total = ValidationReport()
    total.extend(validate_container(args.path))
    total.extend(validate_structure(args.path))

    if args.format == "json":
        print(total.to_json())
    else:
        if total.ok and total.warning_count == 0:
            print("✓ 검증 통과 — 위반 없음")
        else:
            print(f"에러 {total.error_count}건 / 경고 {total.warning_count}건:")
            for v in total.violations:
                icon = "✗" if v.severity == "error" else "⚠"
                loc = f"  [{v.location}]" if v.location else ""
                print(f"  {icon} [{v.axis}/{v.code}] {v.message}{loc}")

    if not total.ok:
        return 1
    if args.strict and total.warning_count > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
