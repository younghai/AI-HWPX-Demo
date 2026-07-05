"""C1 — 표 셀 치환 (label/value table-cell fill). TDD golden + unit tests.

Locks the design in docs/design-c1-table-cell-fill.md:
  1. label/value pair detection in a 2-column table
  2. value cell filled from docFields (via --doc-fields)
  3. consumed (matched) cells excluded from the title/heading/body index pass
  4. complete no-op when nothing matches (existing behavior preserved)

The fixture is built hermetically from gonmun.hwpx by gen_table_fixture so the
test never depends on a regenerated binary drifting out of sync.
"""
from __future__ import annotations

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pytest

import build_hwpx
from gen_table_fixture import build_table_fixture

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BUILD = REPO_ROOT / "scripts" / "build_hwpx.py"


def _tag(local: str) -> str:
    return f"{{{HP}}}{local}"


def _section_root(hwpx_path: Path) -> ET.Element:
    with zipfile.ZipFile(hwpx_path) as zf:
        return ET.fromstring(zf.read("Contents/section0.xml"))


def _all_texts(root: ET.Element) -> list[str]:
    return [t.text for t in root.iter(_tag("t")) if t.text]


def _form_table(root: ET.Element) -> ET.Element:
    """The injected 2-column label/value table (colCnt='2')."""
    for tbl in root.iter(_tag("tbl")):
        if tbl.get("colCnt") == "2":
            return tbl
    raise AssertionError("no 2-column form table found")


def _cell_text(cell: ET.Element) -> str:
    return "".join(t.text or "" for t in cell.iter(_tag("t")))


def _row_label_value(form: ET.Element) -> list[tuple[str, str]]:
    out = []
    for tr in form.findall(_tag("tr")):
        cells = tr.findall(_tag("tc"))
        out.append((_cell_text(cells[0]), _cell_text(cells[1])))
    return out


# ── unit: label normalization + synonym matching (design step 1) ──────────────
def test_match_field_exact_label():
    fields = [{"key": "attendees", "label": "참석자", "value": "김"}]
    assert build_hwpx._match_field("참석자", fields) is fields[0]


def test_match_field_synonym_substring():
    # a form cell labeled "일시" is a synonym of the "회의 일시" field label
    fields = [{"key": "meetingDate", "label": "회의 일시", "value": "x"}]
    assert build_hwpx._match_field("일시", fields) is fields[0]


def test_match_field_ignores_trailing_colon_and_spaces():
    fields = [{"key": "attendees", "label": "참석자", "value": "김"}]
    assert build_hwpx._match_field(" 참석자 : ", fields) is fields[0]


def test_match_field_no_match_returns_none():
    fields = [{"key": "attendees", "label": "참석자", "value": "김"}]
    assert build_hwpx._match_field("장소", fields) is None


def test_match_field_single_char_does_not_match():
    # guard against trivial 1-char substring matches
    fields = [{"key": "meetingDate", "label": "회의 일시", "value": "x"}]
    assert build_hwpx._match_field("시", fields) is None


# ── unit: fill + consumed set (design steps 2 & 3) ────────────────────────────
def test_apply_label_value_fills_value_and_marks_consumed(tmp_path: Path):
    fx = build_table_fixture(tmp_path / "fx.hwpx")
    root = _section_root(fx)
    fields = [
        {"key": "meetingDate", "label": "회의 일시", "value": "2026-07-03 14:00"},
        {"key": "attendees", "label": "참석자", "value": "김대표, 이과장"},
    ]
    consumed = build_hwpx._apply_label_value_fields(root, fields)

    assert _row_label_value(_form_table(root)) == [
        ("일시", "2026-07-03 14:00"),
        ("참석자", "김대표, 이과장"),
    ]
    # both the label and value paragraph of each matched row are consumed
    assert len(consumed) >= 4
    # consumed holds real <hp:p> elements from the tree
    assert all(el.tag == _tag("p") for el in consumed)


def test_apply_label_value_no_fields_is_noop(tmp_path: Path):
    fx = build_table_fixture(tmp_path / "fx.hwpx")
    root = _section_root(fx)
    before = _all_texts(root)
    consumed = build_hwpx._apply_label_value_fields(root, [])
    assert consumed == set()
    assert _all_texts(root) == before


def test_apply_label_value_unknown_labels_is_noop(tmp_path: Path):
    fx = build_table_fixture(tmp_path / "fx.hwpx")
    root = _section_root(fx)
    before = _all_texts(root)
    # labels that match nothing → value cells untouched, nothing consumed
    consumed = build_hwpx._apply_label_value_fields(
        root, [{"key": "x", "label": "존재하지않는라벨", "value": "V"}]
    )
    assert consumed == set()
    assert _all_texts(root) == before


# ── golden: full CLI build with --doc-fields (design steps 1-4 together) ───────
def test_golden_label_value_fill_end_to_end(tmp_path: Path):
    fx = build_table_fixture(tmp_path / "minutes-form.hwpx")

    sections = [
        {"heading": "회의 개요", "body": "GOLD_BODY_A 개요 본문."},
        {"heading": "결정 사항", "body": "GOLD_BODY_B 결정 본문."},
    ]
    sj = tmp_path / "sections.json"
    sj.write_text(json.dumps(sections, ensure_ascii=False), encoding="utf-8")

    doc_fields = [
        {"key": "meetingDate", "label": "회의 일시", "value": "GOLD_DATE 2026-07-03"},
        {"key": "attendees", "label": "참석자", "value": "GOLD_ATTENDEES 김대표"},
    ]
    df = tmp_path / "docfields.json"
    df.write_text(json.dumps(doc_fields, ensure_ascii=False), encoding="utf-8")

    out = tmp_path / "out.hwpx"
    r = subprocess.run(
        [sys.executable, str(BUILD),
         "--template", "gonmun", "--template-file", str(fx), "--output", str(out),
         "--title", "GOLD_TITLE", "--toc", "회의 개요\n결정 사항",
         "--sections-json", str(sj), "--doc-fields", str(df),
         "--doc-date", "2026.01.01"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr

    with zipfile.ZipFile(out) as zf:
        sec = zf.read("Contents/section0.xml").decode("utf-8")
    root = ET.fromstring(sec.encode("utf-8"))
    form = _form_table(root)

    # (2) value cells filled EXACTLY from docFields; (1) labels unchanged.
    #     Exact equality proves no AI body leaked in and no duplication (R6).
    assert _row_label_value(form) == [
        ("일시", "GOLD_DATE 2026-07-03"),
        ("참석자", "GOLD_ATTENDEES 김대표"),
    ]
    # table structure preserved (2 gonmun tables + 1 injected form, 10 cells)
    assert sec.count("<hp:tbl") == 3
    assert sec.count("<hp:tc") == 10
    # (3) existing title/heading/body index mapping is unaffected
    assert "GOLD_TITLE" in sec
    assert "GOLD_BODY_A" in sec and "GOLD_BODY_B" in sec
    # docField values must NOT bleed into the body prose, nor vice versa
    assert sec.count("GOLD_DATE 2026-07-03") == 1
    assert sec.count("GOLD_ATTENDEES 김대표") == 1


def test_golden_no_doc_fields_leaves_value_cells_empty(tmp_path: Path):
    """Without --doc-fields the build still succeeds and fills nothing (no-op)."""
    fx = build_table_fixture(tmp_path / "minutes-form.hwpx")
    sections = [{"heading": "회의 개요", "body": "NOFILL_BODY 본문."}]
    sj = tmp_path / "sections.json"
    sj.write_text(json.dumps(sections, ensure_ascii=False), encoding="utf-8")
    out = tmp_path / "out.hwpx"
    r = subprocess.run(
        [sys.executable, str(BUILD),
         "--template", "gonmun", "--template-file", str(fx), "--output", str(out),
         "--title", "T", "--toc", "회의 개요",
         "--sections-json", str(sj), "--doc-date", "2026.01.01"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr
    root = _section_root(out)
    # value cells remain empty; labels intact
    assert _row_label_value(_form_table(root)) == [("일시", ""), ("참석자", "")]
