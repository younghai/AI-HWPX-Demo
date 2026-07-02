export const DOC_TYPES = [
  { value: 'report', label: '보고서', titleSuffix: '분석 보고서' },
  { value: 'proposal', label: '제안서', titleSuffix: '제안서' },
  { value: 'minutes', label: '회의록', titleSuffix: '회의록' },
  { value: 'gonmun', label: '공문서', titleSuffix: '공문 초안' },
  { value: 'base', label: '기본 문서', titleSuffix: '문서 초안' }
]

export const TOC_TEMPLATES = {
  report: ['배경 및 목적', '현황 분석', '핵심 제안', '실행 계획', '기대 효과'],
  proposal: ['제안 개요', '문제 정의', '해결 방안', '구현 일정', '운영 지원'],
  minutes: ['회의 개요', '주요 논의', '결정 사항', '후속 액션', '일정 공유'],
  gonmun: ['문서 개요', '추진 배경', '요청 사항', '처리 기준', '협조 요청'],
  base: ['문서 개요', '핵심 내용', '세부 항목', '실행 계획', '참고 사항']
}

export function buildToc(docType) {
  return TOC_TEMPLATES[docType] || TOC_TEMPLATES.report
}

export function deriveTitle(fileName, docType) {
  const baseName = String(fileName || '').replace(/\.(hwp|hwpx)$/i, '').trim()
  const found = DOC_TYPES.find((d) => d.value === docType)
  const suffix = found?.titleSuffix || '문서 초안'
  return `${baseName} ${suffix}`.trim()
}

export function labelForDocType(docType) {
  const found = DOC_TYPES.find((d) => d.value === docType)
  return found?.label || '문서'
}
