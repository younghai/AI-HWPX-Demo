import { createHttpError } from './errors.js'

/**
 * Parse the export request's sections + diagrams payloads into a single combined
 * array for the Python worker.
 *
 * Contract (review PY-08):
 * - `rawSections` falsy → returns null (caller builds a template-only document;
 *   this is a legitimate path, not an error).
 * - `rawSections` provided but unparseable, or not a non-empty array → throws a
 *   422. The old inline code swallowed these and proceeded with NO sections,
 *   returning 200 "success" while the user's content silently vanished.
 * - `rawDiagrams` is always optional: a bad payload degrades to "no diagrams"
 *   rather than failing the whole export.
 *
 * @returns {Array<object>|null} combined [...sections, ...diagrams] or null
 */
export function parseSectionsPayload(rawSections, rawDiagrams, { onDiagramWarning } = {}) {
  if (!rawSections) return null

  let sections
  try {
    sections = JSON.parse(rawSections)
  } catch (err) {
    throw createHttpError(`sections 데이터를 파싱할 수 없습니다: ${err.message}`, 422)
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    throw createHttpError('sections 데이터가 비어 있거나 배열 형식이 아닙니다.', 422)
  }

  let diagrams = []
  try {
    const parsed = JSON.parse(rawDiagrams || '[]')
    if (Array.isArray(parsed)) diagrams = parsed.map((d) => ({ ...d, _diagram: true }))
  } catch (err) {
    onDiagramWarning?.(err)
  }

  return [...sections, ...diagrams]
}
