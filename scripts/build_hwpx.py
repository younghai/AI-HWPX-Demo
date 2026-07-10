from __future__ import annotations

import argparse
import json
import logging
import sys
import tempfile
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OFFICE_DIR = SCRIPT_DIR / "office"
REPO_ROOT = SCRIPT_DIR.parent
if str(OFFICE_DIR) not in sys.path:
    sys.path.insert(0, str(OFFICE_DIR))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from hwpx_utils import pack_hwpx, unpack_hwpx
from hwpx.namespaces import NAMESPACES, _safe_parse
from hwpx.paragraphs import (
    _clone_paragraph_for_text,
    _direct_text_first,
    _is_text_only_run,
    _normalize_paragraph,
    _paragraph_has_direct_text,
    _split_body_sentences,
)
from hwpx.fields import (
    _apply_label_value_fields,
    _cell_fill_paragraph,
    _cell_first_text,
    _match_field,
    _normalize_field_label,
)
from hwpx.io import SectionsParseError, load_doc_fields, load_sections_body
from hwpx.diagrams import (
    _cairosvg_available,
    _diagram_png_bytes,
    _has_valid_client_png,
    embed_diagrams,
)
from hwpx.sections import apply_smart_replacements, detect_heading_style_ids


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

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a demo HWPX document from a template.")
    parser.add_argument("--template", default="gonmun", choices=sorted(TEMPLATES))
    parser.add_argument("--template-file", help="Path to an uploaded .hwpx file to use as the source template")
    parser.add_argument("--output", required=True, help="Output .hwpx path")
    parser.add_argument("--title", help="Document title")
    parser.add_argument("--toc", help="Pipe-separated or newline-separated table of contents")
    parser.add_argument("--source-document", default="document.hwpx", help="Name of the source document")
    parser.add_argument("--sections-json", help="JSON file with AI-generated sections [{heading, body}, ...]")
    parser.add_argument("--doc-fields", help="JSON file with resolved docFields [{key, label, value}, ...] for label/value table cells")
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


def update_preview(
    preview_path: Path,
    title: str,
    toc: list[str],
    source_document: str,
    section_items: list[dict] | None = None,
) -> None:
    """Preview/PrvText.txt 를 실제 문서 내용으로 채운다 (INV-3).

    한컴 오피스·파일 관리자의 텍스트 미리보기 패널이 이 파일을 보여주므로,
    고정 보일러플레이트가 아니라 본문과 같은 내용이어야 "미리보기 == 다운로드"
    원칙이 산출물 내부에서도 성립한다."""
    items = section_items or []
    lines = [title, f"<원본: {source_document}>", ""]
    for k, heading in enumerate(toc):
        lines.append(heading)
        body = items[k]["body"] if k < len(items) else ""
        if body:
            lines.append(body)
        lines.append("")
    text = "\n".join(lines).rstrip("\n") + "\n"
    # PrvText 는 미리보기 용도 — 본문이 아무리 길어도 방어적으로 캡.
    preview_path.write_text(text[:4000], encoding="utf-8")


def update_metadata(content_hpf: Path, title: str) -> None:
    tree = _safe_parse(content_hpf)
    root = tree.getroot()
    title_node = root.find(".//opf:title", NAMESPACES)
    if title_node is not None:
        title_node.text = title
    tree.write(content_hpf, encoding="utf-8", xml_declaration=True)


class TemplateNotFoundError(Exception):
    """Raised when the requested template file does not exist."""


def run() -> Path:
    args = parse_args()
    template = TEMPLATES[args.template]
    template_path = Path(args.template_file).expanduser().resolve() if args.template_file else template["path"]
    title = unicodedata.normalize('NFC', args.title or template["default_title"])
    section_items, diagrams = load_sections_body(args.sections_json)
    doc_fields = load_doc_fields(args.doc_fields)
    if section_items:
        # toc 는 같은 리스트에서 파생 — toc[i] == section_items[i]['heading'] 이
        # 구조적으로 보장되고, 중복 heading 도 별개 섹션으로 유지된다 (SPEC-P1b).
        toc = [item["heading"] for item in section_items]
    else:
        toc = [unicodedata.normalize('NFC', item) for item in normalize_toc(args.toc, args.template)]
    source_document = unicodedata.normalize('NFC', args.source_document)
    output = Path(args.output).expanduser().resolve()

    if not template_path.exists():
        # Surface only the basename — never leak absolute server paths to users.
        raise TemplateNotFoundError(f"템플릿 파일을 찾을 수 없습니다: {template_path.name}")

    with tempfile.TemporaryDirectory(prefix="hwpx-build-") as temp_dir:
        working_dir = Path(temp_dir)
        unpack_hwpx(template_path, working_dir)

        apply_smart_replacements(working_dir, title, toc, source_document, section_items, doc_date=args.doc_date, doc_fields=doc_fields)
        diagram_report = {
            "requestedCount": 0, "embeddedCount": 0,
            "cairosvgAvailable": False, "embedded": [], "skipped": [],
        }
        if diagrams:
            headings_by_id = {
                item["id"]: item["heading"] for item in (section_items or []) if item.get("id")
            }
            diagram_report = embed_diagrams(working_dir, diagrams, section_headings_by_id=headings_by_id)
        update_preview(working_dir / "Preview" / "PrvText.txt", title, toc, source_document, section_items)
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
