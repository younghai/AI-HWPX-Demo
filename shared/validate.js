export class ValidationError extends Error {
  constructor(message, path) {
    super(message)
    this.name = 'ValidationError'
    this.path = path
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateDraftPayload(raw) {
  if (!isPlainObject(raw)) {
    throw new ValidationError('AI 응답이 객체 형식이 아닙니다.', '$')
  }
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new ValidationError('sections 배열이 비어 있거나 잘못되었습니다.', '$.sections')
  }

  const sections = raw.sections.map((section, index) => {
    if (!isPlainObject(section)) {
      throw new ValidationError(`sections[${index}] 가 객체가 아닙니다.`, `$.sections[${index}]`)
    }
    const heading = typeof section.heading === 'string' ? section.heading.trim() : ''
    const body = typeof section.body === 'string' ? section.body.trim() : ''
    if (!heading) {
      throw new ValidationError(`sections[${index}].heading 누락`, `$.sections[${index}].heading`)
    }
    if (!body) {
      throw new ValidationError(`sections[${index}].body 누락`, `$.sections[${index}].body`)
    }
    return { heading, body }
  })

  const rawDiagrams = Array.isArray(raw.diagrams) ? raw.diagrams : []
  const diagrams = rawDiagrams
    .map((spec) => normalizeDiagram(spec))
    .filter(Boolean)

  return { summary, sections, diagrams }
}

function normalizeDiagram(spec) {
  if (!isPlainObject(spec)) return null
  const type = typeof spec.type === 'string' ? spec.type.trim() : ''
  if (!['flowchart', 'timeline', 'comparison'].includes(type)) return null
  const title = typeof spec.title === 'string' ? spec.title.trim() : ''
  const afterSection = typeof spec.afterSection === 'string' ? spec.afterSection.trim() : ''
  const data = Array.isArray(spec.data) ? spec.data : []
  // Combined sections+diagrams magic-key contract is documented in server/lib/sections.js.
  return { _diagram: true, type, title, afterSection, data }
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
