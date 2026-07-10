import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

describe('hwpConvert', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllEnvs() })

  it('reports converter availability as a boolean without throwing when unavailable', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    const { isHwpConverterAvailable } = await import('../services/hwpConvert.js')

    expect(() => isHwpConverterAvailable()).not.toThrow()
    expect(typeof isHwpConverterAvailable()).toBe('boolean')
  })

  it('returns null quickly when conversion is unavailable', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    const { convertHwpToHwpx } = await import('../services/hwpConvert.js')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwpconv-unavailable-'))

    try {
      await expect(convertHwpToHwpx(path.join(dir, 'input.hwp'), dir)).resolves.toBeNull()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
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
import { buildToc, getDocTypeMeta, resolveDocFieldValues } from '../../shared/docTypes.js'

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

import { buildDocFieldLines, buildPrompt } from '../services/promptBuilder.js'
import { estimateUsage } from '../lib/usage.js'

describe('promptBuilder', () => {
  it('assembles declared doc field lines and drops unrelated keys', () => {
    const meta = getDocTypeMeta('minutes')

    const lines = buildDocFieldLines(meta, {
      meetingDate: '2026-07-10 14:00',
      attendees: '김대표, 이과장',
      ignored: 'x'
    })

    expect(lines).toBe('회의 일시: 2026-07-10 14:00\n참석자: 김대표, 이과장')
  })

  it('preserves uploaded-template prompt bytes for a representative minutes input', () => {
    const meta = getDocTypeMeta('minutes')
    const docFieldLines = buildDocFieldLines(meta, {
      meetingDate: '2026-07-10 14:00',
      attendees: '김대표, 이과장',
      ignored: 'x'
    })

    const prompt = buildPrompt({
      effectiveText: '원문 첫 줄\n원문 둘째 줄',
      hasUploadedTemplate: true,
      title: '7월 운영 회의록',
      docLabel: '회의록',
      companyName: '테스트컴퍼니',
      goal: '후속 액션 정리',
      notes: '표 형식은 유지',
      fallbackToc: buildToc('minutes'),
      templateBodySlots: 6,
      guidance: meta.guidance,
      docFieldLines
    })

    expect(prompt).toContain('아래는 사용자가 업로드한 원본 템플릿 문서에서 추출한 텍스트입니다:')
    expect(prompt).toContain('문서 유형 지침: 사실 기록 중심으로 간결하게 작성하세요. 주요 논의·결정 사항·후속 액션(담당/기한)을 명확히 정리합니다.')
    expect(prompt).toContain('업로드한 템플릿에는 약 6개의 본문 단락 슬롯이 있습니다.')
    expect(prompt).toContain('회의 일시: 2026-07-10 14:00\n참석자: 김대표, 이과장')
    expect(prompt).toHaveLength(1225)
    expect(Buffer.byteLength(prompt, 'utf8')).toBe(2266)
  })
})

describe('estimateUsage', () => {
  it('uses provider-measured tokens when usage is present', () => {
    const usage = estimateUsage({
      promptText: 'ignored prompt',
      outputText: 'ignored output',
      usageFromApi: { inputTokens: 1200, outputTokens: 345 },
      priceIn: 3,
      priceOut: 15,
      elapsedMs: 98
    })

    expect(usage).toEqual({
      elapsedMs: 98,
      tokensMeasured: true,
      estInputTokens: 1200,
      estOutputTokens: 345,
      estCostUsd: 0.0088
    })
  })

  it('estimates tokens from text lengths when provider usage is absent', () => {
    const usage = estimateUsage({
      promptText: 'x'.repeat(3001),
      outputText: 'y'.repeat(1200),
      usageFromApi: null,
      priceIn: 3,
      priceOut: 15,
      elapsedMs: 500
    })

    expect(usage).toEqual({
      elapsedMs: 500,
      tokensMeasured: false,
      estInputTokens: 1001,
      estOutputTokens: 400,
      estCostUsd: 0.009
    })
  })
})

// ── mock AI generator (A1 데모 모드) ─────────────────────────────────────────
import { mockDraftJson, mockSectionBody } from '../services/mockAi.js'
import { validateDraftPayload } from '../../shared/validate.js'

describe('mockAi', () => {
  it('produces a draft that passes the real validateDraftPayload contract', () => {
    const draft = mockDraftJson({ toc: ['배경', '현황', '제안'], docLabel: '보고서', companyName: '테스트', goal: 'x' })
    expect(() => validateDraftPayload(draft)).not.toThrow()
    expect(draft.sections).toHaveLength(3)
    expect(draft.diagrams).toEqual([])
  })
  it('falls back to a default TOC when none is given', () => {
    const draft = mockDraftJson({ toc: [], docLabel: '문서', companyName: '회사' })
    expect(draft.sections.length).toBeGreaterThan(0)
    expect(() => validateDraftPayload(draft)).not.toThrow()
  })
  it('regenerated section body is non-empty plain text', () => {
    const body = mockSectionBody({ heading: '핵심 제안', companyName: '테스트', docLabel: '보고서' })
    expect(body.length).toBeGreaterThan(10)
    expect(body).toContain('핵심 제안')
  })
})

// ── parallel section generation spike (C2) ───────────────────────────────────
import { buildDraftParallel, buildDraftWithAI } from '../services/draft.js'

describe('buildDraftWithAI', () => {
  it('generates a mock-provider draft with existing progress and usage shape', async () => {
    const progress = []
    const draft = await buildDraftWithAI(
      {
        aiProvider: 'mock',
        docType: 'report',
        companyName: '테스트',
        targetTitle: 'T',
        goal: '자료 정리',
        notes: '중복 금지',
        sourceText: '원본 첫 줄\n원본 둘째 줄'
      },
      { onProgress: (event) => progress.push(event) }
    )

    expect(progress.map((event) => event.phase)).toEqual(['prompt', 'calling', 'parsing'])
    expect(draft.sections).toHaveLength(5)
    expect(draft.usage).toMatchObject({
      attempts: 1,
      provider: '데모 (키 불필요)',
      model: 'mock',
      tokensMeasured: false,
      estCostUsd: 0
    })
    expect(draft.engine).toBe('데모 (키 불필요)')
  })
})

describe('buildDraftParallel (C2 spike)', () => {
  it('generates one section per TOC entry via the demo provider + emits progress', async () => {
    const phases = []
    const draft = await buildDraftParallel(
      { aiProvider: 'mock', docType: 'report', companyName: '테스트', targetTitle: 'T' },
      { onProgress: (e) => phases.push(e.phase) }
    )
    expect(draft.sections.length).toBe(5) // report TOC has 5 headings
    expect(draft.sections.every((s) => s.heading && s.body)).toBe(true)
    expect(draft.usage.parallel).toBe(true)
    expect(phases.filter((p) => p === 'section').length).toBe(5)
  })
})

// ── env parse + atomic concurrent write (BE-03) ──────────────────────────────
import { parseEnvFile } from '../lib/env.js'

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines, ignores comments/blanks', () => {
    const m = parseEnvFile('# c\nA=1\n\nB="two"\nC=\n')
    expect(m.get('A')).toBe('1')
    expect(m.get('B')).toBe('two')
    expect(m.get('C')).toBe('')
  })
})

// ── metrics (BE-18) ──────────────────────────────────────────────────────────
import { record, snapshot } from '../lib/metrics.js'

describe('metrics', () => {
  it('records ok/fail + averages latency', () => {
    record('unit_op', { ok: true, ms: 100 })
    record('unit_op', { ok: false, ms: 200 })
    const s = snapshot().unit_op
    expect(s.ok).toBe(1)
    expect(s.fail).toBe(1)
    expect(s.total).toBe(2)
    expect(s.avgMs).toBe(150)
  })
})

// ── oauth token store (BE-05, SEC-1 per-user scoping) ───────────────────────
import { setOAuthToken, hasOAuthToken, getValidAccessToken, clearOAuthToken } from '../lib/oauthTokens.js'
import { tokenOwnerKey } from '../lib/authGuard.js'

describe('oauthTokens', () => {
  afterEach(() => {
    clearOAuthToken('local', 'openai')
    clearOAuthToken('a@x.com', 'openai')
    clearOAuthToken('b@x.com', 'openai')
  })
  it('stores and returns a valid token (owner-scoped)', async () => {
    setOAuthToken('local', 'openai', { accessToken: 'tok', refreshToken: 'r', expiresInSec: 3600 })
    expect(hasOAuthToken('local', 'openai')).toBe(true)
    const provider = { oauth: { tokenUrl: 'https://x', clientIdEnv: 'X', clientSecretEnv: 'Y' } }
    expect(await getValidAccessToken(provider, 'local', 'openai')).toBe('tok')
  })
  it('drops an expired token with no refresh capability', async () => {
    setOAuthToken('local', 'openai', { accessToken: 'tok', refreshToken: null, expiresInSec: -10 })
    const provider = { oauth: null }
    expect(await getValidAccessToken(provider, 'local', 'openai')).toBeNull()
    expect(hasOAuthToken('local', 'openai')).toBe(false)
  })
  it("SEC-1: one user's token is invisible and unusable to another user", async () => {
    setOAuthToken('a@x.com', 'openai', { accessToken: 'tokA', refreshToken: 'r', expiresInSec: 3600 })
    const provider = { oauth: { tokenUrl: 'https://x', clientIdEnv: 'X', clientSecretEnv: 'Y' } }
    expect(hasOAuthToken('a@x.com', 'openai')).toBe(true)
    expect(hasOAuthToken('b@x.com', 'openai')).toBe(false)
    expect(await getValidAccessToken(provider, 'b@x.com', 'openai')).toBeNull()
    expect(await getValidAccessToken(provider, 'a@x.com', 'openai')).toBe('tokA')
  })
})

describe('tokenOwnerKey', () => {
  it('scopes by email, then id, then the local bucket', () => {
    expect(tokenOwnerKey({ email: 'a@x.com', id: 'ignored' })).toBe('a@x.com')
    expect(tokenOwnerKey({ id: 'uid-1' })).toBe('uid-1')
    expect(tokenOwnerKey(null)).toBe('local')
    expect(tokenOwnerKey(undefined)).toBe('local')
  })
})

// ── cleanup sweep (BE-09) ────────────────────────────────────────────────────
import { sweepGenerated } from '../lib/cleanup.js'

describe('sweepGenerated', () => {
  let dir
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-')) })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('deletes files older than TTL, keeps recent ones', async () => {
    const oldF = path.join(dir, 'old.hwpx')
    const newF = path.join(dir, 'new.hwpx')
    await fs.writeFile(oldF, 'x')
    await fs.writeFile(newF, 'y')
    const old = new Date(Date.now() - 48 * 3600 * 1000)
    await fs.utimes(oldF, old, old)
    const res = await sweepGenerated(dir, { now: Date.now() })
    expect(res.removed).toBe(1)
    expect(await fs.readdir(dir)).toEqual(['new.hwpx'])
  })

  it('returns 0 for a missing directory', async () => {
    const res = await sweepGenerated(path.join(dir, 'nope'), { now: Date.now() })
    expect(res.removed).toBe(0)
  })
})

// ── authGuard: local passes, protected 401s (BE-01) ──────────────────────────
function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this }
  }
}

describe('requireSession', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllEnvs() })

  it('local mode passes through without a session', async () => {
    vi.stubEnv('AUTH_MODE', 'local')
    vi.resetModules()
    const { requireSession } = await import('../lib/authGuard.js')
    const res = mockRes()
    let called = false
    requireSession({ cookies: {} }, res, () => { called = true })
    expect(called).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  it('protected mode returns 401 without a session', async () => {
    vi.stubEnv('AUTH_MODE', 'protected')
    vi.resetModules()
    const { requireSession } = await import('../lib/authGuard.js')
    const res = mockRes()
    let called = false
    requireSession({ cookies: {} }, res, () => { called = true })
    expect(called).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body.code).toBe('UNAUTHENTICATED')
  })
})
