"""HWPX 검증 결과 모델.

polaris_dvc 의 4축 (container/structure/rule/schema) + JID 식 에러 코드 설계를
경량 Python 으로 포팅. 향후 polaris_dvc 공식 엔진 통합 시 그대로 매핑 가능하도록
축 이름과 코드 체계를 맞춘다.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import Optional


# polaris_dvc 축 정의와 일치
AXIS_RULE = "rule"             # JID 1000–7999
AXIS_STRUCTURE = "structure"   # JID 11000–11999
AXIS_CONTAINER = "container"   # JID 12000–12999
AXIS_SCHEMA = "schema"         # JID 13000–13999

SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"
SEVERITY_INFO = "info"


@dataclass
class Violation:
    axis: str            # AXIS_*
    code: str            # "V12001" 형식 (V = v3-native, J = polaris JID)
    severity: str        # SEVERITY_*
    message: str         # 사용자 친화 한국어
    location: Optional[str] = None   # 예: "Contents/section0.xml"

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class ValidationReport:
    violations: list[Violation] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not any(v.severity == SEVERITY_ERROR for v in self.violations)

    @property
    def error_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == SEVERITY_ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == SEVERITY_WARNING)

    def add(self, violation: Violation) -> None:
        self.violations.append(violation)

    def extend(self, other: "ValidationReport") -> None:
        self.violations.extend(other.violations)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "errorCount": self.error_count,
            "warningCount": self.warning_count,
            "violations": [v.to_dict() for v in self.violations],
        }

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)


def error(axis: str, code: str, message: str, location: str | None = None) -> Violation:
    return Violation(axis=axis, code=code, severity=SEVERITY_ERROR, message=message, location=location)


def warning(axis: str, code: str, message: str, location: str | None = None) -> Violation:
    return Violation(axis=axis, code=code, severity=SEVERITY_WARNING, message=message, location=location)
