import { renderDiagramSvg } from './diagrams.js'
import { svgToPngBlob } from './rasterize.js'

export async function buildExportFormData({ draft, sourceFile, sourceInsight, docType, docFields }) {
  // Derive TOC from the (possibly edited/added/removed/reordered) section
  // headings so manual edits always flow through to the built HWPX.
  const toc = draft.sections.map((s) => s.heading)
  const formData = new FormData()
  formData.append('title', draft.title)
  formData.append('toc', toc.join('\n'))
  formData.append('sections', JSON.stringify(draft.sections))
  formData.append('diagrams', JSON.stringify(draft.diagrams || []))
  formData.append('sourceFile', sourceFile)
  formData.append('sourceMode', sourceInsight.mode)
  formData.append('sourceText', sourceInsight.extractedText)
  formData.append('edited', String(Boolean(draft.edited)))  // edit-rate KPI (C4)
  if (docType) formData.append('docType', docType)
  // C1: send docFields so the server can fill label/value form-table cells
  // (e.g. 회의록 일시/참석자). Only when non-empty — otherwise a plain no-op.
  if (docFields && Object.keys(docFields).length) formData.append('docFields', JSON.stringify(docFields))

  // B1: rasterize each diagram to a PNG so the server embeds the exact
  // preview pixels (no cairosvg needed). A failure just omits that PNG —
  // the server then falls back to its own render.
  const diagrams = draft.diagrams || []
  await Promise.all(diagrams.map(async (spec, k) => {
    try {
      const svg = renderDiagramSvg(spec)
      if (!svg) return
      const blob = await svgToPngBlob(svg)
      formData.append('diagramImages', blob, `diagram-${k}.png`)
    } catch (err) {
      console.warn(`diagram ${k} 래스터화 실패 — 서버 렌더링으로 대체`, err)
    }
  }))

  return formData
}
