import { DOC_TYPES, buildToc, deriveTitle, labelForDocType, getDocTypeMeta } from '../../../shared/docTypes.js'

export { DOC_TYPES, buildToc, deriveTitle, labelForDocType, getDocTypeMeta }

export function extractTextFromSvg(svg) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  const nodes = Array.from(doc.querySelectorAll('text, tspan'))
  // Drop only *adjacent* duplicates (overlapping text/tspan rendering the same
  // string). Global dedup used to erase legitimately repeated content such as
  // table header rows across the document. See review PO-02.
  const lines = []
  for (const node of nodes) {
    const value = node.textContent?.trim() || ''
    if (!value) continue
    if (lines.length > 0 && lines[lines.length - 1] === value) continue
    lines.push(value)
  }
  return lines.join('\n')
}

// Estimate how many body slots the uploaded template exposes, so the AI can be
// asked to produce that many sections (activates the server's templateBodySlots
// prompt path — review PO-03). Counts clearly-marked heading lines; returns 0
// when the structure is ambiguous so the server falls back to generic guidance.
export function estimateTemplateSlots(extractedText) {
  if (!extractedText) return 0
  // Note: \b word boundaries don't work after Hangul (not \w), so avoid them.
  const headingRe = /^(\d+[.)]|[가-힣][.)]|제?\s?\d+\s?(장|조|절|항)|[□■◦○▪▶]|[IVX]+[.)])\s*\S/
  const count = extractedText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => headingRe.test(line))
    .length
  return count >= 3 && count <= 20 ? count : 0
}

export function buildOptimisticDraft({ sourceInsight, docType, companyName, targetTitle }) {
  const lines = String(sourceInsight.extractedText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const excerpt = lines.slice(0, 8)
  const toc = buildToc(docType)
  const inferredTitle = targetTitle
    || (sourceInsight.fileName ? sourceInsight.fileName.replace(/\.(hwp|hwpx)$/i, '') : '문서 초안')

  // Bodies are intentionally empty — the editor renders a skeleton for the
  // optimistic draft instead of fabricated sentences that could be mistaken for
  // real AI output (review UX-05). Headings come from the doc-type TOC so the
  // structure is visible immediately.
  return {
    title: inferredTitle,
    summary: `${companyName} 기준으로 ${labelForDocType(docType)} 초안을 생성하는 중입니다…`,
    toc,
    sections: toc.map((heading) => ({ heading, body: '' })),
    sourceExcerpt: excerpt,
    engine: 'optimistic-preview'
  }
}

export function getDraftStageItems() {
  return ['원본 문서 분석 완료', '목차 재구성', '초안 생성 완료']
}

export function getDraftItemStatus(draft) {
  return draft?.engine === 'optimistic-preview' ? '준비 중' : '생성됨'
}

export function getDraftSectionLabel(draft) {
  return draft?.engine === 'optimistic-preview' ? 'AI 초안 구성 중' : '원문 기반 · AI 재구성'
}

export function triggerDownload(url, fileName) {
  if (!url) return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName || 'generated.hwpx'
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
