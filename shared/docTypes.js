export const DOC_TYPES = [
  { value: 'report', label: '보고서', titleSuffix: '분석 보고서' },
  { value: 'proposal', label: '제안서', titleSuffix: '제안서' },
  { value: 'minutes', label: '회의록', titleSuffix: '회의록' },
  { value: 'gonmun', label: '공문서', titleSuffix: '공문 초안' },
  { value: 'base', label: '기본 문서', titleSuffix: '문서 초안' }
]

// Per-type prompt guidance + extra input fields so each document type produces
// genuinely different output instead of only a different TOC (review PO-04).
export const DOC_TYPE_META = {
  report: {
    guidance: '객관적 분석과 근거 중심으로 작성하세요. 현황·데이터를 정리하고 시사점을 도출합니다.',
    fields: []
  },
  proposal: {
    guidance: '설득 중심으로 작성하세요. 수신 고객 관점의 가치·차별점·기대효과를 강조합니다.',
    fields: [{ key: 'recipient', label: '수신 고객/기관', placeholder: '예: OO시청 정보화담당관' }]
  },
  minutes: {
    guidance: '사실 기록 중심으로 간결하게 작성하세요. 주요 논의·결정 사항·후속 액션(담당/기한)을 명확히 정리합니다.',
    fields: [
      { key: 'meetingDate', label: '회의 일시', placeholder: '예: 2026-07-03 14:00' },
      { key: 'attendees', label: '참석자', placeholder: '예: 김대표, 이과장, 박사원' }
    ]
  },
  gonmun: {
    guidance: '공문 격식체(‑합니다/‑바랍니다)로 작성하세요. 발신·수신·처리 기준·협조 요청을 명확히 합니다.',
    fields: [{ key: 'sender', label: '발신 기관/부서', placeholder: '예: 총무과' }]
  },
  base: { guidance: '', fields: [] }
}

export function getDocTypeMeta(docType) {
  return DOC_TYPE_META[docType] || DOC_TYPE_META.base
}

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
