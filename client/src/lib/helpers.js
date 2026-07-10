import { DOC_TYPES, buildToc, deriveTitle, labelForDocType, getDocTypeMeta } from '../../../shared/docTypes.js'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../../../shared/limits.js'

export { DOC_TYPES, buildToc, deriveTitle, labelForDocType, getDocTypeMeta }
export { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB }

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

// ── Section identity (SPEC-P1b) ──────────────────────────────────────────────
// 섹션의 안정 id. heading 문자열 대신 이 id 가 섹션의 정체성이 되어, heading 을
// 리네임해도 다이어그램 바인딩(afterSectionId)과 React key 가 유지된다.
export function newSectionId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// 순수 정규화: id 없는 섹션에 id 를 부여하고(기존 id 는 보존 — 재호출해도 안정),
// 각 다이어그램의 afterSection(heading 문자열)을 첫 일치 섹션의 id 로 해석해
// afterSectionId 를 채운다. 미일치/기존 id 는 그대로 둔다(서버·python 의 legacy
// substring 폴백 대상). 적용 지점: 낙관적 draft 생성, 서버 draft 수신, autosave 복구.
export function withSectionIds(draft) {
  if (!draft || !Array.isArray(draft.sections)) return draft
  const sections = draft.sections.map((s) => (s.id ? s : { ...s, id: newSectionId() }))
  const next = { ...draft, sections }
  if (Array.isArray(draft.diagrams)) {
    next.diagrams = draft.diagrams.map((d) => {
      if (!d || d.afterSectionId || !d.afterSection) return d
      const target = sections.find((s) => s.heading === d.afterSection)
      return target ? { ...d, afterSectionId: target.id } : d
    })
  }
  return next
}

export function buildOptimisticDraft({ sourceInsight, docType, companyName, targetTitle }) {
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
    sections: toc.map((heading) => ({ id: newSectionId(), heading, body: '' })),
    engine: 'optimistic-preview'
  }
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
