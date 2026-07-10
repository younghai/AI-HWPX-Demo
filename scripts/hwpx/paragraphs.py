from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET

from hwpx.namespaces import HP, qn


def _is_text_only_run(run: ET.Element) -> bool:
    """Run contains only text-related children (no pictures, tables, ctrl chars)."""
    for child in run:
        local = child.tag.split('}')[-1]
        if local not in ('t', 'lineBreak', 'tab', 'fwSpace', 'nbSpace'):
            return False
    return True


def _paragraph_has_direct_text(p: ET.Element) -> bool:
    """True iff the paragraph has at least one direct <hp:run> that is text-only
    AND contains a non-empty <hp:t>. Excludes table-wrapper paragraphs whose
    visible text lives inside nested cells."""
    for run in p.findall(qn("run", HP)):
        if not _is_text_only_run(run):
            continue
        for t in run.findall(qn("t", HP)):
            if t.text and t.text.strip():
                return True
    return False


def _direct_text_first(p: ET.Element) -> str:
    """First non-empty text from a direct text-only run, used for matching meta/heading."""
    for run in p.findall(qn("run", HP)):
        if not _is_text_only_run(run):
            continue
        for t in run.findall(qn("t", HP)):
            if t.text and t.text.strip():
                return t.text.strip()
    return ""


def _normalize_paragraph(p: ET.Element, text: str) -> None:
    """Replace paragraph content with a single text run.
    - Removes additional <hp:run> elements (their stale charPr/text causes
      visual overlap when the new text is shorter or longer than the original).
    - Removes secondary text fragments inside the first run (lineBreak, extra <hp:t>).
    - Resets the <hp:linesegarray> to a single segment so the renderer
      computes line breaks based on the new text width, not the original."""
    runs = p.findall(qn("run", HP))
    if not runs:
        # 적용 불가를 조용히 넘기지 않는다 (INV-5) — 빈 문단에 빈 텍스트는 정상 no-op.
        if text:
            logging.warning("normalize_paragraph: paragraph has no runs — text not applied (text=%r)", text[:40])
        return

    text_runs = [r for r in runs if _is_text_only_run(r)]
    if not text_runs:
        # 텍스트 전용 run 이 없는 문단(그림 등 혼합 run 뿐). 쓰기는 소실되고,
        # 비우기 실패는 placeholder 누수로 이어질 수 있어 관찰 가능하게 남긴다 (INV-5).
        logging.warning("normalize_paragraph: no text-only run — cannot apply (text=%r)", text[:40])
        return

    first_run = text_runs[0]
    t = first_run.find(qn("t", HP))
    if t is None:
        t = ET.SubElement(first_run, qn("t", HP))
    t.text = text

    # Remove other text-bearing children inside first run
    for child in list(first_run):
        if child is t:
            continue
        local = child.tag.split('}')[-1]
        if local in ('t', 'lineBreak', 'tab', 'fwSpace', 'nbSpace'):
            first_run.remove(child)

    # Remove all other text-only runs in this paragraph
    for extra in text_runs[1:]:
        p.remove(extra)

    # Reset linesegarray so HWPX renderer reflows the new text width
    lineseg_array = p.find(qn("linesegarray", HP))
    if lineseg_array is not None:
        segs = lineseg_array.findall(qn("lineseg", HP))
        for s in segs[1:]:
            lineseg_array.remove(s)
        if segs:
            segs[0].set('textpos', '0')


# 열거 번호만 남은 조각("1.", "12.") — 다음 조각에 붙여 "1. 항목" 이 두 문단으로
# 쪼개지지 않게 한다 (INV-6). 소수점("3.5")은 점+공백이 아니라 애초에 분리되지 않는다.
_ENUMERATOR_ONLY = re.compile(r"\d{1,2}\.")


def _split_body_sentences(body_text: str) -> list[str]:
    """Split AI body text into sentence-sized chunks for paragraph distribution."""
    if not body_text:
        return []
    normalized = body_text.replace('. ', '.\n').replace('? ', '?\n').replace('! ', '!\n')
    parts = [s.strip() for s in normalized.splitlines() if s.strip()]
    merged: list[str] = []
    for part in parts:
        if merged and _ENUMERATOR_ONLY.fullmatch(merged[-1]):
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)
    return merged


def _clone_paragraph_for_text(template_p: ET.Element, text: str) -> ET.Element:
    """Deep-copy a paragraph element and normalize it with the given text."""
    from copy import deepcopy
    clone = deepcopy(template_p)
    _normalize_paragraph(clone, text)
    return clone
