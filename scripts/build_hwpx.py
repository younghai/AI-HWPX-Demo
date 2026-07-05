from __future__ import annotations

import argparse
import json
import logging
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# Parse untrusted template XML with defusedxml to block entity-expansion (billion
# laughs) / external-entity attacks. Serialization still uses the standard ET.
# Falls back to stdlib ET if defusedxml is unavailable (review PY-07).
try:
    from defusedxml.ElementTree import parse as _safe_parse
except ImportError:
    _safe_parse = ET.parse

SCRIPT_DIR = Path(__file__).resolve().parent
OFFICE_DIR = SCRIPT_DIR / "office"
REPO_ROOT = SCRIPT_DIR.parent
if str(OFFICE_DIR) not in sys.path:
    sys.path.insert(0, str(OFFICE_DIR))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from hwpx_utils import pack_hwpx, unpack_hwpx
from diagram_templates import render_diagram, CANVAS_W_MM, CANVAS_H_MM, MM

# v3 P2: 네임스페이스/itemCnt 후처리 (한컴 뷰어 호환성)
try:
    from fix_namespaces import fix_hwpx_namespaces
except ImportError:
    # scripts 디렉터리가 sys.path 에 있지만 모듈이 없을 수 있다 — 옵셔널 처리
    fix_hwpx_namespaces = None


HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
HH = "http://www.hancom.co.kr/hwpml/2011/head"

NAMESPACES = {
    "opf": "http://www.idpf.org/2007/opf/",
    "hp": HP,
}

for prefix, uri in {
    "ha": "http://www.hancom.co.kr/hwpml/2011/app",
    "hp": HP,
    "hp10": "http://www.hancom.co.kr/hwpml/2016/paragraph",
    "hs": "http://www.hancom.co.kr/hwpml/2011/section",
    "hc": "http://www.hancom.co.kr/hwpml/2011/core",
    "hh": HH,
    "hhs": "http://www.hancom.co.kr/hwpml/2011/history",
    "hm": "http://www.hancom.co.kr/hwpml/2011/master-page",
    "hpf": "http://www.hancom.co.kr/schema/2011/hpf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "opf": "http://www.idpf.org/2007/opf/",
    "ooxmlchart": "http://www.hancom.co.kr/hwpml/2016/ooxmlchart",
    "epub": "http://www.idpf.org/2007/ops",
    "config": "urn:oasis:names:tc:opendocument:xmlns:config:1.0",
}.items():
    ET.register_namespace(prefix, uri)


TEMPLATES = {
    "gonmun": {
        "path": (REPO_ROOT / "templates" / "gonmun.hwpx").resolve(),
        "default_title": "원본 공문 스타일을 유지하는 AI 문서 생성 서비스 제안서",
        "default_toc": [
            "서비스 추진 배경",
            "원본 문서 분석 범위",
            "스타일 유지형 내용 치환 방식",
            "검수 및 승인 체계",
            "시범 운영 일정",
        ],
    }
}

# 레벨1 헤딩을 나타내는 스타일 이름 패턴 (소문자 비교)
_HEADING1_PATTERNS = [
    "레벨1", "level 1", "level1", "heading 1", "heading1",
    "제목 1", "제목1", "개요 제목", "outline heading",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a demo HWPX document from a template.")
    parser.add_argument("--template", default="gonmun", choices=sorted(TEMPLATES))
    parser.add_argument("--template-file", help="Path to an uploaded .hwpx file to use as the source template")
    parser.add_argument("--output", required=True, help="Output .hwpx path")
    parser.add_argument("--title", help="Document title")
    parser.add_argument("--toc", help="Pipe-separated or newline-separated table of contents")
    parser.add_argument("--source-document", default="document.hwpx", help="Name of the source document")
    parser.add_argument("--sections-json", help="JSON file with AI-generated sections [{heading, body}, ...]")
    parser.add_argument("--doc-date", help="Document date (YYYY.MM.DD). Defaults to today; pass a fixed value for deterministic output/tests.")
    parser.add_argument("--report-json", help="Optional path to write a diagram-embedding report (requested/embedded/skipped) as JSON.")
    return parser.parse_args()


def normalize_toc(raw_toc: str | None, template_name: str) -> list[str]:
    """Return TOC items in the same order provided by the caller.
    - Preserves AI's exact section count (no padding with 추가 섹션 N).
    - Template sections beyond len(toc) keep their original content.
    - Falls back to the template's default TOC only when raw_toc is empty.
    """
    if raw_toc:
        items = [item.strip() for item in raw_toc.replace("|", "\n").splitlines() if item.strip()]
    else:
        items = list(TEMPLATES[template_name]["default_toc"])
    return items


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
    for run in p.findall(f"{{{HP}}}run"):
        if not _is_text_only_run(run):
            continue
        for t in run.findall(f"{{{HP}}}t"):
            if t.text and t.text.strip():
                return True
    return False


def _direct_text_first(p: ET.Element) -> str:
    """First non-empty text from a direct text-only run, used for matching meta/heading."""
    for run in p.findall(f"{{{HP}}}run"):
        if not _is_text_only_run(run):
            continue
        for t in run.findall(f"{{{HP}}}t"):
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
    runs = p.findall(f"{{{HP}}}run")
    if not runs:
        return

    text_runs = [r for r in runs if _is_text_only_run(r)]
    if not text_runs:
        return

    first_run = text_runs[0]
    t = first_run.find(f"{{{HP}}}t")
    if t is None:
        t = ET.SubElement(first_run, f"{{{HP}}}t")
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
    lineseg_array = p.find(f"{{{HP}}}linesegarray")
    if lineseg_array is not None:
        segs = lineseg_array.findall(f"{{{HP}}}lineseg")
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


def apply_smart_replacements(
    working_dir: Path,
    title: str,
    toc: list[str],
    source_document: str,
    sections_body: dict[str, str] | None = None,
    doc_date: str | None = None,
) -> None:
    """Two-pass replacement that maps AI-generated content to template
    sections by INDEX (not name lookup), then normalizes each paragraph
    to remove stale runs/positioning that cause visual overlap."""
    header_path = working_dir / "Contents" / "header.xml"
    section_path = working_dir / "Contents" / "section0.xml"

    heading_ids = detect_heading_style_ids(header_path)
    # Deterministic when --doc-date is supplied; otherwise today (review PY-P2).
    now_label = doc_date or datetime.now().strftime("%Y.%m.%d")

    tree = _safe_parse(section_path)
    root = tree.getroot()

    # Build parent map for paragraph insertion later
    parent_of = {child: parent for parent in root.iter() for child in parent}

    # Pass 1: classify each paragraph
    # Skip wrapper paragraphs (whose text lives inside nested tables) by
    # requiring a direct text-only run with non-empty text.
    title_para: ET.Element | None = None
    meta_para: ET.Element | None = None
    sections: list[dict] = []  # [{'heading_p', 'body_ps'}]
    current: dict | None = None

    for p in root.iter(f"{{{HP}}}p"):
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

    # Pass 2: replace
    if title_para is not None:
        _normalize_paragraph(title_para, title)
    if meta_para is not None:
        _normalize_paragraph(meta_para, f"<원본문서 : {source_document}, {now_label}>")

    sections_body = sections_body or {}

    for i, sec in enumerate(sections):
        if i >= len(toc):
            break
        section_name = toc[i]

        # Replace heading text with TOC entry
        _normalize_paragraph(sec['heading_p'], section_name)

        # Pull AI body text by INDEX-aligned heading lookup, then by name
        # (sections_body keys are AI section headings; toc[i] equals the i-th
        # AI heading because the server passes draft.toc = sections.map(s.heading))
        ai_body = sections_body.get(section_name, "")
        sentences = _split_body_sentences(ai_body)

        body_ps = sec['body_ps']
        body_count = len(body_ps)

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

        if len(sentences) > body_count and body_ps:
            template_body = body_ps[-1]
            parent = parent_of.get(template_body)
            if parent is not None:
                insert_idx = list(parent).index(template_body) + 1
                for k, extra_sentence in enumerate(sentences[body_count:]):
                    clone = _clone_paragraph_for_text(template_body, extra_sentence)
                    parent.insert(insert_idx + k, clone)
                    # Track in parent_of so future operations work
                    for child in clone.iter():
                        for grand in child:
                            parent_of[grand] = child
                    parent_of[clone] = parent

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


def update_preview(preview_path: Path, title: str, toc: list[str], source_document: str) -> None:
    lines = [
        "<>",
        f"<{title}>",
        f"<원본: {source_document}>",
        "",
        "개요",
        "원본 문서 스타일과 섹션 구조를 유지하면서 새 제목과 목차를 반영한 데모 문서입니다.",
        "",
        "목차",
    ]
    lines.extend(f"{index + 1}. {item}" for index, item in enumerate(toc))
    lines.extend(
        [
            "",
            "프로세스",
            "1. HWPX 압축 해제",
            "2. XML 텍스트 노드 치환",
            "3. HWPX 재패키징",
        ]
    )
    preview_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def update_metadata(content_hpf: Path, title: str) -> None:
    tree = _safe_parse(content_hpf)
    root = tree.getroot()
    title_node = root.find(".//opf:title", NAMESPACES)
    if title_node is not None:
        title_node.text = title
    tree.write(content_hpf, encoding="utf-8", xml_declaration=True)


def _diagram_png_bytes(diag_spec: dict) -> bytes | None:
    """Return PNG bytes for one diagram (review B1).

    Priority:
      1. A client pre-rendered PNG (`_pngPath`) — the browser already rendered
         this exact diagram in the preview, so using it byte-for-byte guarantees
         "preview == download" AND needs no native cairo. This is the common path.
      2. Server-side render via cairosvg (fallback for callers that don't upload
         a PNG, or older clients). Requires libcairo; returns None if unavailable.
    """
    png_path = diag_spec.get("_pngPath")
    if png_path:
        p = Path(png_path)
        if p.is_file():
            data = p.read_bytes()
            if data[:8] == b"\x89PNG\r\n\x1a\n":  # valid PNG signature
                return data
            logging.warning("client diagram PNG at %s is not a valid PNG — falling back", png_path)

    svg_str = render_diagram(diag_spec)
    if not svg_str:
        logging.warning("render_diagram returned None for spec: %s", diag_spec)
        return None
    try:
        import cairosvg
    except (ImportError, OSError) as exc:
        logging.warning(
            "cairosvg unavailable (%s) and no client PNG — skipping diagram. "
            "Install libcairo, or upgrade the client to send pre-rendered PNGs.",
            exc,
        )
        return None
    try:
        return cairosvg.svg2png(bytestring=svg_str.encode("utf-8"), output_width=605, output_height=302)
    except Exception as exc:
        logging.warning("cairosvg failed for diagram: %s", exc)
        return None


def _cairosvg_available() -> bool:
    try:
        import cairosvg  # noqa: F401
        return True
    except (ImportError, OSError):
        return False


def _has_valid_client_png(diag_spec: dict) -> bool:
    """True iff the diagram carries a usable client pre-rendered PNG (review D2)."""
    png_path = diag_spec.get("_pngPath")
    if not png_path:
        return False
    p = Path(png_path)
    return p.is_file() and p.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


def embed_diagrams(
    working_dir: Path,
    diagrams: list[dict],
) -> dict:
    """Embed each diagram as a PNG into the HWPX document and RETURN a report
    (review D2 — diagram embed visibility).

    PNG bytes come from the client's pre-rendered image when available, else from
    a server-side cairosvg render (see _diagram_png_bytes). A diagram with no
    obtainable PNG is skipped (recorded in report["skipped"]) rather than failing
    the build. The Node caller surfaces "N/M개 반영" from this report so silent
    drops become visible.
    """
    report = {
        "requestedCount": len(diagrams),
        "embeddedCount": 0,
        "cairosvgAvailable": _cairosvg_available(),
        "embedded": [],
        "skipped": [],
    }
    section_path = working_dir / "Contents" / "section0.xml"
    content_hpf  = working_dir / "Contents" / "content.hpf"
    bin_dir      = working_dir / "BinData"
    bin_dir.mkdir(exist_ok=True)

    tree = _safe_parse(section_path)
    root = tree.getroot()

    # Collect all paragraphs in document order
    all_paras = list(root.iter(f"{{{HP}}}p"))

    hpf_tree = _safe_parse(content_hpf)
    hpf_root = hpf_tree.getroot()
    manifest_ns = "http://www.idpf.org/2007/opf/"

    bin_counter = 1

    # Find existing BIN IDs to avoid collision
    existing_ids = set()
    for item in hpf_root.iter(f"{{{manifest_ns}}}item"):
        existing_ids.add(item.get("id", ""))
    while f"BIN{bin_counter:04d}" in existing_ids:
        bin_counter += 1

    # Page content width in HWPU (A4 = 59528 wide, margins ~11338, usable ~47341+border)
    # From section0.xml observed: usable horzsize ≈ 48188
    PAGE_HORZSIZE = 48188

    # Diagram dimensions in HWPU
    diag_w = int(CANVAS_W_MM * MM)   # 160mm
    diag_h = int(CANVAS_H_MM * MM)   # 80mm

    for diag_spec in diagrams:
        after_section = diag_spec.get("afterSection", "")
        meta = {
            "type": diag_spec.get("type", ""),
            "title": diag_spec.get("title", ""),
            "afterSection": after_section,
        }

        source = "client" if _has_valid_client_png(diag_spec) else "cairosvg"
        png_bytes = _diagram_png_bytes(diag_spec)
        if not png_bytes:
            report["skipped"].append({
                **meta,
                "reason": "PNG 확보 실패 (클라이언트 PNG 없음/무효 + cairosvg 미가용 또는 렌더 실패)",
            })
            continue

        bin_id   = f"BIN{bin_counter:04d}"
        png_name = f"{bin_id}.png"
        png_path = bin_dir / png_name
        png_path.write_bytes(png_bytes)

        bin_counter += 1
        report["embeddedCount"] += 1
        report["embedded"].append({**meta, "binId": bin_id, "source": source})

        # Register in content.hpf manifest
        item_el = ET.SubElement(hpf_root, f"{{{manifest_ns}}}item")
        item_el.set("id", bin_id)
        item_el.set("href", f"BinData/{png_name}")
        item_el.set("media-type", "image/png")

        # Find the insertion point: paragraph after `after_section` heading
        insert_after_para = None
        if after_section:
            for para in all_paras:
                t_nodes = [t for t in para.findall(f".//{{{HP}}}t") if t.text]
                for t in t_nodes:
                    if after_section in (t.text or ""):
                        insert_after_para = para
                        break
                if insert_after_para is not None:
                    break

        # Build <hp:p> containing <hp:pic>
        pic_id = bin_counter * 1000 + 1  # arbitrary unique numeric ID

        new_para_str = (
            f'<hp:p xmlns:hp="{HP}" id="0" paraPrIDRef="0" styleIDRef="0"'
            f' pageBreak="0" columnBreak="0" merged="0">'
            f'<hp:run charPrIDRef="0">'
            f'<hp:pic id="{pic_id}" zOrder="0" numberingType="NONE"'
            f' textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES"'
            f' lock="0" dropcapstyle="None">'
            f'<hp:sz width="{diag_w}" widthRelTo="ABSOLUTE"'
            f' height="{diag_h}" heightRelTo="ABSOLUTE" protect="0"/>'
            f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1"'
            f' allowOverlap="0" holdAnchorAndSO="0"'
            f' vertRelTo="PARA" horzRelTo="PARA"'
            f' vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
            f'<hp:outMargin left="0" right="0" top="283" bottom="283"/>'
            f'<hp:imgObject binItemID="{bin_id}" transparency="0" flipx="0" flipy="0">'
            f'<hp:winAlt left="0" right="0" top="0" bottom="0"/>'
            f'<hp:effects/>'
            f'<hp:imgFormat fileType="PNG" bitmapType="UNKNOWN" transparentColor="-1"/>'
            f'</hp:imgObject>'
            f'</hp:pic>'
            f'<hp:t/>'
            f'</hp:run>'
            f'<hp:linesegarray>'
            f'<hp:lineseg textpos="0" vertpos="0" vertsize="{diag_h}"'
            f' textheight="{diag_h}" baseline="{int(diag_h * 0.85)}"'
            f' spacing="283" horzpos="0" horzsize="{PAGE_HORZSIZE}" flags="393216"/>'
            f'</hp:linesegarray>'
            f'</hp:p>'
        )

        new_para = ET.fromstring(new_para_str)

        # Insert after the target paragraph in the tree
        parent = root  # section root contains paragraphs directly
        para_list = list(parent)
        if insert_after_para is not None and insert_after_para in para_list:
            idx = para_list.index(insert_after_para)
            parent.insert(idx + 1, new_para)
        else:
            # Append at end of section
            parent.append(new_para)

    tree.write(section_path, encoding="utf-8", xml_declaration=True)
    hpf_tree.write(content_hpf, encoding="utf-8", xml_declaration=True)
    return report


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


class TemplateNotFoundError(Exception):
    """Raised when the requested template file does not exist."""


def run() -> Path:
    args = parse_args()
    template = TEMPLATES[args.template]
    template_path = Path(args.template_file).expanduser().resolve() if args.template_file else template["path"]
    title = unicodedata.normalize('NFC', args.title or template["default_title"])
    toc = normalize_toc(args.toc, args.template)
    toc = [unicodedata.normalize('NFC', item) for item in toc]
    source_document = unicodedata.normalize('NFC', args.source_document)
    output = Path(args.output).expanduser().resolve()
    sections_body, diagrams = load_sections_body(args.sections_json)

    if not template_path.exists():
        # Surface only the basename — never leak absolute server paths to users.
        raise TemplateNotFoundError(f"템플릿 파일을 찾을 수 없습니다: {template_path.name}")

    with tempfile.TemporaryDirectory(prefix="hwpx-build-") as temp_dir:
        working_dir = Path(temp_dir)
        unpack_hwpx(template_path, working_dir)

        apply_smart_replacements(working_dir, title, toc, source_document, sections_body, doc_date=args.doc_date)
        diagram_report = {
            "requestedCount": 0, "embeddedCount": 0,
            "cairosvgAvailable": False, "embedded": [], "skipped": [],
        }
        if diagrams:
            diagram_report = embed_diagrams(working_dir, diagrams)
        update_preview(working_dir / "Preview" / "PrvText.txt", title, toc, source_document)
        update_metadata(working_dir / "Contents" / "content.hpf", title)

        pack_hwpx(working_dir, output)

    # Diagram embed report (review D2) — the Node caller reads this to show
    # "N/M개 반영" and warn on silent drops. Written after packing so a partial
    # embed still reports accurately.
    if args.report_json:
        try:
            Path(args.report_json).expanduser().resolve().write_text(
                json.dumps(diagram_report, ensure_ascii=False), encoding="utf-8"
            )
        except OSError as exc:
            logging.warning("report-json 쓰기 실패 — 계속 진행: %s", exc)

    # v3 P2: 후처리 — 네임스페이스 프리픽스 표준화 + itemCnt 동기화
    # 한컴 뷰어(macOS 포함) 에서 빈 페이지 / 스타일 무시 이슈를 예방한다.
    if fix_hwpx_namespaces is not None:
        try:
            fix_hwpx_namespaces(str(output))
        except Exception as exc:
            logging.warning("fix_hwpx_namespaces 실패 — 계속 진행: %s", exc)

    return output


def _emit_error(code: str, message: str) -> None:
    """Emit a structured, user-safe error on stdout for the Node caller to parse.

    The full traceback stays on stderr for server logs; the user-facing channel
    (this JSON line) never contains tracebacks or absolute paths. See CLAUDE.md
    R4 / review PY-04. Node matches the `HWPX_BUILD_ERROR ` sentinel.
    """
    payload = json.dumps({"error_code": code, "message": message}, ensure_ascii=False)
    print(f"HWPX_BUILD_ERROR {payload}")


def main() -> None:
    try:
        output = run()
    except TemplateNotFoundError as exc:
        _emit_error("TEMPLATE_NOT_FOUND", str(exc))
        sys.exit(2)
    except SectionsParseError as exc:
        _emit_error("SECTIONS_PARSE_ERROR", str(exc))
        sys.exit(2)
    except Exception:
        # Full traceback to stderr (server logs only); generic message to user.
        logging.getLogger("build_hwpx").exception("HWPX build failed")
        _emit_error("BUILD_FAILED", "문서 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
        sys.exit(1)
    print(f"Built {output}")


if __name__ == "__main__":
    main()
