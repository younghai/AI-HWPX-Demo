from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from pathlib import Path

from diagram_templates import CANVAS_H_MM, CANVAS_W_MM, MM, render_diagram
from hwpx.namespaces import HP, _safe_parse


# Combined sections+diagrams magic-key contract is documented in server/lib/sections.js.
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
