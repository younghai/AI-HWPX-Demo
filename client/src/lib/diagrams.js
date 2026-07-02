import { escapeXml } from '../../../shared/escape.js'

const xe = escapeXml

const D = {
  PAPER: '#faf7f2', INK: '#1c1917', MUTED: '#78716c',
  ACCENT: '#b5523a', RULE: 'rgba(28,25,23,0.12)',
  FONT: 'Arial, sans-serif', MONO: 'Courier New, monospace',
  W: 605, H: 302
}

function _dotGrid() {
  return (
    `<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">` +
    `<circle cx="11" cy="11" r="0.9" fill="${D.INK}" opacity="0.10"/></pattern></defs>` +
    `<rect width="${D.W}" height="${D.H}" fill="${D.PAPER}"/>` +
    `<rect width="${D.W}" height="${D.H}" fill="url(#dots)"/>`
  )
}

function _arrowDefs() {
  return (
    `<defs>` +
    `<marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">` +
    `<path d="M0,0 L0,6 L8,3 z" fill="${D.MUTED}"/></marker>` +
    `</defs>`
  )
}

function _legendLine(label) {
  const legY = D.H - 8
  const pad = 20
  return (
    `<line x1="${pad}" y1="${legY - 4}" x2="${D.W - pad}" y2="${legY - 4}" stroke="${D.RULE}" stroke-width="0.8"/>` +
    `<text x="${pad}" y="${legY + 2}" font-family="${D.MONO}" font-size="7" fill="${D.MUTED}">${xe(label)}</text>`
  )
}

function _svgWrap(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${D.W} ${D.H}" preserveAspectRatio="xMidYMid meet">${body}</svg>`
}

function diagramFlowchart(steps, title = '') {
  const s = steps.slice(0, 5)
  if (!s.length) return null
  const pad = 20, arrowW = 24
  const nodeW = Math.floor((D.W - 2 * pad - (s.length - 1) * arrowW) / s.length)
  const nodeH = 44
  let nodeY = Math.floor((D.H - nodeH) / 2)
  if (title) nodeY += 12

  let body = _dotGrid() + _arrowDefs()

  if (title) {
    body += `<text x="${D.W / 2}" y="20" text-anchor="middle" font-family="${D.FONT}" font-size="11" font-weight="700" fill="${D.INK}">${xe(title)}</text>`
  }

  s.forEach((step, i) => {
    const x = pad + i * (nodeW + arrowW)
    const focal = i === 0
    const fill = focal ? `${D.ACCENT}22` : D.PAPER
    const stroke = focal ? D.ACCENT : D.MUTED
    const sw = focal ? 1.4 : 0.8
    const tc = focal ? D.ACCENT : D.INK

    body += `<rect x="${x}" y="${nodeY}" width="${nodeW}" height="${nodeH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
    body += `<text x="${x + 10}" y="${nodeY + 14}" font-family="${D.MONO}" font-size="8" fill="${D.MUTED}">${i + 1}</text>`

    const words = String(step).split(' ')
    let line1 = '', line2 = ''
    for (const w of words) {
      if ((line1 + ' ' + w).trim().length <= 14) line1 = (line1 + ' ' + w).trim()
      else line2 = (line2 + ' ' + w).trim()
    }
    const cy = nodeY + Math.floor(nodeH / 2)
    if (line2) {
      body += `<text x="${x + nodeW / 2}" y="${cy - 5}" text-anchor="middle" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${tc}">${xe(line1)}</text>`
      body += `<text x="${x + nodeW / 2}" y="${cy + 9}" text-anchor="middle" font-family="${D.FONT}" font-size="10" fill="${tc}">${xe(line2)}</text>`
    } else {
      body += `<text x="${x + nodeW / 2}" y="${cy + 4}" text-anchor="middle" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${tc}">${xe(line1)}</text>`
    }

    if (i < s.length - 1) {
      const ax = x + nodeW + 2, midY = nodeY + Math.floor(nodeH / 2)
      body += `<line x1="${ax}" y1="${midY}" x2="${ax + arrowW - 6}" y2="${midY}" stroke="${D.MUTED}" stroke-width="0.8" marker-end="url(#arr)"/>`
    }
  })

  body += _legendLine('FLOWCHART')
  return _svgWrap(body)
}

function diagramTimeline(items, title = '') {
  const its = items.slice(0, 6)
  if (!its.length) return null
  const pad = 30
  const stepW = (D.W - 2 * pad) / Math.max(its.length - 1, 1)
  let midY = Math.floor(D.H / 2)
  if (title) midY += 10

  let body = _dotGrid()
  if (title) {
    body += `<text x="${D.W / 2}" y="18" text-anchor="middle" font-family="${D.FONT}" font-size="11" font-weight="700" fill="${D.INK}">${xe(title)}</text>`
  }
  body += `<line x1="${pad}" y1="${midY}" x2="${D.W - pad}" y2="${midY}" stroke="${D.MUTED}" stroke-width="1"/>`

  its.forEach((item, i) => {
    const x = Math.round(pad + i * stepW)
    const focal = i === 0
    const r = focal ? 6 : 4
    const fill = focal ? D.ACCENT : D.PAPER
    const stroke = focal ? D.ACCENT : D.MUTED
    const sw = focal ? 1.4 : 0.8
    const tc = focal ? D.ACCENT : D.INK
    const label = item.label || ''
    const date = item.date || ''

    body += `<circle cx="${x}" cy="${midY}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`

    if (i % 2 === 0) {
      body += `<text x="${x}" y="${midY - 18}" text-anchor="middle" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${tc}">${xe(label)}</text>`
      if (date) body += `<text x="${x}" y="${midY + 22}" text-anchor="middle" font-family="${D.MONO}" font-size="9" fill="${D.MUTED}">${xe(date)}</text>`
    } else {
      body += `<text x="${x}" y="${midY + 22}" text-anchor="middle" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${tc}">${xe(label)}</text>`
      if (date) body += `<text x="${x}" y="${midY - 14}" text-anchor="middle" font-family="${D.MONO}" font-size="9" fill="${D.MUTED}">${xe(date)}</text>`
    }
  })

  body += _legendLine('TIMELINE')
  return _svgWrap(body)
}

function diagramComparison(rows, title = '') {
  const rs = rows.slice(0, 5)
  if (!rs.length) return null
  const pad = 20, colLabelW = 120, rowH = 36, headerH = 28
  const colW = Math.floor((D.W - 2 * pad - colLabelW) / 2)
  const startY = title ? 32 : 20
  const headerA = rs[0]?.header_a || '현재'
  const headerB = rs[0]?.header_b || '개선'
  const ax = pad + colLabelW, bx = ax + colW

  let body = _dotGrid()
  if (title) {
    body += `<text x="${D.W / 2}" y="16" text-anchor="middle" font-family="${D.FONT}" font-size="11" font-weight="700" fill="${D.INK}">${xe(title)}</text>`
  }

  body += (
    `<rect x="${pad}" y="${startY}" width="${colLabelW}" height="${headerH}" fill="${D.PAPER}" stroke="${D.RULE}" stroke-width="0.8"/>` +
    `<rect x="${ax}" y="${startY}" width="${colW}" height="${headerH}" fill="${D.PAPER}" stroke="${D.RULE}" stroke-width="0.8"/>` +
    `<rect x="${bx}" y="${startY}" width="${colW}" height="${headerH}" fill="${D.ACCENT}18" stroke="${D.ACCENT}" stroke-width="1"/>` +
    `<text x="${ax + colW / 2}" y="${startY + 17}" text-anchor="middle" font-family="${D.FONT}" font-size="10" fill="${D.MUTED}">${xe(headerA)}</text>` +
    `<text x="${bx + colW / 2}" y="${startY + 17}" text-anchor="middle" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${D.ACCENT}">${xe(headerB)}</text>`
  )

  rs.forEach((row, i) => {
    const y = startY + headerH + i * rowH
    const bg = i % 2 === 0 ? 'rgba(28,25,23,0.02)' : D.PAPER
    body += (
      `<rect x="${pad}" y="${y}" width="${colLabelW}" height="${rowH}" fill="${bg}" stroke="${D.RULE}" stroke-width="0.6"/>` +
      `<rect x="${ax}" y="${y}" width="${colW}" height="${rowH}" fill="${bg}" stroke="${D.RULE}" stroke-width="0.6"/>` +
      `<rect x="${bx}" y="${y}" width="${colW}" height="${rowH}" fill="${D.ACCENT}08" stroke="${D.ACCENT}40" stroke-width="0.6"/>` +
      `<text x="${pad + 8}" y="${y + rowH / 2 + 4}" font-family="${D.FONT}" font-size="10" font-weight="700" fill="${D.INK}">${xe(row.label || '')}</text>` +
      `<text x="${ax + colW / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-family="${D.FONT}" font-size="10" fill="${D.MUTED}">${xe(row.a || '')}</text>` +
      `<text x="${bx + colW / 2}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-family="${D.FONT}" font-size="10" fill="${D.ACCENT}">${xe(row.b || '')}</text>`
    )
  })

  body += _legendLine('COMPARISON')
  return _svgWrap(body)
}

export function renderDiagramSvg(spec) {
  if (!spec) return null
  const { type, title = '', data = [] } = spec
  if (type === 'flowchart') return diagramFlowchart(data, title)
  if (type === 'timeline') return diagramTimeline(data, title)
  if (type === 'comparison') return diagramComparison(data, title)
  return null
}
