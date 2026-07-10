import { createHttpError } from './errors.js'

/**
 * @typedef {Object} CombinedEntry
 * @property {string} [heading] Section variant heading, validated by shared/validate.js.
 * @property {string} [body] Section variant body, validated by shared/validate.js.
 * @property {string} [type] Diagram variant type, validated by shared/validate.js.
 * @property {string} [title] Diagram variant title, validated by shared/validate.js.
 * @property {Array<unknown>} [data] Diagram variant data, validated by shared/validate.js.
 * @property {string} [afterSection] Diagram placement hint, validated by shared/validate.js.
 * @property {true} [_diagram] Diagram marker; sections.js sets it on combined request diagrams.
 * @property {string} [_pngPath] Attached by hwpxBuilder.js; build_hwpx.py consumes it with _diagram.
 */

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
 * @returns {Array<CombinedEntry>|null} combined [...sections, ...diagrams] or null
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
