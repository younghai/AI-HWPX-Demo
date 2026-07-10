import { createHttpError } from './errors.js'
import { ValidationError, normalizeSections, normalizeDiagrams } from '../../shared/schema.js'

/**
 * @typedef {Object} CombinedEntry
 * @property {string} [id] Optional stable section id (SPEC-P1b). Passed through to the worker.
 * @property {string} [heading] Section variant heading, validated by shared/schema.js.
 * @property {string} [body] Section variant body (may be empty on the export path — a
 *   deliberately blanked slot), validated by shared/schema.js.
 * @property {string} [type] Diagram variant type, validated by shared/schema.js.
 * @property {string} [title] Diagram variant title, validated by shared/schema.js.
 * @property {Array<unknown>} [data] Diagram variant data, validated by shared/schema.js.
 * @property {string} [afterSection] Diagram placement hint (legacy heading substring).
 * @property {string} [afterSectionId] Diagram placement by section id (exact; wins over afterSection).
 * @property {true} [_diagram] Diagram marker; shared/schema.js sets it on normalized diagrams.
 * @property {string} [_pngPath] Attached by hwpxBuilder.js; build_hwpx.py consumes it with _diagram.
 */

/**
 * Parse the export request's sections + diagrams payloads into a single combined
 * array for the Python worker.
 *
 * Contract (review PY-08 + SPEC-P1b):
 * - `rawSections` falsy → returns null (caller builds a template-only document;
 *   this is a legitimate path, not an error).
 * - `rawSections` provided but unparseable, or failing the shared schema
 *   (non-array, empty, or a section without a heading) → throws a 422. The old
 *   inline code swallowed these and proceeded with NO sections, returning 200
 *   "success" while the user's content silently vanished.
 * - Sections run through the SAME normalizer as the generate path — the only
 *   difference is `requireBody:false` (an edited-empty body is a legitimate
 *   blank slot). Unknown keys (e.g. transient editor flags) are stripped;
 *   optional `id` is preserved for the worker.
 * - `rawDiagrams` is always optional: a bad payload degrades to "no diagrams"
 *   rather than failing the whole export; invalid diagram entries are dropped
 *   by the shared normalizer (same rule as the generate path).
 *
 * @returns {Array<CombinedEntry>|null} combined [...sections, ...diagrams] or null
 */
export function parseSectionsPayload(rawSections, rawDiagrams, { onDiagramWarning } = {}) {
  if (!rawSections) return null

  let sections
  try {
    sections = normalizeSections(JSON.parse(rawSections), { requireBody: false })
  } catch (err) {
    if (err instanceof ValidationError) {
      throw createHttpError(err.message, 422)
    }
    throw createHttpError(`sections 데이터를 파싱할 수 없습니다: ${err.message}`, 422)
  }

  let diagrams = []
  try {
    diagrams = normalizeDiagrams(JSON.parse(rawDiagrams || '[]'))
  } catch (err) {
    onDiagramWarning?.(err)
  }

  return [...sections, ...diagrams]
}
