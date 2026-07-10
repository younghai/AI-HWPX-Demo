// 생성(AI 응답) 경로 검증. 섹션/다이어그램 규칙의 단일 출처는 shared/schema.js —
// 여기서는 draft 봉투(summary + sections + diagrams)만 조립한다.
import { ValidationError, normalizeSections, normalizeDiagrams } from './schema.js'

// draft.js 등이 `instanceof ValidationError` 로 재시도 여부를 판단하므로
// 클래스 정체성을 유지한 채 re-export 한다.
export { ValidationError }

export function validateDraftPayload(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('AI 응답이 객체 형식이 아닙니다.', '$')
  }
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
  // AI 는 본문을 반드시 채워야 하므로 requireBody:true (내보내기 경로와의 차이는 이 옵션뿐).
  const sections = normalizeSections(raw.sections, { requireBody: true })
  const diagrams = normalizeDiagrams(raw.diagrams)
  return { summary, sections, diagrams }
}

// Extract the first balanced JSON object from an AI response. Prefers a fenced
// ```json block, then scans brace depth (respecting strings/escapes) so trailing
// prose after the object doesn't corrupt the slice. Falls back to the naive
// first-{…last-} slice for maximum tolerance. (review BE-13)
export function tryExtractJson(text) {
  if (typeof text !== 'string') return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text

  const balanced = extractBalancedObject(candidate)
  if (balanced) {
    try { return JSON.parse(balanced) } catch { /* fall through */ }
  }

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

function extractBalancedObject(str) {
  const start = str.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < str.length; i += 1) {
    const ch = str[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return str.slice(start, i + 1)
    }
  }
  return null
}
