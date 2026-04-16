from __future__ import annotations

import argparse
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OFFICE_DIR = SCRIPT_DIR / "office"
REPO_ROOT = SCRIPT_DIR.parent
if str(OFFICE_DIR) not in sys.path:
    sys.path.insert(0, str(OFFICE_DIR))

from hwpx_utils import pack_hwpx, unpack_hwpx


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

# 섹션 본문 자동 생성 문장 풀
_BODY_SENTENCES = [
    "{section}의 추진 배경과 필요성을 원본 서식에 맞게 기술합니다.",
    "{title}의 기대 효과와 주요 성과 지표를 한 페이지로 요약합니다.",
    "{section} 관련 현황 분석 및 주요 시사점을 정리합니다.",
    "{section} 실행을 위한 세부 추진 방안을 단계별로 기술합니다.",
    "원본 문서 스타일을 유지하며 {section} 핵심 내용을 작성합니다.",
    "{section} 추진 시 고려할 주요 조건과 평가 기준을 명시합니다.",
    "{section} 완료 후 후속 조치 및 점검 항목을 기술합니다.",
    "{section}의 담당 부서와 협력 기관의 역할을 정의합니다.",
]

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
    return parser.parse_args()


def normalize_toc(raw_toc: str | None, template_name: str) -> list[str]:
    if raw_toc:
        items = [item.strip() for item in raw_toc.replace("|", "\n").splitlines() if item.strip()]
    else:
        items = list(TEMPLATES[template_name]["default_toc"])

    while len(items) < 5:
        items.append(f"추가 섹션 {len(items) + 1}")

    return items[:5]


def detect_heading_style_ids(header_xml: Path) -> frozenset[str]:
    """header.xml 의 스타일 이름을 분석해 섹션 헤딩에 해당하는 styleIDRef 집합을 반환합니다.
    인식 불가 시 {'1'} 을 기본값으로 반환합니다."""
    try:
        tree = ET.parse(header_xml)
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
    except Exception:
        return frozenset({"1"})


def _body_sentence(section: str, idx: int, title: str) -> str:
    template = _BODY_SENTENCES[idx % len(_BODY_SENTENCES)]
    return template.format(section=section, title=title)


def apply_smart_replacements(
    working_dir: Path,
    title: str,
    toc: list[str],
    source_document: str,
) -> None:
    """스타일 기반으로 제목·섹션 헤딩·본문을 치환합니다.
    업로드된 임의 HWPX 템플릿에도 동작합니다."""
    header_path = working_dir / "Contents" / "header.xml"
    section_path = working_dir / "Contents" / "section0.xml"

    heading_ids = detect_heading_style_ids(header_path)
    now_label = datetime.now().strftime("%Y.%m.%d")

    tree = ET.parse(section_path)
    root = tree.getroot()

    # 문서 순서대로 (paragraph, styleIDRef, text노드 목록) 수집
    paras: list[tuple[ET.Element, str, list[ET.Element]]] = []
    for p in root.iter(f"{{{HP}}}p"):
        style_id = p.get("styleIDRef", "0")
        t_nodes = [t for t in p.findall(f".//{{{HP}}}t") if t.text and t.text.strip()]
        if t_nodes:
            paras.append((p, style_id, t_nodes))

    title_done = False
    meta_done = False
    toc_idx = 0
    current_section = -1
    body_idx = 0

    for _p, style_id, t_nodes in paras:
        text = (t_nodes[0].text or "").strip()

        # 1. 제목: 문서 첫 번째 텍스트 노드
        if not title_done:
            t_nodes[0].text = title
            title_done = True
            continue

        # 2. 원본 문서 메타 라인: '<...' 패턴
        if not meta_done and text.startswith("<"):
            t_nodes[0].text = f"<원본문서 : {source_document}, {now_label}>"
            meta_done = True
            continue

        # 3. 섹션 헤딩: styleIDRef 가 헤딩 스타일에 해당
        if style_id in heading_ids:
            if toc_idx < len(toc):
                t_nodes[0].text = toc[toc_idx]
                current_section = toc_idx
                toc_idx += 1
                body_idx = 0
            # toc 소진 후 남은 헤딩(붙임 등)은 원본 유지
            continue

        # 4. 본문 단락: 헤딩이 아닌 비zero 스타일, 섹션 진입 후
        if style_id != "0" and current_section >= 0:
            t_nodes[0].text = _body_sentence(toc[current_section], body_idx, title)
            body_idx += 1
            continue

        # 5. 나머지(바탕글·푸터 등): 원본 유지

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
    tree = ET.parse(content_hpf)
    root = tree.getroot()
    title_node = root.find(".//opf:title", NAMESPACES)
    if title_node is not None:
        title_node.text = title
    tree.write(content_hpf, encoding="utf-8", xml_declaration=True)


def main() -> None:
    args = parse_args()
    template = TEMPLATES[args.template]
    template_path = Path(args.template_file).expanduser().resolve() if args.template_file else template["path"]
    title = args.title or template["default_title"]
    toc = normalize_toc(args.toc, args.template)
    output = Path(args.output).expanduser().resolve()

    if not template_path.exists():
        raise SystemExit(f"Template file not found: {template_path}")

    with tempfile.TemporaryDirectory(prefix="hwpx-build-") as temp_dir:
        working_dir = Path(temp_dir)
        unpack_hwpx(template_path, working_dir)

        apply_smart_replacements(working_dir, title, toc, args.source_document)
        update_preview(working_dir / "Preview" / "PrvText.txt", title, toc, args.source_document)
        update_metadata(working_dir / "Contents" / "content.hpf", title)

        pack_hwpx(working_dir, output)

    print(f"Built {output}")


if __name__ == "__main__":
    main()
