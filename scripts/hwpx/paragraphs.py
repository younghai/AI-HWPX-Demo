from __future__ import annotations

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
        return

    text_runs = [r for r in runs if _is_text_only_run(r)]
    if not text_runs:
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


def _split_body_sentences(body_text: str) -> list[str]:
    """Split AI body text into sentence-sized chunks for paragraph distribution."""
    if not body_text:
        return []
    normalized = body_text.replace('. ', '.\n').replace('? ', '?\n').replace('! ', '!\n')
    return [s.strip() for s in normalized.splitlines() if s.strip()]


def _clone_paragraph_for_text(template_p: ET.Element, text: str) -> ET.Element:
    """Deep-copy a paragraph element and normalize it with the given text."""
    from copy import deepcopy
    clone = deepcopy(template_p)
    _normalize_paragraph(clone, text)
    return clone
