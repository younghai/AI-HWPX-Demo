"""Regression suite locking in the pipeline invariants that have broken before.

Maps to review findings PY-01..PY-04 and CLAUDE.md rules R5/R6/R7.
Runnable offline; the diagram tests do NOT require cairosvg (they check the SVG
string is well-formed XML, which is exactly the property that used to break).
"""
from __future__ import annotations

import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pytest

import build_hwpx
import diagram_templates as diag
import hwpx_utils

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEMPLATE = REPO_ROOT / "templates" / "gonmun.hwpx"

HOSTILE = 'R&D <b>x</b> & "q" \'z\' < >'


# ── PY-01 / R7: diagram text must be escaped → well-formed SVG ────────────────
def test_flowchart_hostile_text_is_well_formed():
    svg = diag.flowchart([HOSTILE, "A & B"], title="T & <x>")
    ET.fromstring(svg)  # raises if malformed — the exact failure PY-01 describes


def test_timeline_hostile_text_is_well_formed():
    svg = diag.timeline([{"label": HOSTILE, "date": "2024 <&>"}], title="타임 & 라인")
    ET.fromstring(svg)


def test_comparison_hostile_text_is_well_formed():
    svg = diag.comparison(
        [{"label": HOSTILE, "a": '현재 "1"', "b": "개선 & 2", "header_a": "A<", "header_b": "B&"}],
        title="비교 & 표",
    )
    ET.fromstring(svg)


def test_render_diagram_embeds_ampersand_literally_escaped():
    svg = diag.comparison([{"label": "R&D", "a": "x", "b": "y"}], title="")
    assert "R&amp;D" in svg
    assert "R&D" not in svg.replace("R&amp;D", "")  # no raw unescaped ampersand


# ── PY-02 / R6: sections JSON headings/bodies are NFC-normalized ──────────────
def test_load_sections_normalizes_nfd_heading(tmp_path: Path):
    nfd_heading = unicodedata.normalize("NFD", "서비스 추진 배경")
    p = tmp_path / "s.json"
    p.write_text(
        f'[{{"heading": {__import__("json").dumps(nfd_heading)}, "body": "본문"}}]',
        encoding="utf-8",
    )
    sections, _ = build_hwpx.load_sections_body(str(p))
    nfc_heading = unicodedata.normalize("NFC", "서비스 추진 배경")
    assert nfc_heading in sections
    assert sections[nfc_heading] == "본문"


# ── PY-04: malformed sections JSON raises (not silent empty doc) ──────────────
def test_load_sections_bad_json_raises(tmp_path: Path):
    p = tmp_path / "bad.json"
    p.write_text("not json", encoding="utf-8")
    with pytest.raises(build_hwpx.SectionsParseError):
        build_hwpx.load_sections_body(str(p))


def test_load_sections_non_array_raises(tmp_path: Path):
    p = tmp_path / "obj.json"
    p.write_text('{"heading": "x"}', encoding="utf-8")
    with pytest.raises(build_hwpx.SectionsParseError):
        build_hwpx.load_sections_body(str(p))


def test_load_sections_none_path_returns_empty():
    assert build_hwpx.load_sections_body(None) == (None, [])


# ── PY-03: pack_hwpx writes atomically, leaves no .tmp ────────────────────────
def test_pack_hwpx_atomic_no_tmp_leftover(tmp_path: Path):
    src = tmp_path / "src"
    (src / "Contents").mkdir(parents=True)
    (src / "mimetype").write_text("application/hwp+zip", encoding="utf-8")
    (src / "Contents" / "a.xml").write_text("<root/>", encoding="utf-8")

    out = tmp_path / "out.hwpx"
    hwpx_utils.pack_hwpx(src, out)

    assert out.exists()
    with zipfile.ZipFile(out) as zf:
        assert zf.namelist()[0] == "mimetype"  # OCF: mimetype first
        assert zf.testzip() is None
    assert not list(tmp_path.glob(".out.hwpx*.tmp"))  # temp cleaned up


# ── PY-05: unpack rejects hostile archives (traversal + zip bomb) ────────────
def test_unpack_rejects_path_traversal(tmp_path: Path):
    evil = tmp_path / "evil.zip"
    with zipfile.ZipFile(evil, "w") as zf:
        zf.writestr("../escape.txt", "pwned")
    with pytest.raises(ValueError):
        hwpx_utils.unpack_hwpx(evil, tmp_path / "dest")


def test_unpack_rejects_too_many_entries(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(hwpx_utils, "MAX_ZIP_ENTRIES", 3)
    bomb = tmp_path / "many.zip"
    with zipfile.ZipFile(bomb, "w") as zf:
        for i in range(5):
            zf.writestr(f"f{i}.txt", "x")
    with pytest.raises(ValueError):
        hwpx_utils.unpack_hwpx(bomb, tmp_path / "dest")


def test_unpack_rejects_oversize(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(hwpx_utils, "MAX_UNCOMPRESSED_BYTES", 100)
    bomb = tmp_path / "big.zip"
    with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("big.txt", "A" * 5000)  # compresses tiny, expands past the cap
    with pytest.raises(ValueError):
        hwpx_utils.unpack_hwpx(bomb, tmp_path / "dest")


# ── PY-07: XXE / entity-expansion parsing is blocked by defusedxml ───────────
def test_safe_parse_blocks_entity_expansion(tmp_path: Path):
    pytest.importorskip("defusedxml")
    billion = tmp_path / "lol.xml"
    billion.write_text(
        '<?xml version="1.0"?>'
        '<!DOCTYPE lolz [<!ENTITY lol "lol">'
        '<!ENTITY lol2 "&lol;&lol;&lol;">]>'
        '<root>&lol2;</root>',
        encoding="utf-8",
    )
    from defusedxml.common import EntitiesForbidden
    with pytest.raises(EntitiesForbidden):
        build_hwpx._safe_parse(str(billion))


# ── R5: _normalize_paragraph collapses to a single text run + single lineseg ──
def _make_para_with_two_runs_and_segs() -> ET.Element:
    p = ET.Element(f"{{{HP}}}p")
    for txt in ("first", "stale-second"):
        run = ET.SubElement(p, f"{{{HP}}}run")
        t = ET.SubElement(run, f"{{{HP}}}t")
        t.text = txt
    seg_array = ET.SubElement(p, f"{{{HP}}}linesegarray")
    for pos in ("0", "10"):
        ET.SubElement(seg_array, f"{{{HP}}}lineseg", {"textpos": pos})
    return p


def test_normalize_paragraph_single_run_and_lineseg():
    p = _make_para_with_two_runs_and_segs()
    build_hwpx._normalize_paragraph(p, "새 텍스트")

    runs = p.findall(f"{{{HP}}}run")
    assert len(runs) == 1
    t_nodes = runs[0].findall(f"{{{HP}}}t")
    assert len(t_nodes) == 1
    assert t_nodes[0].text == "새 텍스트"

    segs = p.find(f"{{{HP}}}linesegarray").findall(f"{{{HP}}}lineseg")
    assert len(segs) == 1
    assert segs[0].get("textpos") == "0"


# ── R6: full-build section↔slot parity using the real template ───────────────
@pytest.mark.skipif(not TEMPLATE.exists(), reason="template missing")
def test_build_parity_fills_bodies_no_placeholder_leak(tmp_path: Path):
    import json

    sections = [
        {"heading": "서비스 추진 배경", "body": "MARKER_ALPHA 고유 본문."},
        {"heading": "기대 효과", "body": "MARKER_BETA 두번째 본문."},
    ]
    sj = tmp_path / "sections.json"
    sj.write_text(json.dumps(sections, ensure_ascii=False), encoding="utf-8")
    out = tmp_path / "out.hwpx"

    import subprocess
    import sys as _sys

    result = subprocess.run(
        [_sys.executable, str(REPO_ROOT / "scripts" / "build_hwpx.py"),
         "--template", "gonmun", "--output", str(out),
         "--title", "테스트 제목", "--toc", "서비스 추진 배경\n기대 효과",
         "--sections-json", str(sj)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert out.exists()

    with zipfile.ZipFile(out) as zf:
        section_xml = zf.read("Contents/section0.xml").decode("utf-8")

    assert "MARKER_ALPHA" in section_xml
    assert "MARKER_BETA" in section_xml
    # R6: template's own sample sentence must not leak through (no placeholder bleed)
    assert "시장 내 경쟁력" not in section_xml


# ── B1: client pre-rendered diagram PNG is used byte-for-byte ─────────────────
def _make_png(path: Path) -> bytes:
    import struct, zlib
    w = h = 8
    raw = b"".join(b"\x00" + b"\x10\x20\x30" * w for _ in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    return png


def test_diagram_png_bytes_prefers_client_png(tmp_path: Path):
    """A client _pngPath is embedded byte-for-byte, no cairosvg needed (B1)."""
    p = tmp_path / "client.png"
    original = _make_png(p)
    spec = {"type": "flowchart", "data": ["a"], "_pngPath": str(p)}
    assert build_hwpx._diagram_png_bytes(spec) == original


def test_diagram_png_bytes_rejects_bogus_pngpath(tmp_path: Path):
    """A non-PNG _pngPath is not used; falls back to server render (None w/o cairo)."""
    bad = tmp_path / "notpng.png"
    bad.write_bytes(b"not a real png at all")
    spec = {"type": "flowchart", "data": ["a"], "_pngPath": str(bad)}
    out = build_hwpx._diagram_png_bytes(spec)
    # Either cairosvg rendered a real PNG (if installed) or nothing (skip) — never
    # the bogus bytes.
    assert out is None or out[:8] == b"\x89PNG\r\n\x1a\n"


# ── PY-P2: --doc-date makes output deterministic ─────────────────────────────
@pytest.mark.skipif(not TEMPLATE.exists(), reason="template missing")
def test_doc_date_is_deterministic(tmp_path: Path):
    import subprocess
    import sys as _sys

    def build(out):
        r = subprocess.run(
            [_sys.executable, str(REPO_ROOT / "scripts" / "build_hwpx.py"),
             "--template", "gonmun", "--output", str(out),
             "--title", "결정성", "--toc", "개요", "--doc-date", "2026.01.01"],
            capture_output=True, text=True,
        )
        assert r.returncode == 0, r.stdout + r.stderr
        with zipfile.ZipFile(out) as zf:
            return zf.read("Contents/section0.xml").decode("utf-8")

    a = build(tmp_path / "a.hwpx")
    b = build(tmp_path / "b.hwpx")
    # Same fixed date → identical section content (no now()-driven drift).
    assert a == b
    assert "2026.01.01" in a
