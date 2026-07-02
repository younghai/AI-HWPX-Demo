from __future__ import annotations

"""
SVG diagram templates for HWPX embedding.
Ported from diagram-design (github.com/cathrynlavery/diagram-design).
Uses inline styles only — compatible with cairosvg offline rendering.
"""

PAPER  = "#faf7f2"
INK    = "#1c1917"
MUTED  = "#78716c"
ACCENT = "#b5523a"
LINK   = "#2563eb"
RULE   = "rgba(28,25,23,0.12)"
FONT   = "Arial, sans-serif"
MONO   = "Courier New, monospace"

# HWP units: 1 mm = 283.46 HWPU
MM = 283.46

# Diagram canvas: 160mm wide x 80mm tall (in pixels at 96dpi: 605 x 302)
CANVAS_W_MM = 160
CANVAS_H_MM = 80
CANVAS_W_PX = 605
CANVAS_H_PX = 302


def _dot_grid() -> str:
    """Dot-grid background pattern (22x22, r=0.9, 10% opacity)."""
    return (
        '<defs>'
        '<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">'
        f'<circle cx="11" cy="11" r="0.9" fill="{INK}" opacity="0.10"/>'
        '</pattern>'
        '</defs>'
        f'<rect width="{CANVAS_W_PX}" height="{CANVAS_H_PX}" fill="{PAPER}"/>'
        f'<rect width="{CANVAS_W_PX}" height="{CANVAS_H_PX}" fill="url(#dots)"/>'
    )


def _arrow_defs() -> str:
    return (
        '<defs>'
        f'<marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">'
        f'<path d="M0,0 L0,6 L8,3 z" fill="{MUTED}"/>'
        '</marker>'
        f'<marker id="arr-a" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">'
        f'<path d="M0,0 L0,6 L8,3 z" fill="{ACCENT}"/>'
        '</marker>'
        '</defs>'
    )


def flowchart(steps: list[str], title: str = "") -> str:
    """
    Horizontal flowchart: up to 5 steps connected by arrows.
    steps: list of step labels (max 5)
    """
    steps = steps[:5]
    n = len(steps)
    if n == 0:
        return ""

    pad = 20
    total_arrows = n - 1
    arrow_w = 24
    node_w = (CANVAS_W_PX - 2 * pad - total_arrows * arrow_w) // n
    node_h = 44
    node_y = (CANVAS_H_PX - node_h) // 2
    if title:
        node_y = node_y + 12

    body = _dot_grid() + _arrow_defs()

    if title:
        body += (
            f'<text x="{CANVAS_W_PX // 2}" y="20" text-anchor="middle" '
            f'font-family="{FONT}" font-size="11" font-weight="700" fill="{INK}">'
            f'{title}</text>'
        )

    for i, step in enumerate(steps):
        x = pad + i * (node_w + arrow_w)
        is_focal = (i == 0)
        fill   = f"{ACCENT}22" if is_focal else PAPER
        stroke = ACCENT if is_focal else MUTED
        sw     = 1.4 if is_focal else 0.8
        tc     = ACCENT if is_focal else INK

        body += (
            f'<rect x="{x}" y="{node_y}" width="{node_w}" height="{node_h}" rx="6" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
        )

        # Step number
        body += (
            f'<text x="{x + 10}" y="{node_y + 14}" '
            f'font-family="{MONO}" font-size="8" fill="{MUTED}">{i + 1}</text>'
        )

        # Label (wrap at ~18 chars)
        words = step.split()
        line1, line2 = "", ""
        for w in words:
            if len(line1) + len(w) + 1 <= 14:
                line1 = (line1 + " " + w).strip()
            else:
                line2 = (line2 + " " + w).strip()

        cy = node_y + node_h // 2
        if line2:
            body += (
                f'<text x="{x + node_w // 2}" y="{cy - 5}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="10" font-weight="700" fill="{tc}">{line1}</text>'
                f'<text x="{x + node_w // 2}" y="{cy + 9}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="10" fill="{tc}">{line2}</text>'
            )
        else:
            body += (
                f'<text x="{x + node_w // 2}" y="{cy + 4}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="10" font-weight="700" fill="{tc}">{line1}</text>'
            )

        # Arrow to next
        if i < n - 1:
            ax = x + node_w + 2
            mid_y = node_y + node_h // 2
            body += (
                f'<line x1="{ax}" y1="{mid_y}" x2="{ax + arrow_w - 6}" y2="{mid_y}" '
                f'stroke="{MUTED}" stroke-width="0.8" marker-end="url(#arr)"/>'
            )

    # Legend line
    leg_y = CANVAS_H_PX - 10
    body += (
        f'<line x1="{pad}" y1="{leg_y - 4}" x2="{CANVAS_W_PX - pad}" y2="{leg_y - 4}" '
        f'stroke="{RULE}" stroke-width="0.8"/>'
        f'<text x="{pad}" y="{leg_y + 2}" font-family="{MONO}" font-size="7" fill="{MUTED}">FLOWCHART</text>'
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{CANVAS_W_PX}" height="{CANVAS_H_PX}" '
        f'viewBox="0 0 {CANVAS_W_PX} {CANVAS_H_PX}">'
        + body +
        '</svg>'
    )


def timeline(items: list[dict], title: str = "") -> str:
    """
    Horizontal timeline.
    items: [{"label": "...", "date": "..."}, ...]  max 6
    """
    items = items[:6]
    n = len(items)
    if n == 0:
        return ""

    pad = 30
    step_w = (CANVAS_W_PX - 2 * pad) / max(n - 1, 1)
    mid_y = CANVAS_H_PX // 2
    if title:
        mid_y = mid_y + 10

    body = _dot_grid()

    if title:
        body += (
            f'<text x="{CANVAS_W_PX // 2}" y="18" text-anchor="middle" '
            f'font-family="{FONT}" font-size="11" font-weight="700" fill="{INK}">'
            f'{title}</text>'
        )

    # Spine line
    body += (
        f'<line x1="{pad}" y1="{mid_y}" x2="{CANVAS_W_PX - pad}" y2="{mid_y}" '
        f'stroke="{MUTED}" stroke-width="1"/>'
    )

    for i, item in enumerate(items):
        x = int(pad + i * step_w)
        is_focal = (i == 0)
        r      = 6 if is_focal else 4
        fill   = ACCENT if is_focal else PAPER
        stroke = ACCENT if is_focal else MUTED
        sw     = 1.4 if is_focal else 0.8

        body += (
            f'<circle cx="{x}" cy="{mid_y}" r="{r}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
        )

        label = item.get("label", "")
        date  = item.get("date", "")
        tc    = ACCENT if is_focal else INK

        if i % 2 == 0:
            # label above
            body += (
                f'<text x="{x}" y="{mid_y - 18}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="9" font-weight="700" fill="{tc}">{label}</text>'
            )
            if date:
                body += (
                    f'<text x="{x}" y="{mid_y + 22}" text-anchor="middle" '
                    f'font-family="{MONO}" font-size="7.5" fill="{MUTED}">{date}</text>'
                )
        else:
            # label below
            body += (
                f'<text x="{x}" y="{mid_y + 22}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="9" font-weight="700" fill="{tc}">{label}</text>'
            )
            if date:
                body += (
                    f'<text x="{x}" y="{mid_y - 14}" text-anchor="middle" '
                    f'font-family="{MONO}" font-size="7.5" fill="{MUTED}">{date}</text>'
                )

    leg_y = CANVAS_H_PX - 8
    body += (
        f'<line x1="{pad}" y1="{leg_y - 4}" x2="{CANVAS_W_PX - pad}" y2="{leg_y - 4}" '
        f'stroke="{RULE}" stroke-width="0.8"/>'
        f'<text x="{pad}" y="{leg_y + 2}" font-family="{MONO}" font-size="7" fill="{MUTED}">TIMELINE</text>'
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{CANVAS_W_PX}" height="{CANVAS_H_PX}" '
        f'viewBox="0 0 {CANVAS_W_PX} {CANVAS_H_PX}">'
        + body +
        '</svg>'
    )


def comparison(rows: list[dict], title: str = "") -> str:
    """
    Two-column comparison table.
    rows: [{"label": "...", "a": "...", "b": "..."}, ...]  max 5
    headers come from first item keys or explicit: rows[0].get("header_a"), rows[0].get("header_b")
    """
    rows = rows[:5]
    if not rows:
        return ""

    pad = 20
    header_a = rows[0].get("header_a", "현재") if rows else "현재"
    header_b = rows[0].get("header_b", "개선") if rows else "개선"

    col_label_w = 120
    col_w = (CANVAS_W_PX - 2 * pad - col_label_w) // 2
    row_h = 36
    header_h = 28
    start_y = 20 if not title else 32

    body = _dot_grid()

    if title:
        body += (
            f'<text x="{CANVAS_W_PX // 2}" y="16" text-anchor="middle" '
            f'font-family="{FONT}" font-size="11" font-weight="700" fill="{INK}">'
            f'{title}</text>'
        )

    # Header row
    ax = pad + col_label_w
    bx = ax + col_w
    body += (
        f'<rect x="{pad}" y="{start_y}" width="{col_label_w}" height="{header_h}" '
        f'fill="{PAPER}" stroke="{RULE}" stroke-width="0.8"/>'
        f'<rect x="{ax}" y="{start_y}" width="{col_w}" height="{header_h}" '
        f'fill="{PAPER}" stroke="{RULE}" stroke-width="0.8"/>'
        f'<rect x="{bx}" y="{start_y}" width="{col_w}" height="{header_h}" '
        f'fill="{ACCENT}18" stroke="{ACCENT}" stroke-width="1"/>'
        f'<text x="{ax + col_w // 2}" y="{start_y + 17}" text-anchor="middle" '
        f'font-family="{FONT}" font-size="9" fill="{MUTED}">{header_a}</text>'
        f'<text x="{bx + col_w // 2}" y="{start_y + 17}" text-anchor="middle" '
        f'font-family="{FONT}" font-size="9" font-weight="700" fill="{ACCENT}">{header_b}</text>'
    )

    for i, row in enumerate(rows):
        y = start_y + header_h + i * row_h
        bg = "rgba(28,25,23,0.02)" if i % 2 == 0 else PAPER
        body += (
            f'<rect x="{pad}" y="{y}" width="{col_label_w}" height="{row_h}" '
            f'fill="{bg}" stroke="{RULE}" stroke-width="0.6"/>'
            f'<rect x="{ax}" y="{y}" width="{col_w}" height="{row_h}" '
            f'fill="{bg}" stroke="{RULE}" stroke-width="0.6"/>'
            f'<rect x="{bx}" y="{y}" width="{col_w}" height="{row_h}" '
            f'fill="{ACCENT}08" stroke="{ACCENT}40" stroke-width="0.6"/>'
            f'<text x="{pad + 8}" y="{y + row_h // 2 + 4}" '
            f'font-family="{FONT}" font-size="9" font-weight="700" fill="{INK}">'
            f'{row.get("label", "")}</text>'
            f'<text x="{ax + col_w // 2}" y="{y + row_h // 2 + 4}" text-anchor="middle" '
            f'font-family="{FONT}" font-size="9" fill="{MUTED}">{row.get("a", "")}</text>'
            f'<text x="{bx + col_w // 2}" y="{y + row_h // 2 + 4}" text-anchor="middle" '
            f'font-family="{FONT}" font-size="9" fill="{ACCENT}">{row.get("b", "")}</text>'
        )

    leg_y = CANVAS_H_PX - 8
    body += (
        f'<line x1="{pad}" y1="{leg_y - 4}" x2="{CANVAS_W_PX - pad}" y2="{leg_y - 4}" '
        f'stroke="{RULE}" stroke-width="0.8"/>'
        f'<text x="{pad}" y="{leg_y + 2}" font-family="{MONO}" font-size="7" fill="{MUTED}">COMPARISON</text>'
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{CANVAS_W_PX}" height="{CANVAS_H_PX}" '
        f'viewBox="0 0 {CANVAS_W_PX} {CANVAS_H_PX}">'
        + body +
        '</svg>'
    )


def render_diagram(spec: dict) -> str | None:
    dtype = spec.get("type", "")
    title = spec.get("title", "")

    if dtype == "flowchart":
        steps = spec.get("steps", spec.get("data", []))
        return flowchart(steps=steps, title=title)
    elif dtype == "timeline":
        items = spec.get("items", spec.get("data", []))
        return timeline(items=items, title=title)
    elif dtype == "comparison":
        rows = spec.get("rows", spec.get("data", []))
        return comparison(rows=rows, title=title)
    return None
