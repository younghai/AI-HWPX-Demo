// Deterministic mock AI content generator (review PO-11 / A1 데모 모드).
//
// Lets a first-time visitor experience the full upload → generate → edit →
// download loop with NO API key. It does NOT call any network API — it
// synthesizes a coherent, clearly-labeled placeholder draft directly from the
// already-structured request (TOC, doc type, company). The output goes through
// the SAME tryExtractJson + validateDraftPayload pipeline as a real provider,
// so a bug in this generator surfaces as a validation error, not silent junk.
//
// No diagrams are emitted: diagram embedding depends on the (optional) cairosvg
// native lib, and a mock diagram would risk the "preview = download" invariant
// in environments without it. Keeping the demo diagram-free makes it reliable
// everywhere.

// Per-section sentence templates, keyed by position so adjacent sections read
// differently (avoids repetitive-looking output). `{s}` = section heading,
// `{c}` = company, `{d}` = document-type label.
const SENTENCE_SETS = [
  [
    '{s} 항목은 {c}의 현재 상황과 이 {d} 작성의 배경을 설명합니다.',
    '핵심 목적과 기대하는 결과를 간결하게 정리했습니다.',
    '이 내용은 데모 모드로 생성된 예시 문장이며, 실제 AI 응답이 아닙니다.'
  ],
  [
    '{s}에서는 관련 현황과 주요 데이터를 요약합니다.',
    '{c} 관점에서 시사점과 개선이 필요한 지점을 도출합니다.',
    '데모 문장이므로 실제 문서에서는 API 키를 연결해 내용을 채워 주세요.'
  ],
  [
    '{s}은 구체적인 실행 방안과 단계별 접근을 제시합니다.',
    '각 단계의 담당과 우선순위를 명확히 하는 것을 권장합니다.',
    '본 예시는 편집 화면에서 자유롭게 수정할 수 있습니다.'
  ],
  [
    '{s} 단계에서는 일정과 필요한 자원을 정리합니다.',
    '{c}의 목표 달성을 위한 마일스톤을 예시로 배치했습니다.',
    '데모 콘텐츠이니 실제 일정과 수치로 교체해 주세요.'
  ],
  [
    '{s}은 기대 효과와 후속 점검 항목을 정리합니다.',
    '성과 지표와 검토 주기를 함께 명시하면 좋습니다.',
    '이 문단 역시 데모 예시이며 다운로드 전 검토를 권장합니다.'
  ]
]

function fill(template, { s, c, d }) {
  return template.replace(/\{s\}/g, s).replace(/\{c\}/g, c).replace(/\{d\}/g, d)
}

/**
 * Build a demo draft object matching the validateDraftPayload contract.
 * @param {{ toc: string[], title: string, docLabel: string, companyName: string, goal?: string }} ctx
 * @returns {{ summary: string, sections: Array<{heading:string, body:string}>, diagrams: [] }}
 */
export function mockDraftJson({ toc, docLabel, companyName, goal }) {
  const headings = (Array.isArray(toc) && toc.length ? toc : ['개요', '핵심 내용', '실행 계획'])
  const ctxOf = (heading) => ({ s: heading, c: companyName || '회사명', d: docLabel || '문서' })

  const sections = headings.map((heading, i) => {
    const set = SENTENCE_SETS[i % SENTENCE_SETS.length]
    const body = set.map((t) => fill(t, ctxOf(heading))).join(' ')
    return { heading, body }
  })

  const summary = `(데모) ${companyName || '회사명'} 기준으로 ${docLabel || '문서'} 초안을 예시로 생성했습니다.`
    + (goal ? ` 요청: ${goal.slice(0, 60)}` : '')

  return { summary, sections, diagrams: [] }
}

/**
 * Build a demo body for a single regenerated section (plain text, no JSON).
 * @param {{ heading: string, companyName: string, docLabel: string }} ctx
 * @returns {string}
 */
export function mockSectionBody({ heading, companyName, docLabel }) {
  const ctx = { s: heading || '섹션', c: companyName || '회사명', d: docLabel || '문서' }
  return [
    fill('{s} 섹션을 데모 모드로 다시 작성한 예시 본문입니다.', ctx),
    fill('{c}의 맥락을 반영한 3~4문장 분량의 자리표시자 내용입니다.', ctx),
    '실제 재생성은 API 키를 연결하면 사용할 수 있습니다.'
  ].join(' ')
}
