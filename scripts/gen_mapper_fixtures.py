#!/usr/bin/env python3
from __future__ import annotations

import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OFFICE_DIR = SCRIPT_DIR / "office"
for path in (SCRIPT_DIR, OFFICE_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import build_hwpx  # noqa: E402
from hwpx_utils import unpack_hwpx  # noqa: E402

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"

SOURCE_TEMPLATE = REPO_ROOT / "templates" / "gonmun.hwpx"
NO_OUTLINE_DEST = REPO_ROOT / "testdata" / "mapper-no-outline.hwpx"
SLOTLESS_DEST = REPO_ROOT / "testdata" / "mapper-slotless-heading.hwpx"
FIXED_ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def _tag(local: str) -> str:
    return f"{{{HP}}}{local}"


def _deterministic_pack(source_dir: Path, output_file: Path) -> None:
    entries = sorted(
        (path for path in source_dir.rglob("*") if path.is_file()),
        key=lambda path: (path.name != "mimetype", path.relative_to(source_dir).as_posix()),
    )
    with ZipFile(output_file, "w") as archive:
        for path in entries:
            arcname = path.relative_to(source_dir).as_posix()
            info = ZipInfo(arcname, date_time=FIXED_ZIP_DATE)
            info.compress_type = ZIP_STORED if arcname == "mimetype" else ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())


def _most_common_body_style(root: ET.Element, heading_ids: frozenset[str]) -> str:
    counts: Counter[str] = Counter()
    for paragraph in root.iter(_tag("p")):
        style_id = paragraph.get("styleIDRef", "0")
        if style_id in heading_ids:
            continue
        if build_hwpx._paragraph_has_direct_text(paragraph):
            counts[style_id] += 1
    if not counts:
        raise RuntimeError("source template has no body-style text paragraph")
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]


def _load_section(working_dir: Path) -> tuple[ET.ElementTree, ET.Element, frozenset[str]]:
    header_path = working_dir / "Contents" / "header.xml"
    section_path = working_dir / "Contents" / "section0.xml"
    tree = ET.parse(section_path)
    return tree, tree.getroot(), build_hwpx.detect_heading_style_ids(header_path)


def _write_section(working_dir: Path, tree: ET.ElementTree) -> None:
    tree.write(working_dir / "Contents" / "section0.xml", encoding="utf-8", xml_declaration=True)


def build_no_outline_fixture(dest: Path = NO_OUTLINE_DEST, source: Path = SOURCE_TEMPLATE) -> Path:
    with tempfile.TemporaryDirectory(prefix="mapper-no-outline-") as tmp:
        working = Path(tmp)
        unpack_hwpx(source, working)
        tree, root, heading_ids = _load_section(working)
        body_style_id = _most_common_body_style(root, heading_ids)

        for paragraph in root.iter(_tag("p")):
            if paragraph.get("styleIDRef", "0") in heading_ids:
                paragraph.set("styleIDRef", body_style_id)

        _write_section(working, tree)
        dest.parent.mkdir(parents=True, exist_ok=True)
        _deterministic_pack(working, dest)
    return dest


def _classify_sections(root: ET.Element, heading_ids: frozenset[str]) -> list[dict[str, ET.Element | list[ET.Element]]]:
    sections: list[dict[str, ET.Element | list[ET.Element]]] = []
    current: dict[str, ET.Element | list[ET.Element]] | None = None
    for paragraph in root.iter(_tag("p")):
        if not build_hwpx._paragraph_has_direct_text(paragraph):
            continue
        if paragraph.get("styleIDRef", "0") in heading_ids:
            if current is not None:
                sections.append(current)
            current = {"heading_p": paragraph, "body_ps": []}
            continue
        if current is not None:
            body_ps = current["body_ps"]
            if not isinstance(body_ps, list):
                raise RuntimeError("invalid section body list")
            body_ps.append(paragraph)
    if current is not None:
        sections.append(current)
    return sections


def build_slotless_heading_fixture(dest: Path = SLOTLESS_DEST, source: Path = SOURCE_TEMPLATE) -> Path:
    with tempfile.TemporaryDirectory(prefix="mapper-slotless-") as tmp:
        working = Path(tmp)
        unpack_hwpx(source, working)
        tree, root, heading_ids = _load_section(working)
        sections = _classify_sections(root, heading_ids)
        if len(sections) < 3:
            raise RuntimeError("source template needs at least three heading sections")

        blanked = 0
        for section in sections[:2]:
            body_ps = section["body_ps"]
            if not isinstance(body_ps, list) or not body_ps:
                continue
            for paragraph in body_ps:
                build_hwpx._normalize_paragraph(paragraph, "")
            blanked += 1
        if blanked < 2:
            raise RuntimeError("could not blank two body-bearing heading sections")

        _write_section(working, tree)
        dest.parent.mkdir(parents=True, exist_ok=True)
        _deterministic_pack(working, dest)
    return dest


def build_mapper_fixtures() -> tuple[Path, Path]:
    no_outline = build_no_outline_fixture()
    slotless = build_slotless_heading_fixture()
    return no_outline, slotless


def main() -> None:
    for path in build_mapper_fixtures():
        print(f"wrote {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
