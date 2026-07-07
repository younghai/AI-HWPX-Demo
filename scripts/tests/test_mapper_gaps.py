from __future__ import annotations

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pytest

import build_hwpx

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GONMUN_TEMPLATE = REPO_ROOT / "templates" / "gonmun.hwpx"
SLOTLESS_FIXTURE = REPO_ROOT / "testdata" / "mapper-slotless-heading.hwpx"


def _write_sections(path: Path, sections: list[dict[str, str]]) -> None:
    path.write_text(json.dumps(sections, ensure_ascii=False), encoding="utf-8")


def _build_hwpx(
    tmp_path: Path,
    sections: list[dict[str, str]],
    toc: list[str],
    template_file: Path | None = None,
) -> Path:
    sections_path = tmp_path / "sections.json"
    _write_sections(sections_path, sections)
    output_path = tmp_path / "out.hwpx"
    command = [
        sys.executable,
        str(REPO_ROOT / "scripts" / "build_hwpx.py"),
        "--output",
        str(output_path),
        "--title",
        "HC-1 매퍼 갭 테스트",
        "--toc",
        "\n".join(toc),
        "--sections-json",
        str(sections_path),
        "--doc-date",
        "2026.01.01",
    ]
    if template_file is None:
        command.extend(["--template", "gonmun"])
    else:
        command.extend(["--template-file", str(template_file)])
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    return output_path


def _section_xml(hwpx_path: Path) -> str:
    with zipfile.ZipFile(hwpx_path) as archive:
        return archive.read("Contents/section0.xml").decode("utf-8")


def _paragraph_count(section_xml: str) -> int:
    root = ET.fromstring(section_xml)
    return len(list(root.iter(f"{{{HP}}}p")))


def _heading_texts(section_xml: str) -> list[str]:
    root = ET.fromstring(section_xml)
    texts: list[str] = []
    for paragraph in root.iter(f"{{{HP}}}p"):
        if paragraph.get("styleIDRef", "0") != "1":
            continue
        text = build_hwpx._direct_text_first(paragraph)
        if text:
            texts.append(text)
    return texts


@pytest.mark.skipif(not SLOTLESS_FIXTURE.exists(), reason="mapper slotless fixture missing")
def test_body_slotless_heading_inserts_paragraphs(tmp_path: Path):
    toc = ["슬롯리스 첫 섹션", "슬롯리스 둘째 섹션"]
    sections = [
        {"heading": toc[0], "body": "HC1_SLOTLESS_ALPHA 고유 본문."},
        {"heading": toc[1], "body": "HC1_SLOTLESS_BETA 고유 본문."},
    ]

    output = _build_hwpx(tmp_path, sections, toc, SLOTLESS_FIXTURE)
    output_xml = _section_xml(output)
    fixture_xml = _section_xml(SLOTLESS_FIXTURE)

    assert output_xml.count("HC1_SLOTLESS_ALPHA") == 1
    assert output_xml.count("HC1_SLOTLESS_BETA") == 1
    assert _heading_texts(output_xml)[:2] == toc
    assert output_xml.count("<hp:tbl") == fixture_xml.count("<hp:tbl")


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_normal_template_unchanged_by_mapper_fixes(tmp_path: Path):
    toc = ["서비스 추진 배경", "기대 효과"]
    sections = [
        {"heading": toc[0], "body": "HC1_REG_ALPHA 정상 본문."},
        {"heading": toc[1], "body": "HC1_REG_BETA 정상 본문."},
    ]

    output = _build_hwpx(tmp_path, sections, toc)
    output_xml = _section_xml(output)

    assert output_xml.count("HC1_REG_ALPHA") == 1
    assert output_xml.count("HC1_REG_BETA") == 1
    assert _paragraph_count(output_xml) == 44
    assert output_xml.count("<hp:tbl") == 2
