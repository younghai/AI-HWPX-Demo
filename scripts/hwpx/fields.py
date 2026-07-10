from __future__ import annotations

import unicodedata
import xml.etree.ElementTree as ET

from hwpx.namespaces import HP
from hwpx.paragraphs import _normalize_paragraph


def _normalize_field_label(text: str) -> str:
    s = unicodedata.normalize("NFC", text or "").strip()
    for ch in (":", "：", "·", ".", " "):
        s = s.replace(ch, "")
    return s


def _match_field(cell_label: str, fields: list[dict]) -> dict | None:
    cl = _normalize_field_label(cell_label)
    if len(cl) < 2:
        return None
    for field in fields:
        fl = _normalize_field_label(field.get("label", ""))
        if len(fl) < 2:
            continue
        if cl == fl or cl in fl or fl in cl:
            return field
    return None


def _cell_first_text(cell: ET.Element) -> str:
    for t in cell.iter(f"{{{HP}}}t"):
        if t.text and t.text.strip():
            return t.text.strip()
    return ""


def _cell_fill_paragraph(cell: ET.Element) -> ET.Element | None:
    return cell.find(f".//{{{HP}}}p")


def _apply_label_value_fields(
    root: ET.Element, fields: list[dict] | None
) -> set[ET.Element]:
    consumed: set[ET.Element] = set()
    if not fields:
        return consumed

    for tbl in root.iter(f"{{{HP}}}tbl"):
        for tr in tbl.findall(f"{{{HP}}}tr"):
            cells = tr.findall(f"{{{HP}}}tc")
            if len(cells) < 2:
                continue
            for i in range(len(cells) - 1):
                field = _match_field(_cell_first_text(cells[i]), fields)
                if field is None:
                    continue
                value = field.get("value", "")
                if not value:
                    continue
                value_p = _cell_fill_paragraph(cells[i + 1])
                if value_p is None:
                    continue
                _normalize_paragraph(value_p, value)
                for cell in (cells[i], cells[i + 1]):
                    for p in cell.iter(f"{{{HP}}}p"):
                        consumed.add(p)
                break
    return consumed
