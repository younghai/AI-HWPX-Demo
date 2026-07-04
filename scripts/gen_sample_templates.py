#!/usr/bin/env python3
"""Generate doc-type starter templates for the sample gallery (review B3).

Each starter is built through the SAME production pipeline (build_hwpx.py) from
the bundled gonmun.hwpx, pre-filled with that document type's default TOC and a
short placeholder body per section. Users pick one to start instantly with the
right section structure; the AI then replaces the bodies.

Run from the repo root:  python3 scripts/gen_sample_templates.py
Output:  templates/samples/{docType}-sample.hwpx  (report / proposal / minutes)
Deterministic (--doc-date fixed) so regenerating produces stable files.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILD = REPO_ROOT / "scripts" / "build_hwpx.py"
OUT_DIR = REPO_ROOT / "templates" / "samples"

# Doc type → (title, [section headings]). Headings mirror shared/docTypes.js
# TOC_TEMPLATES so the starter matches what the doc-type picker expects.
STARTERS = {
    "report": (
        "분석 보고서 (예시 양식)",
        ["배경 및 목적", "현황 분석", "핵심 제안", "실행 계획", "기대 효과"],
    ),
    "proposal": (
        "사업 제안서 (예시 양식)",
        ["제안 개요", "문제 정의", "해결 방안", "구현 일정", "운영 지원"],
    ),
    "minutes": (
        "회의록 (예시 양식)",
        ["회의 개요", "주요 논의", "결정 사항", "후속 액션", "일정 공유"],
    ),
}

PLACEHOLDER = "이 섹션에 '{h}' 내용을 작성하세요. 문서를 업로드해 시작하거나 AI 생성으로 채울 수 있습니다."


def build_one(doc_type: str, title: str, headings: list[str]) -> Path:
    sections = [{"heading": h, "body": PLACEHOLDER.format(h=h)} for h in headings]
    out = OUT_DIR / f"{doc_type}-sample.hwpx"
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(sections, f, ensure_ascii=False)
        sj = f.name
    cmd = [
        sys.executable, str(BUILD),
        "--template", "gonmun",
        "--output", str(out),
        "--title", title,
        "--toc", "\n".join(headings),
        "--source-document", f"{doc_type}-starter.hwpx",
        "--sections-json", sj,
        "--doc-date", "2026.01.01",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    Path(sj).unlink(missing_ok=True)
    if result.returncode != 0:
        raise SystemExit(f"build failed for {doc_type}:\n{result.stdout}\n{result.stderr}")
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for doc_type, (title, headings) in STARTERS.items():
        out = build_one(doc_type, title, headings)
        print(f"✓ {doc_type}: {out.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
