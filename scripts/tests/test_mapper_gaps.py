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
NO_OUTLINE_FIXTURE = REPO_ROOT / "testdata" / "mapper-no-outline.hwpx"
SLOTLESS_FIXTURE = REPO_ROOT / "testdata" / "mapper-slotless-heading.hwpx"


def _write_sections(path: Path, sections: list[dict[str, str]]) -> None:
    path.write_text(json.dumps(sections, ensure_ascii=False), encoding="utf-8")


def _build_hwpx(
    tmp_path: Path,
    sections: list[dict[str, str]],
    toc: list[str] | None,
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
        "--sections-json",
        str(sections_path),
        "--doc-date",
        "2026.01.01",
    ]
    if toc is not None:
        command.extend(["--toc", "\n".join(toc)])
    if template_file is None:
        command.extend(["--template", "gonmun"])
    else:
        command.extend(["--template-file", str(template_file)])
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    return output_path


def _build_hwpx_without_sections(tmp_path: Path, toc: list[str]) -> Path:
    output_path = tmp_path / "out.hwpx"
    result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts" / "build_hwpx.py"),
            "--template",
            "gonmun",
            "--output",
            str(output_path),
            "--title",
            "HC-1 매퍼 갭 테스트",
            "--toc",
            "\n".join(toc),
            "--doc-date",
            "2026.01.01",
        ],
        capture_output=True,
        text=True,
    )
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


def _paragraph_texts(section_xml: str) -> list[tuple[str, str]]:
    root = ET.fromstring(section_xml)
    texts: list[tuple[str, str]] = []
    for paragraph in root.iter(f"{{{HP}}}p"):
        text = build_hwpx._direct_text_first(paragraph)
        if text:
            texts.append((paragraph.get("styleIDRef", "0"), text))
    return texts


def _body_texts_after_heading(section_xml: str, heading: str) -> list[str]:
    found_heading = False
    body_texts: list[str] = []
    for style_id, text in _paragraph_texts(section_xml):
        if style_id == "1":
            if found_heading:
                break
            if text == heading:
                found_heading = True
            continue
        if found_heading:
            body_texts.append(text)
    return body_texts


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_sections_json_toc_derivation_wins_over_conflicting_cli_toc(tmp_path: Path):
    derived_toc = ["유래A", "유래B", "유래C"]
    sections = [
        {"heading": heading, "body": f"DERIVED_MARKER_{index} 고유 본문."}
        for index, heading in enumerate(derived_toc, start=1)
    ]

    output = _build_hwpx(tmp_path, sections, ["무시X", "무시Y", "무시Z"])
    output_xml = _section_xml(output)

    assert _heading_texts(output_xml)[:3] == derived_toc
    for ignored in ["무시X", "무시Y", "무시Z"]:
        assert ignored not in output_xml
    for index in range(1, 4):
        assert output_xml.count(f"DERIVED_MARKER_{index}") == 1


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_sections_json_toc_derivation_works_without_cli_toc(tmp_path: Path):
    derived_toc = ["유래A", "유래B", "유래C"]
    sections = [
        {"heading": heading, "body": f"NO_TOC_MARKER_{index} 고유 본문."}
        for index, heading in enumerate(derived_toc, start=1)
    ]

    output = _build_hwpx(tmp_path, sections, None)
    output_xml = _section_xml(output)

    assert _heading_texts(output_xml)[:3] == derived_toc
    for index in range(1, 4):
        assert output_xml.count(f"NO_TOC_MARKER_{index}") == 1


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_no_sections_preserves_cli_toc_fallback(tmp_path: Path):
    output = _build_hwpx_without_sections(tmp_path, ["개요"])
    output_xml = _section_xml(output)

    assert _heading_texts(output_xml)[0] == "개요"


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_duplicate_headings_keep_all_sections(tmp_path: Path):
    """SPEC-P1b: 같은 heading 의 섹션 2개가 하나로 붕괴되지 않는다 (N→N).
    구현이 dict[heading→body] 였을 때는 뒤 섹션이 앞을 덮어써 본문 하나가
    조용히 소실됐다 — 순서 보존 list + index 바인딩이 이를 제거한다."""
    sections = [
        {"heading": "중복 헤딩", "body": "DUP_ALPHA 고유 본문."},
        {"heading": "중복 헤딩", "body": "DUP_BETA 고유 본문."},
    ]

    output = _build_hwpx(tmp_path, sections, None)
    output_xml = _section_xml(output)

    assert output_xml.count("DUP_ALPHA") == 1
    assert output_xml.count("DUP_BETA") == 1
    assert _heading_texts(output_xml)[:2] == ["중복 헤딩", "중복 헤딩"]


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_unmapped_template_headings_are_blanked(tmp_path: Path):
    """INV-2: toc 를 넘는 템플릿 heading 은 body 처럼 비운다 — 편집기 미리보기에
    없는 헤딩이 다운로드에만 나타나는 preview≠download 를 막는다."""
    toc = ["첫 섹션", "둘째 섹션"]
    sections = [
        {"heading": toc[0], "body": "INV2_A 본문."},
        {"heading": toc[1], "body": "INV2_B 본문."},
    ]

    output = _build_hwpx(tmp_path, sections, None)
    output_xml = _section_xml(output)

    # 채워진 2개 외에 비어 있지 않은 heading 이 남아 있으면 안 된다.
    assert _heading_texts(output_xml) == toc


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


@pytest.mark.skipif(not NO_OUTLINE_FIXTURE.exists(), reason="mapper no-outline fixture missing")
def test_no_outline_usage_falls_back_to_insertion(tmp_path: Path):
    toc = ["무개요 첫 섹션", "무개요 둘째 섹션"]
    sections = [
        {"heading": toc[0], "body": "HC1_NO_OUTLINE_ALPHA 고유 본문."},
        {"heading": toc[1], "body": "HC1_NO_OUTLINE_BETA 고유 본문."},
    ]

    output = _build_hwpx(tmp_path, sections, toc, NO_OUTLINE_FIXTURE)
    output_xml = _section_xml(output)

    assert _heading_texts(output_xml)[:2] == toc
    assert output_xml.count("HC1_NO_OUTLINE_ALPHA") == 1
    assert output_xml.count("HC1_NO_OUTLINE_BETA") == 1
    assert "최신 기술을 접목한 OOOO 시스템" in output_xml


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


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_gonmun_eight_section_build_keeps_all_headings_and_bodies(tmp_path: Path):
    toc = [f"오버플로 섹션 {index}" for index in range(1, 9)]
    sections = [
        {"heading": heading, "body": f"OVF_{index} 고유 본문."}
        for index, heading in enumerate(toc, start=1)
    ]

    output = _build_hwpx(tmp_path, sections, toc)
    output_xml = _section_xml(output)

    assert _heading_texts(output_xml)[: len(toc)] == toc
    for index in range(1, 9):
        assert output_xml.count(f"OVF_{index}") == 1


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_overflow_section_body_splits_into_sentence_paragraphs(tmp_path: Path):
    template_slot_count = len(_heading_texts(_section_xml(GONMUN_TEMPLATE)))
    toc = [f"다문장 섹션 {index}" for index in range(1, template_slot_count + 2)]
    overflow_heading = toc[-1]
    sections = [
        {"heading": heading, "body": f"BASE_SENTENCE_{index}."}
        for index, heading in enumerate(toc, start=1)
    ]
    sections[-1]["body"] = "문장1. 문장2. 문장3."

    output = _build_hwpx(tmp_path, sections, toc)
    output_xml = _section_xml(output)

    assert _body_texts_after_heading(output_xml, overflow_heading) == ["문장1.", "문장2.", "문장3."]


@pytest.mark.skipif(not GONMUN_TEMPLATE.exists(), reason="template missing")
def test_first_overflow_heading_follows_last_template_section_body(tmp_path: Path):
    template_slot_count = len(_heading_texts(_section_xml(GONMUN_TEMPLATE)))
    toc = [f"순서 섹션 {index}" for index in range(1, template_slot_count + 2)]
    last_template_heading = toc[template_slot_count - 1]
    first_overflow_heading = toc[template_slot_count]
    last_template_body_marker = "LAST_TEMPLATE_SECTION_BODY"
    sections = [
        {"heading": heading, "body": f"ORDER_BODY_{index}."}
        for index, heading in enumerate(toc, start=1)
    ]
    sections[template_slot_count - 1]["body"] = f"{last_template_body_marker}."

    output = _build_hwpx(tmp_path, sections, toc)
    output_xml = _section_xml(output)
    paragraph_texts = [text for _, text in _paragraph_texts(output_xml)]

    assert paragraph_texts.index(last_template_heading) < paragraph_texts.index(last_template_body_marker + ".")
    assert paragraph_texts.index(last_template_body_marker + ".") < paragraph_texts.index(first_overflow_heading)
