"""HWPX 구조 무결성 검증 (cross-reference).

polaris_dvc JID 11000–11999 축 축약 포팅.
- section*.xml 의 charPrIDRef / paraPrIDRef / styleIDRef / borderFillIDRef 가
  header.xml 에 선언된 id 집합 안에 있는가
- 참조되지 않은 스타일 정의 (warning)
"""
from __future__ import annotations

import re
import zipfile
from pathlib import Path

from report import ValidationReport, AXIS_STRUCTURE, error, warning


# header.xml 내 id 선언을 뽑아낼 태그
HEADER_ID_DEFS = {
    "charPr":      r'<hh:charPr\s+[^>]*?\bid="([^"]+)"',
    "paraPr":      r'<hh:paraPr\s+[^>]*?\bid="([^"]+)"',
    "style":       r'<hh:style\s+[^>]*?\bid="([^"]+)"',
    "borderFill":  r'<hh:borderFill\s+[^>]*?\bid="([^"]+)"',
}

# section*.xml 내 id 참조
SECTION_ID_REFS = {
    "charPr":     (r'charPrIDRef="([^"]+)"',     "charPr"),
    "paraPr":     (r'paraPrIDRef="([^"]+)"',     "paraPr"),
    "style":      (r'styleIDRef="([^"]+)"',       "style"),
    "borderFill": (r'borderFillIDRef="([^"]+)"',  "borderFill"),
}


def _collect_header_ids(header_xml: str) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for name, pattern in HEADER_ID_DEFS.items():
        result[name] = set(re.findall(pattern, header_xml))
    return result


def _collect_section_refs(section_xml: str) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for key, (pattern, category) in SECTION_ID_REFS.items():
        result.setdefault(category, set()).update(re.findall(pattern, section_xml))
    return result


def validate_structure(hwpx_path: str | Path) -> ValidationReport:
    """구조 cross-reference 를 검사한다."""
    rpt = ValidationReport()

    try:
        with zipfile.ZipFile(hwpx_path, "r") as z:
            names = z.namelist()
            if "Contents/header.xml" not in names:
                rpt.add(error(AXIS_STRUCTURE, "V11001", "Contents/header.xml 이 없어 구조 검증 불가"))
                return rpt

            header_xml = z.read("Contents/header.xml").decode("utf-8", errors="ignore")
            header_ids = _collect_header_ids(header_xml)

            section_files = [n for n in names if n.startswith("Contents/section") and n.endswith(".xml")]
            if not section_files:
                rpt.add(error(AXIS_STRUCTURE, "V11002", "section*.xml 이 하나도 없습니다."))
                return rpt

            used_ids: dict[str, set[str]] = {k: set() for k in header_ids}

            for section_file in section_files:
                section_xml = z.read(section_file).decode("utf-8", errors="ignore")
                refs = _collect_section_refs(section_xml)

                for category, ref_ids in refs.items():
                    header_set = header_ids.get(category, set())
                    for ref in ref_ids:
                        if ref in header_set:
                            used_ids[category].add(ref)
                        else:
                            rpt.add(error(
                                AXIS_STRUCTURE, "V11010",
                                f"{category}IDRef='{ref}' 가 header.xml 의 <hh:{category} id=> 집합에 없음",
                                location=section_file
                            ))

            # 선언됐으나 사용 안 된 id — 심각하지 않지만 낭비
            for category, declared in header_ids.items():
                if not declared:
                    continue
                unused = declared - used_ids.get(category, set())
                if len(unused) >= 3:
                    rpt.add(warning(
                        AXIS_STRUCTURE, "V11020",
                        f"header.xml 에 선언됐지만 참조되지 않는 {category} id {len(unused)}개 (예: {sorted(list(unused))[:3]})",
                        location="Contents/header.xml"
                    ))
    except zipfile.BadZipFile:
        rpt.add(error(AXIS_STRUCTURE, "V11000", "유효한 ZIP 파일이 아닙니다."))
    except FileNotFoundError:
        rpt.add(error(AXIS_STRUCTURE, "V11000", f"파일을 찾을 수 없습니다: {hwpx_path}"))

    return rpt
