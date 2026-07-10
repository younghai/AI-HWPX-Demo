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


def load_sections_body(json_path: str | None) -> tuple[dict[str, str] | None, list[dict]]:
    """Returns (sections_body_dict, diagrams_list).

    Headings and bodies are NFC-normalized so lookups against the NFC-normalized
    TOC (see main()) succeed even when the source JSON carries NFD text — which
    happens on macOS, where filenames and pasted text are NFD by default. Without
    this, an NFD heading would fail the toc[i] lookup and the section body would
    be cleared to empty. See CLAUDE.md R6 / review PY-02.
    """
    if not json_path:
        return None, []
    try:
        data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SectionsParseError(f"sections JSON을 읽을 수 없습니다: {exc}") from exc
    if not isinstance(data, list):
        raise SectionsParseError("sections JSON 최상위가 배열이 아닙니다.")
    sections = {
        unicodedata.normalize("NFC", s["heading"]): unicodedata.normalize("NFC", s["body"])
        for s in data
        if isinstance(s, dict) and "heading" in s and "body" in s
    }
    diagrams = [d for d in data if isinstance(d, dict) and d.get("_diagram") is True]
    return sections, diagrams


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
