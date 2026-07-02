"""HWPX 컨테이너(ZIP) 레벨 검증.

polaris_dvc JID 12000–12999 축 축약 포팅.
- mimetype 엔트리 존재·위치·압축 방식
- 필수 XML 엔트리 존재
- 금지 엔트리 (`__MACOSX/`, `.DS_Store` 등) 감지
- BinData 파일 ↔ content.hpf manifest 일관성
"""
from __future__ import annotations

import re
import zipfile
from pathlib import Path

from report import ValidationReport, AXIS_CONTAINER, error, warning


REQUIRED_MIMETYPE = b"application/hwp+zip"
REQUIRED_ENTRIES = [
    "mimetype",
    "Contents/content.hpf",
    "Contents/header.xml",
    "Contents/section0.xml",
]
FORBIDDEN_PATTERNS = [
    r"^__MACOSX/",
    r"/\.DS_Store$",
    r"^\.DS_Store$",
    r"/Thumbs\.db$",
    r"^Thumbs\.db$",
    r"/desktop\.ini$",
]


def _iter_bin_refs_in_xml(zip_file: zipfile.ZipFile) -> set[str]:
    """section*.xml 에서 binItemID 참조를 수집한다."""
    refs: set[str] = set()
    for name in zip_file.namelist():
        if not (name.startswith("Contents/") and name.endswith(".xml")):
            continue
        try:
            content = zip_file.read(name).decode("utf-8", errors="ignore")
        except Exception:
            continue
        for m in re.finditer(r'binItemID="([^"]+)"', content):
            refs.add(m.group(1))
    return refs


def _iter_manifest_bin_items(zip_file: zipfile.ZipFile) -> dict[str, str]:
    """content.hpf 의 manifest item 중 BinData 참조를 {id: href} 로 수집한다."""
    try:
        content = zip_file.read("Contents/content.hpf").decode("utf-8", errors="ignore")
    except Exception:
        return {}
    result: dict[str, str] = {}
    for m in re.finditer(
        r'<opf:item\s+(?=[^>]*id="([^"]+)")(?=[^>]*href="([^"]+)")',
        content,
    ):
        item_id, href = m.group(1), m.group(2)
        if href.startswith("BinData/"):
            result[item_id] = href
    return result


def validate_container(hwpx_path: str | Path) -> ValidationReport:
    """컨테이너 레벨 검증을 수행하고 ValidationReport 를 반환한다."""
    rpt = ValidationReport()
    try:
        with zipfile.ZipFile(hwpx_path, "r") as z:
            info_list = z.infolist()
            names = [info.filename for info in info_list]

            # 1. mimetype 존재 + 첫 엔트리 + ZIP_STORED
            if "mimetype" not in names:
                rpt.add(error(AXIS_CONTAINER, "V12001", "mimetype 엔트리가 없습니다."))
            else:
                first = info_list[0]
                if first.filename != "mimetype":
                    rpt.add(error(
                        AXIS_CONTAINER, "V12002",
                        f"mimetype 은 ZIP 의 첫 엔트리여야 합니다. 현재 첫 엔트리: {first.filename}"
                    ))
                mime_info = z.getinfo("mimetype")
                if mime_info.compress_type != zipfile.ZIP_STORED:
                    rpt.add(error(
                        AXIS_CONTAINER, "V12003",
                        "mimetype 은 deflate 되지 않은 STORED 방식이어야 합니다.",
                        location="mimetype"
                    ))
                mime_bytes = z.read("mimetype").strip()
                if mime_bytes != REQUIRED_MIMETYPE:
                    rpt.add(error(
                        AXIS_CONTAINER, "V12004",
                        f"mimetype 내용이 올바르지 않습니다. 기대: {REQUIRED_MIMETYPE!r}, 실제: {mime_bytes!r}",
                        location="mimetype"
                    ))

            # 2. 필수 엔트리
            for required in REQUIRED_ENTRIES:
                if required not in names:
                    rpt.add(error(AXIS_CONTAINER, "V12010", f"필수 엔트리 누락: {required}"))

            # 3. 금지 패턴
            for n in names:
                for pat in FORBIDDEN_PATTERNS:
                    if re.search(pat, n):
                        rpt.add(warning(
                            AXIS_CONTAINER, "V12020",
                            f"금지된 entry 발견 — 한컴 호환성 저해 가능: {n}",
                            location=n
                        ))
                        break

            # 4. BinData 파일 ↔ manifest 일관성
            manifest_bins = _iter_manifest_bin_items(z)
            manifest_hrefs = set(manifest_bins.values())
            referenced_ids = _iter_bin_refs_in_xml(z)

            actual_bin_files = {n for n in names if n.startswith("BinData/")}

            for href in manifest_hrefs - actual_bin_files:
                rpt.add(error(
                    AXIS_CONTAINER, "V12030",
                    f"manifest 에 선언된 BinData 파일이 ZIP 에 없음: {href}",
                    location="Contents/content.hpf"
                ))
            for actual in actual_bin_files - manifest_hrefs:
                rpt.add(warning(
                    AXIS_CONTAINER, "V12031",
                    f"ZIP 의 BinData 파일이 manifest 에 선언되지 않음: {actual}",
                    location=actual
                ))
            for ref_id in referenced_ids - set(manifest_bins.keys()):
                rpt.add(error(
                    AXIS_CONTAINER, "V12032",
                    f"문서에서 binItemID='{ref_id}' 를 참조하지만 manifest 에 없음."
                ))
    except zipfile.BadZipFile:
        rpt.add(error(AXIS_CONTAINER, "V12000", "유효한 ZIP 파일이 아닙니다."))
    except FileNotFoundError:
        rpt.add(error(AXIS_CONTAINER, "V12000", f"파일을 찾을 수 없습니다: {hwpx_path}"))

    return rpt
