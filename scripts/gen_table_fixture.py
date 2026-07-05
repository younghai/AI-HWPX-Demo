#!/usr/bin/env python3
"""Build a minimal, format-valid HWPX fixture with a 2-column label/value table.

The bundled gonmun.hwpx only has 1-column tables, so there is no fixture that
exercises the "표 셀 치환" (label/value form-filling) path designed in
docs/design-c1-table-cell-fill.md. This script derives one from gonmun.hwpx by
injecting ONE extra table — a 회의록-style form:

    | 일시   | (empty value cell) |
    | 참석자 | (empty value cell) |

Every structural piece (the wrapping <hp:p>/<hp:run>, the <hp:tc> cells,
linesegarray, cellAddr/cellSpan/cellSz) is CLONED from real gonmun elements, so
the result is guaranteed format-valid rather than hand-authored XML. The rest of
the document (title-in-cell, section headings, body slots) is inherited
untouched, so the same fixture also proves the existing index mapping survives.

Labels are known minutes docFields (docTypes.js): "일시" is a synonym of the
"회의 일시" (meetingDate) field; "참석자" matches the attendees field exactly.

Usage:
    python3 scripts/gen_table_fixture.py            # writes testdata/minutes-form.hwpx

Import:
    from gen_table_fixture import build_table_fixture
    build_table_fixture(Path("/tmp/minutes-form.hwpx"))
"""
from __future__ import annotations

import copy
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OFFICE_DIR = SCRIPT_DIR / "office"
for _p in (SCRIPT_DIR, OFFICE_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

# Importing build_hwpx registers the hp/hs/hc/... namespace prefixes on ET so the
# re-serialized section keeps proper prefixes instead of ns0:/ns1:.
import build_hwpx  # noqa: F401  (side effect: ET.register_namespace)
from hwpx_utils import unpack_hwpx

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"

# Fixed timestamp so the committed fixture is byte-identical on every regenerate.
# (The production pack_hwpx stores live mtimes, which is fine for served files but
# would make this committed test artifact churn in git on every run.)
_FIXED_ZIP_DATE = (2026, 1, 1, 0, 0, 0)

SOURCE_TEMPLATE = REPO_ROOT / "templates" / "gonmun.hwpx"
DEFAULT_DEST = REPO_ROOT / "testdata" / "minutes-form.hwpx"

# (label cell text, value cell text). Value cells are intentionally empty — the
# fixture is a blank form; the pipeline fills them from docFields.
FORM_ROWS = [
    ("일시", ""),
    ("참석자", ""),
]


def _tag(local: str) -> str:
    return f"{{{HP}}}{local}"


def _deterministic_pack(source_dir: Path, output_file: Path) -> None:
    """Zip source_dir into an HWPX with fixed timestamps/attrs → stable bytes.

    mimetype is stored first and uncompressed per the OCF spec; every other entry
    is deflated in sorted path order so the output is reproducible."""
    source_dir = Path(source_dir).resolve()
    entries = sorted(
        (p for p in source_dir.rglob("*") if p.is_file()),
        key=lambda p: (p.name != "mimetype", p.relative_to(source_dir).as_posix()),
    )
    with ZipFile(output_file, "w") as archive:
        for path in entries:
            arcname = path.relative_to(source_dir).as_posix()
            info = ZipInfo(arcname, date_time=_FIXED_ZIP_DATE)
            info.compress_type = ZIP_STORED if arcname == "mimetype" else ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())


def _set_cell_text(cell: ET.Element, text: str) -> None:
    """Set the cell's first paragraph/run text. Empty text leaves an empty run
    (a blank, fillable value cell)."""
    p = cell.find(f".//{_tag('p')}")
    run = p.find(_tag("run"))
    t = run.find(_tag("t"))
    if text:
        if t is None:
            t = ET.SubElement(run, _tag("t"))
        t.text = text
    elif t is not None:
        # ensure the value cell starts blank
        run.remove(t)


def build_table_fixture(dest: Path, source: Path = SOURCE_TEMPLATE) -> Path:
    """Write a label/value-table HWPX fixture derived from `source` to `dest`.

    Returns the destination path. Deterministic: same inputs → same bytes.
    """
    dest = Path(dest)
    with tempfile.TemporaryDirectory(prefix="table-fixture-") as tmp:
        working = Path(tmp)
        unpack_hwpx(source, working)
        section_path = working / "Contents" / "section0.xml"

        tree = ET.parse(section_path)
        root = tree.getroot()
        parent_of = {child: parent for parent in root.iter() for child in parent}

        first_tbl = root.find(f".//{_tag('tbl')}")
        if first_tbl is None:
            raise RuntimeError("source template has no table to clone from")

        # The <hp:p> that wraps the table (tables live inside a run inside a p).
        table_para = first_tbl
        while table_para is not None and table_para.tag != _tag("p"):
            table_para = parent_of.get(table_para)
        if table_para is None:
            raise RuntimeError("could not locate the table's wrapping paragraph")

        # A pristine empty single-paragraph cell to clone for every form cell.
        base_cell = first_tbl.find(f".//{_tag('tc')}")
        if base_cell is None:
            raise RuntimeError("source table has no cell to clone from")

        # Clone the whole table paragraph, then rebuild its table as a 2-col form.
        new_para = copy.deepcopy(table_para)
        new_tbl = new_para.find(f".//{_tag('tbl')}")
        for tr in new_tbl.findall(_tag("tr")):
            new_tbl.remove(tr)
        new_tbl.set("colCnt", "2")
        new_tbl.set("rowCnt", str(len(FORM_ROWS)))

        for row_idx, (label, value) in enumerate(FORM_ROWS):
            tr = ET.SubElement(new_tbl, _tag("tr"))
            for col_idx, text in enumerate((label, value)):
                cell = copy.deepcopy(base_cell)
                addr = cell.find(_tag("cellAddr"))
                addr.set("colAddr", str(col_idx))
                addr.set("rowAddr", str(row_idx))
                sz = cell.find(_tag("cellSz"))
                if sz is not None:
                    sz.set("width", "23670")  # split the 47341 total across 2 cols
                _set_cell_text(cell, text)
                tr.append(cell)

        section_parent = parent_of[table_para]
        insert_idx = list(section_parent).index(table_para) + 1
        section_parent.insert(insert_idx, new_para)

        tree.write(section_path, encoding="utf-8", xml_declaration=True)

        dest.parent.mkdir(parents=True, exist_ok=True)
        _deterministic_pack(working, dest)
    return dest


def main() -> None:
    out = build_table_fixture(DEFAULT_DEST)
    print(f"✓ wrote {out.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
