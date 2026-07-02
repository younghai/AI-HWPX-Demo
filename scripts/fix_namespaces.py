#!/usr/bin/env python3
"""HWPX 네임스페이스 & itemCnt 후처리.

ElementTree 가 HWPX 를 재작성할 때 `ns0:/ns1:` 같은 자동 프리픽스를 부여하는데,
한컴 뷰어(특히 macOS) 는 이를 인식하지 못해 **빈 페이지로 렌더되거나 스타일 무시**
한다. 표준 프리픽스(hh/hc/hp/hs) 로 다시 바꿔 넣는다.

또한 `header.xml` 의 `<hh:*Properties itemCnt="N">` 값이 실제 자식 개수와 다르면
한컴이 추가 스타일을 무시해 폰트가 기본값으로 폴백되므로 이것도 재계산한다.

외부 출처: jkf87/hwpx-skill scripts/fix_namespaces.py (MIT)
로컬 v3 용으로 포팅 + 약간 단순화.

사용:
    from fix_namespaces import fix_hwpx_namespaces
    fix_hwpx_namespaces("output.hwpx")
또는 CLI:
    python3 v4/scripts/fix_namespaces.py output.hwpx
"""
from __future__ import annotations

import os
import re
import sys
import zipfile


NS_MAP = {
    "http://www.hancom.co.kr/hwpml/2011/head": "hh",
    "http://www.hancom.co.kr/hwpml/2011/core": "hc",
    "http://www.hancom.co.kr/hwpml/2011/paragraph": "hp",
    "http://www.hancom.co.kr/hwpml/2011/section": "hs",
}


def _fix_item_counts(header_xml: str) -> str:
    """header.xml 의 itemCnt 속성을 실제 자식 개수와 동기화한다."""
    count_map = {
        "charProperties": r"<hh:charPr ",
        "borderFills": r"<hh:borderFill ",
        "paraProperties": r"<hh:paraPr ",
        "styles": r"<hh:style ",
    }
    for container, child_re in count_map.items():
        actual = len(re.findall(child_re, header_xml))
        if actual > 0:
            header_xml = re.sub(
                rf'(<hh:{container}\s+itemCnt=")\d+(")',
                rf"\g<1>{actual}\2",
                header_xml,
            )
    return header_xml


def fix_hwpx_namespaces(hwpx_path: str) -> None:
    """HWPX 파일 내부 XML 들의 ns 프리픽스를 한컴 표준으로 교체 + itemCnt 보정."""
    tmp_path = hwpx_path + ".tmp"
    try:
        with zipfile.ZipFile(hwpx_path, "r") as zin:
            with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)

                    if (
                        item.filename.startswith("Contents/")
                        and item.filename.endswith(".xml")
                    ):
                        text = data.decode("utf-8")
                        aliases: dict[str, str] = {}
                        for m in re.finditer(r'xmlns:(ns\d+)="([^"]+)"', text):
                            alias, uri = m.group(1), m.group(2)
                            if uri in NS_MAP:
                                aliases[alias] = NS_MAP[uri]
                        for old, new in aliases.items():
                            text = text.replace(f"xmlns:{old}=", f"xmlns:{new}=")
                            text = text.replace(f"<{old}:", f"<{new}:")
                            text = text.replace(f"</{old}:", f"</{new}:")

                        if item.filename == "Contents/header.xml":
                            text = _fix_item_counts(text)

                        data = text.encode("utf-8")

                    if item.filename == "mimetype":
                        zout.writestr(item, data, compress_type=zipfile.ZIP_STORED)
                    else:
                        zout.writestr(item, data)

        os.replace(tmp_path, hwpx_path)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 fix_namespaces.py <file.hwpx>", file=sys.stderr)
        sys.exit(1)
    target = sys.argv[1]
    fix_hwpx_namespaces(target)
    print(f"Fixed namespaces: {target}")
