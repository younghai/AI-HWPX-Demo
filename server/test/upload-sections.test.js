import { describe, it, expect, afterEach, vi } from 'vitest'

// ── upload validation (BE-08/14) ─────────────────────────────────────────────
import { assertValidUpload, decodeOriginalName } from '../lib/upload.js'

const PK = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

describe('assertValidUpload', () => {
  it('accepts a well-formed .hwpx (PK magic)', () => {
    expect(() => assertValidUpload({ originalname: 'a.hwpx', mimetype: '', buffer: Buffer.concat([PK, Buffer.alloc(10)]) })).not.toThrow()
  })
  it('rejects a .hwpx with wrong magic', () => {
    expect(() => assertValidUpload({ originalname: 'a.hwpx', mimetype: '', buffer: Buffer.from('NOTPK___') })).toThrow()
  })
  it('accepts a well-formed .hwp (OLE magic)', () => {
    expect(() => assertValidUpload({ originalname: 'a.hwp', mimetype: '', buffer: Buffer.concat([OLE, Buffer.alloc(10)]) })).not.toThrow()
  })
  it('rejects a .hwp with wrong magic (arbitrary binary)', () => {
    expect(() => assertValidUpload({ originalname: 'a.hwp', mimetype: 'application/octet-stream', buffer: Buffer.from('MZ__evil') })).toThrow()
  })
  it('rejects an unsupported extension', () => {
    expect(() => assertValidUpload({ originalname: 'a.exe', mimetype: '', buffer: PK })).toThrow()
  })
  it('accepts the Hancom +zip MIME (sample loader tag)', () => {
    expect(() => assertValidUpload({ originalname: 'a.hwpx', mimetype: 'application/hwp+zip', buffer: Buffer.concat([PK, Buffer.alloc(4)]) })).not.toThrow()
  })
})

describe('decodeOriginalName', () => {
  it('returns a fallback for empty', () => {
    expect(decodeOriginalName('')).toBe('uploaded-document')
  })
  it('NFC-normalizes', () => {
    const nfd = 'á.hwpx' // a + combining acute
    expect(decodeOriginalName(nfd)).toBe('á.hwpx'.normalize('NFC'))
  })
})

// ── sections payload parse (PY-08: no silent content loss) ───────────────────
import { parseSectionsPayload } from '../lib/sections.js'

describe('parseSectionsPayload', () => {
  it('returns null when no sections provided (template-only, legit)', () => {
    expect(parseSectionsPayload('', '[]')).toBeNull()
    expect(parseSectionsPayload(undefined, undefined)).toBeNull()
  })
  it('parses a valid sections array + diagrams into a combined list', () => {
    const out = parseSectionsPayload(
      '[{"heading":"h","body":"b"}]',
      '[{"type":"flowchart","data":[]}]'
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ heading: 'h', body: 'b' })
    expect(out[1]._diagram).toBe(true)
  })
  it('throws 422 on unparseable sections (was: silent 200 with empty body)', () => {
    expect(() => parseSectionsPayload('{bad json', '[]')).toThrow(/파싱할 수 없습니다/)
  })
  it('throws 422 when sections is valid JSON but not an array', () => {
    try {
      parseSectionsPayload('{"not":"an array"}', '[]')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.statusCode).toBe(422)
    }
  })
  it('throws 422 on an empty sections array', () => {
    expect(() => parseSectionsPayload('[]', '[]')).toThrow(/비어 있거나/)
  })
  it('degrades a bad diagrams payload to no-diagrams (does not fail export)', () => {
    const warnings = []
    const out = parseSectionsPayload('[{"heading":"h","body":"b"}]', '{bad', {
      onDiagramWarning: (e) => warnings.push(e)
    })
    expect(out).toHaveLength(1)
    expect(warnings).toHaveLength(1)
  })

  // ── SPEC-P1b: export 경로도 shared/schema.js 단일 계약을 쓴다 ──────────────
  it('allows an empty body on export (blanked slot) and preserves the section id', () => {
    const out = parseSectionsPayload('[{"id":"s1","heading":"h","body":""}]', '[]')
    expect(out).toEqual([{ id: 's1', heading: 'h', body: '' }])
  })
  it('rejects a section without a heading with 422 (was: silently exported)', () => {
    try {
      parseSectionsPayload('[{"body":"b"}]', '[]')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.statusCode).toBe(422)
      expect(e.message).toMatch(/heading/)
    }
  })
  it('strips unknown keys (e.g. transient editor flags) from sections', () => {
    const out = parseSectionsPayload('[{"heading":"h","body":"b","regenerating":true}]', '[]')
    expect(out).toEqual([{ heading: 'h', body: 'b' }])
  })
  it('drops invalid diagram entries with the same rule as the generate path', () => {
    const out = parseSectionsPayload(
      '[{"heading":"h","body":"b"}]',
      '[{"type":"nope","data":[]},{"type":"timeline","data":[],"afterSectionId":"s2"}]'
    )
    expect(out).toHaveLength(2)
    expect(out[1].type).toBe('timeline')
    expect(out[1].afterSectionId).toBe('s2')
    expect(out[1]._diagram).toBe(true)
  })
})

describe('buildHwpx', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../lib/utils.js')
    vi.doUnmock('../services/hwpConvert.js')
    vi.doUnmock('../services/validator.js')
  })

  it('does not pass --toc to the Python worker', async () => {
    const runProcess = vi.fn(async () => ({ ok: true, stdout: 'Built test.hwpx', stderr: '' }))
    vi.doMock('../lib/utils.js', () => ({
      runProcess,
      slugify: (value) => String(value).replace(/\s+/g, '-')
    }))
    vi.doMock('../services/hwpConvert.js', () => ({
      convertHwpToHwpx: vi.fn(async () => null),
      isHwpConverterAvailable: vi.fn(() => false)
    }))
    vi.doMock('../services/validator.js', () => ({
      validateHwpx: vi.fn(async () => ({
        ok: true,
        errorCount: 0,
        warningCount: 0,
        violations: [],
        engines: []
      }))
    }))
    vi.resetModules()
    const { buildHwpx } = await import('../services/hwpxBuilder.js')

    await buildHwpx({
      title: '테스트 문서',
      sourceMode: '',
      rawSections: '[{"heading":"유래A","body":"본문"}]',
      rawDiagrams: '[]'
    })

    expect(runProcess).toHaveBeenCalledTimes(1)
    const args = runProcess.mock.calls[0][1]
    expect(args).toContain('--sections-json')
    expect(args).not.toContain('--toc')
  })
})

// ── docFields resolution (C1: label/value table fill) ───────────────────────
import { resolveDocFieldValues } from '../../shared/docTypes.js'

describe('resolveDocFieldValues', () => {
  it('resolves minutes docFields to [{key,label,value}] using docTypes labels', () => {
    const out = resolveDocFieldValues('minutes', { meetingDate: '2026-07-03 14:00', attendees: '김대표, 이과장' })
    expect(out).toEqual([
      { key: 'meetingDate', label: '회의 일시', value: '2026-07-03 14:00' },
      { key: 'attendees', label: '참석자', value: '김대표, 이과장' }
    ])
  })
  it('drops fields with empty/whitespace values (nothing to fill)', () => {
    const out = resolveDocFieldValues('minutes', { meetingDate: '  ', attendees: '박사원' })
    expect(out).toEqual([{ key: 'attendees', label: '참석자', value: '박사원' }])
  })
  it('returns [] for a doc type with no fields (base) or missing docFields', () => {
    expect(resolveDocFieldValues('base', { x: 'y' })).toEqual([])
    expect(resolveDocFieldValues('report', null)).toEqual([])
    expect(resolveDocFieldValues('unknown-type', { a: 'b' })).toEqual([])
  })
  it('ignores docField keys not declared for the type', () => {
    const out = resolveDocFieldValues('gonmun', { sender: '총무과', bogus: 'x' })
    expect(out).toEqual([{ key: 'sender', label: '발신 기관/부서', value: '총무과' }])
  })
})
