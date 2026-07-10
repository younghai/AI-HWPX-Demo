// 단일 데이터 계약 (SPEC-P1b): draft 섹션·다이어그램의 정식 스키마.
// 생성(validate.js)과 내보내기(server/lib/sections.js)가 같은 normalizer 를 쓰므로
// "생성은 엄격, 내보내기는 느슨" 하던 3중 계약 드리프트가 사라진다.
// 의존성 0 (Zod 등 금지 — 프로젝트 no-framework 원칙).

export class ValidationError extends Error {
  constructor(message, path) {
    super(message)
    this.name = 'ValidationError'
    this.path = path
  }
}

export const DIAGRAM_TYPES = ['flowchart', 'timeline', 'comparison']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 섹션 1개를 정규화한다. 반환 shape 은 `{heading, body}` — `id` 는 값이 있을 때만
 * 포함된다(id-less 소비자는 추가 키를 보지 않는다).
 *
 * `requireBody` 만 경로별로 다르다:
 * - 생성(AI 응답): true — AI 는 반드시 본문을 채워야 한다.
 * - 내보내기(편집 결과): false — 사용자가 비운 본문은 "빈 슬롯" 의도로 정당하다.
 *   (worker 가 해당 슬롯을 blank 처리해 미리보기==다운로드를 유지한다.)
 * heading 은 양 경로 모두 필수 — 빈 heading 은 깨진 문서를 만든다.
 */
export function normalizeSection(raw, { requireBody = true, index = 0 } = {}) {
  if (!isPlainObject(raw)) {
    throw new ValidationError(`sections[${index}] 가 객체가 아닙니다.`, `$.sections[${index}]`)
  }
  const heading = typeof raw.heading === 'string' ? raw.heading.trim() : ''
  const body = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (!heading) {
    throw new ValidationError(`sections[${index}].heading 누락`, `$.sections[${index}].heading`)
  }
  if (requireBody && !body) {
    throw new ValidationError(`sections[${index}].body 누락`, `$.sections[${index}].body`)
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  return id ? { id, heading, body } : { heading, body }
}

export function normalizeSections(raw, { requireBody = true } = {}) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('sections 배열이 비어 있거나 잘못되었습니다.', '$.sections')
  }
  return raw.map((section, index) => normalizeSection(section, { requireBody, index }))
}

/**
 * 다이어그램 1개를 정규화한다. 무효(비객체/미지 type)는 null — 호출부가 걸러낸다.
 * `afterSectionId` 는 섹션 id 기반 exact 배치용(값이 있을 때만 포함); legacy
 * `afterSection`(heading 문자열) 은 폴백으로 항상 유지된다.
 * Combined sections+diagrams magic-key 계약은 server/lib/sections.js 문서 참조.
 */
export function normalizeDiagram(spec) {
  if (!isPlainObject(spec)) return null
  const type = typeof spec.type === 'string' ? spec.type.trim() : ''
  if (!DIAGRAM_TYPES.includes(type)) return null
  const title = typeof spec.title === 'string' ? spec.title.trim() : ''
  const afterSection = typeof spec.afterSection === 'string' ? spec.afterSection.trim() : ''
  const afterSectionId = typeof spec.afterSectionId === 'string' ? spec.afterSectionId.trim() : ''
  const data = Array.isArray(spec.data) ? spec.data : []
  return {
    _diagram: true,
    type,
    title,
    afterSection,
    ...(afterSectionId ? { afterSectionId } : {}),
    data
  }
}

export function normalizeDiagrams(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list.map((spec) => normalizeDiagram(spec)).filter(Boolean)
}
