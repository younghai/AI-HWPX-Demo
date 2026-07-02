import { DOC_TYPES, buildToc, deriveTitle, labelForDocType } from '../../../shared/docTypes.js'

export { DOC_TYPES, buildToc, deriveTitle, labelForDocType }

export function extractTextFromSvg(svg) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  const nodes = Array.from(doc.querySelectorAll('text, tspan'))
  const lines = nodes
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
  return lines.join('\n')
}

export function buildOptimisticDraft({ sourceInsight, docType, companyName, goal, notes, targetTitle }) {
  const lines = String(sourceInsight.extractedText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const excerpt = lines.slice(0, 8)
  const toc = buildToc(docType)
  const inferredTitle = targetTitle
    || (sourceInsight.fileName ? sourceInsight.fileName.replace(/\.(hwp|hwpx)$/i, '') : '문서 초안')

  return {
    title: inferredTitle,
    summary: `${companyName} 기준으로 업로드 문서 내용을 정리해 ${labelForDocType(docType)} 초안을 생성하는 중입니다.`,
    toc,
    sections: toc.map((heading, index) => ({
      heading,
      body: [
        excerpt[index] ? `원문 핵심 문장 "${excerpt[index]}"을 바탕으로 ${heading} 내용을 정리합니다.` : `${heading} 내용을 원문 흐름에 맞게 재구성합니다.`,
        goal ? `생성 요청은 "${goal}" 입니다.` : '',
        notes ? `추가 메모 "${notes}"를 반영합니다.` : '',
        `${inferredTitle} 문서의 ${heading} 섹션 초안을 준비하고 있습니다.`
      ].filter(Boolean).join(' ')
    })),
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
