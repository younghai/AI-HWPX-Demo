from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime
from pathlib import Path

from hwpx.eltree import ParentIndex
from hwpx.fields import _apply_label_value_fields
from hwpx.namespaces import HH, HP, _safe_parse
from hwpx.paragraphs import (
    _clone_paragraph_for_text,
    _direct_text_first,
    _normalize_paragraph,
    _paragraph_has_direct_text,
    _split_body_sentences,
)


# 레벨1 헤딩을 나타내는 스타일 이름 패턴 (소문자 비교)
_HEADING1_PATTERNS = [
    "레벨1", "level 1", "level1", "heading 1", "heading1",
    "제목 1", "제목1", "개요 제목", "outline heading",
]


def detect_heading_style_ids(header_xml: Path) -> frozenset[str]:
    """header.xml 의 스타일 이름을 분석해 섹션 헤딩에 해당하는 styleIDRef 집합을 반환합니다.
    인식 불가 시 {'1'} 을 기본값으로 반환합니다."""
    try:
        tree = _safe_parse(header_xml)
        root = tree.getroot()
        ids: set[str] = set()
        for style in root.findall(f".//{{{HH}}}style"):
            name = style.get("name", "").lower().strip()
            eng = style.get("engName", "").lower().strip()
            combined = name + " " + eng
            if any(pattern in combined for pattern in _HEADING1_PATTERNS):
                sid = style.get("id", "")
                if sid:
                    ids.add(sid)
        return frozenset(ids) if ids else frozenset({"1"})
    except Exception as exc:
        logging.warning("detect_heading_style_ids failed: %s", exc)
        return frozenset({"1"})


def _insert_sections_after(
    index: ParentIndex,
    anchor_para: ET.Element,
    pairs: list[tuple[str, str]],
    body_template: ET.Element,
    heading_style_id: str | None,
) -> ET.Element:
    """anchor_para 뒤에 (heading, body) 쌍들을 heading+본문문장 문단으로 삽입."""
    cur = anchor_para
    for section_name, body in pairs:
        heading_clone = _clone_paragraph_for_text(body_template, section_name)
        if heading_style_id is not None:
            heading_clone.set("styleIDRef", heading_style_id)
        cur = index.insert_after(cur, heading_clone)
        for sentence in _split_body_sentences(body):
            cur = index.insert_after(cur, _clone_paragraph_for_text(body_template, sentence))
    return cur


def apply_smart_replacements(
    working_dir: Path,
    title: str,
    toc: list[str],
    source_document: str,
    section_items: list[dict] | None = None,
    doc_date: str | None = None,
    doc_fields: list[dict] | None = None,
) -> None:
    """Two-pass replacement that maps AI-generated content to template
    sections by INDEX, then normalizes each paragraph to remove stale
    runs/positioning that cause visual overlap.

    section_items is the order-preserving [{heading, body[, id]}] list from
    hwpx.io.load_sections_body; the caller derives toc from the same list, so
    toc[i] and section_items[i] describe the same section by construction —
    duplicate headings therefore stay distinct sections (SPEC-P1b)."""
    header_path = working_dir / "Contents" / "header.xml"
    section_path = working_dir / "Contents" / "section0.xml"

    heading_ids = detect_heading_style_ids(header_path)
    # Deterministic when --doc-date is supplied; otherwise today (review PY-P2).
    now_label = doc_date or datetime.now().strftime("%Y.%m.%d")

    tree = _safe_parse(section_path)
    root = tree.getroot()

    # Parent map + insertion bookkeeping (ET has no parent pointers).
    index = ParentIndex(root)

    consumed_paras = _apply_label_value_fields(root, doc_fields)

    # Pass 1: classify each paragraph
    # Skip wrapper paragraphs (whose text lives inside nested tables) by
    # requiring a direct text-only run with non-empty text.
    title_para: ET.Element | None = None
    meta_para: ET.Element | None = None
    sections: list[dict] = []  # [{'heading_p', 'body_ps'}]
    current: dict | None = None

    for p in root.iter(f"{{{HP}}}p"):
        if p in consumed_paras:
            continue
        if not _paragraph_has_direct_text(p):
            continue
        style_id = p.get("styleIDRef", "0")
        text_first = _direct_text_first(p)

        if title_para is None:
            title_para = p
            continue
        if meta_para is None and text_first.startswith("<"):
            meta_para = p
            continue
        if style_id in heading_ids:
            if current is not None:
                sections.append(current)
            current = {'heading_p': p, 'body_ps': []}
            continue
        if current is not None:
            current['body_ps'].append(p)

    if current is not None:
        sections.append(current)

    non_heading_style_counts: Counter[str] = Counter()
    for p in root.iter(f"{{{HP}}}p"):
        if p in consumed_paras:
            continue
        if not _paragraph_has_direct_text(p):
            continue
        style_id = p.get("styleIDRef", "0")
        if style_id not in heading_ids:
            non_heading_style_counts[style_id] += 1
    body_style_id = "0"
    if non_heading_style_counts:
        body_style_id = sorted(non_heading_style_counts.items(), key=lambda item: (-item[1], item[0]))[0][0]

    # Pass 2: replace
    if title_para is not None:
        _normalize_paragraph(title_para, title)
    if meta_para is not None:
        _normalize_paragraph(meta_para, f"<원본문서 : {source_document}, {now_label}>")

    items = section_items or []

    def _body_at(k: int) -> str:
        return items[k]["body"] if k < len(items) else ""

    if not sections and toc:
        anchor_para = meta_para or title_para
        parent = index.parent_of(anchor_para) if anchor_para is not None else None
        body_template: ET.Element | None = None
        for p in root.iter(f"{{{HP}}}p"):
            if p in consumed_paras:
                continue
            if not _paragraph_has_direct_text(p):
                continue
            if p.get("styleIDRef", "0") == body_style_id:
                body_template = p
                break
        if body_template is None:
            for p in root.iter(f"{{{HP}}}p"):
                if p in consumed_paras:
                    continue
                if _paragraph_has_direct_text(p):
                    body_template = p
                    break
        if parent is not None and body_template is not None and anchor_para is not None:
            heading_style_id = sorted(heading_ids)[0] if heading_ids else None
            _insert_sections_after(
                index,
                anchor_para,
                [(toc[k], _body_at(k)) for k in range(len(toc))],
                body_template,
                heading_style_id,
            )

    last_section_anchor: ET.Element | None = None
    for i, sec in enumerate(sections):
        if i >= len(toc):
            break
        section_name = toc[i]

        # Replace heading text with TOC entry
        _normalize_paragraph(sec['heading_p'], section_name)

        # Pull AI body text by INDEX — toc[i] and items[i] come from the same
        # ordered list (run() derives toc from section_items), so the binding
        # cannot diverge and duplicate headings keep their own bodies.
        ai_body = _body_at(i)
        sentences = _split_body_sentences(ai_body)

        body_ps = sec['body_ps']
        body_count = len(body_ps)
        section_anchor = body_ps[-1] if body_ps else sec['heading_p']

        if sentences and body_count == 0:
            template_body: ET.Element | None = None
            style_override: str | None = None
            for other_index, other_sec in enumerate(sections):
                if other_index == i:
                    continue
                other_body_ps = other_sec['body_ps']
                if other_body_ps:
                    template_body = other_body_ps[0]
                    break
            if template_body is None:
                template_body = sec['heading_p']
                style_override = body_style_id
            if index.parent_of(sec['heading_p']) is not None:
                cur = sec['heading_p']
                for sentence in sentences:
                    clone = _clone_paragraph_for_text(template_body, sentence)
                    if style_override is not None:
                        clone.set("styleIDRef", style_override)
                    cur = index.insert_after(cur, clone)
                section_anchor = cur
            last_section_anchor = section_anchor
            continue

        # Distribute AI sentences 1:1 across body paragraphs.
        # - sentences > slots: clone the last body paragraph for the overflow (below)
        # - sentences < slots: fill first N, clear the remaining body slots (so the
        #   output contains only what the preview shows — no duplicated sentences
        #   and no template placeholder text bleeding through)
        for body_p, sentence in zip(body_ps, sentences):
            _normalize_paragraph(body_p, sentence)
        if body_count > len(sentences):
            for extra_p in body_ps[len(sentences):]:
                _normalize_paragraph(extra_p, "")

        if len(sentences) > body_count and body_ps and index.parent_of(body_ps[-1]) is not None:
            template_body = body_ps[-1]
            cur = template_body
            for extra_sentence in sentences[body_count:]:
                cur = index.insert_after(cur, _clone_paragraph_for_text(template_body, extra_sentence))
            section_anchor = cur
        last_section_anchor = section_anchor

    if len(toc) > len(sections) and sections:
        remaining = [(toc[k], _body_at(k)) for k in range(len(sections), len(toc))]
        last_sec = sections[-1]
        anchor_para = last_section_anchor or (last_sec['body_ps'][-1] if last_sec['body_ps'] else last_sec['heading_p'])
        parent = index.parent_of(anchor_para)
        body_template: ET.Element | None = None
        if last_sec['body_ps']:
            body_template = last_sec['body_ps'][-1]
        else:
            for sec in sections:
                if sec['body_ps']:
                    body_template = sec['body_ps'][0]
                    break
            if body_template is None:
                body_template = _clone_paragraph_for_text(last_sec['heading_p'], "")
                body_template.set("styleIDRef", body_style_id)
        if parent is not None and body_template is not None:
            heading_style_id = sorted(heading_ids)[0] if heading_ids else None
            _insert_sections_after(
                index, anchor_para, remaining, body_template, heading_style_id
            )

    # ── P0 FIX ─────────────────────────────────────────────────────────────
    # AI 가 매핑하지 않은 섹션(toc 길이 초과 범위) 의 모든 body 단락도 비운다.
    # 그렇지 않으면 사용자 템플릿 본문의 샘플 문장이 "시장 내 경쟁력을 강화..." 처럼
    # 수십 번 반복 출력된다. 미리보기와 다운로드 결과의 내용을 정확히 일치시키는 핵심.
    # (heading 자체는 원본 유지 — 사용자가 수동 편집할 수 있도록)
    for i, sec in enumerate(sections):
        if i < len(toc):
            continue  # 위 루프에서 이미 처리됨
        for body_p in sec['body_ps']:
            _normalize_paragraph(body_p, "")

    tree.write(section_path, encoding="utf-8", xml_declaration=True)
