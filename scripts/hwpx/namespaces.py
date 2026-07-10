from __future__ import annotations

import xml.etree.ElementTree as ET

# Parse untrusted template XML with defusedxml to block entity-expansion (billion
# laughs) / external-entity attacks. Serialization still uses the standard ET.
# Falls back to stdlib ET if defusedxml is unavailable (review PY-07).
try:
    from defusedxml.ElementTree import parse as _safe_parse
except ImportError:
    _safe_parse = ET.parse

HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
HH = "http://www.hancom.co.kr/hwpml/2011/head"
HA = "http://www.hancom.co.kr/hwpml/2011/app"
HP10 = "http://www.hancom.co.kr/hwpml/2016/paragraph"
HS = "http://www.hancom.co.kr/hwpml/2011/section"
HC = "http://www.hancom.co.kr/hwpml/2011/core"
HHS = "http://www.hancom.co.kr/hwpml/2011/history"
HM = "http://www.hancom.co.kr/hwpml/2011/master-page"
HPF = "http://www.hancom.co.kr/schema/2011/hpf"
DC = "http://purl.org/dc/elements/1.1/"
OPF = "http://www.idpf.org/2007/opf/"
OOXMLCHART = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart"
EPUB = "http://www.idpf.org/2007/ops"
CONFIG = "urn:oasis:names:tc:opendocument:xmlns:config:1.0"

NAMESPACES = {
    "opf": OPF,
    "hp": HP,
}

_PREFIX_URI = {
    "ha": HA,
    "hp": HP,
    "hp10": HP10,
    "hs": HS,
    "hc": HC,
    "hh": HH,
    "hhs": HHS,
    "hm": HM,
    "hpf": HPF,
    "dc": DC,
    "opf": OPF,
    "ooxmlchart": OOXMLCHART,
    "epub": EPUB,
    "config": CONFIG,
}

for _prefix, _uri in _PREFIX_URI.items():
    ET.register_namespace(_prefix, _uri)


def qn(local: str, ns: str = HP) -> str:
    return f"{{{ns}}}{local}"
