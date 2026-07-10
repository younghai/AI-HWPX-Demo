from __future__ import annotations

import json
import logging
import unicodedata
from pathlib import Path


class SectionsParseError(Exception):
    """Raised when a sections JSON file was provided but could not be parsed.

    Distinct from "no file provided" so the caller can surface a real failure
    instead of silently generating a document with empty bodies.
    """


def load_sections_body(json_path: str | None) -> tuple[list[dict] | None, list[dict]]:
    """Returns (section_items, diagrams_list).

    section_items is an ORDER-PRESERVING list of {"heading", "body"[, "id"]}
    (SPEC-P1b). A list — not a heading-keyed dict — so two sections with the
    same heading stay two sections; the old dict silently collapsed duplicates,
    dropping one body and breaking the "N sections in → N sections out"
    invariant (CLAUDE.md R6). Binding to template slots is by index, matching
    the toc the caller derives from this same list.

    Headings and bodies are NFC-normalized so the text written into the
    document (and matched by diagram anchors) is consistent even when the
    source JSON carries NFD text — which happens on macOS, where filenames and
    pasted text are NFD by default. See CLAUDE.md R6 / review PY-02.
    """
    if not json_path:
        return None, []
    try:
        data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SectionsParseError(f"sections JSON을 읽을 수 없습니다: {exc}") from exc
    if not isinstance(data, list):
        raise SectionsParseError("sections JSON 최상위가 배열이 아닙니다.")
    items: list[dict] = []
    for s in data:
        if not (isinstance(s, dict) and "heading" in s and "body" in s):
            continue
        item = {
            "heading": unicodedata.normalize("NFC", str(s["heading"])),
            "body": unicodedata.normalize("NFC", str(s["body"])),
        }
        sid = s.get("id")
        if isinstance(sid, str) and sid.strip():
            item["id"] = sid.strip()
        items.append(item)
    diagrams = [d for d in data if isinstance(d, dict) and d.get("_diagram") is True]
    return items, diagrams


def load_doc_fields(json_path: str | None) -> list[dict]:
    if not json_path:
        return []
    try:
        data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logging.warning("load_doc_fields: could not read %s: %s", json_path, exc)
        return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        label = unicodedata.normalize("NFC", str(item.get("label", ""))).strip()
        value = unicodedata.normalize("NFC", str(item.get("value", ""))).strip()
        if label and value:
            out.append({"key": str(item.get("key", "")), "label": label, "value": value})
    return out
