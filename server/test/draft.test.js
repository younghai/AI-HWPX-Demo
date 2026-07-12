import { describe, it, expect } from 'vitest'

import { buildToc, getDocTypeMeta } from '../../shared/docTypes.js'
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

// ── draft generation (mock provider) ─────────────────────────────────────────
import { buildDraftWithAI } from '../services/draft.js'

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

// ── SEC-2: 생성 경로는 요청 body 의 API 키를 받지 않는다 ─────────────────────
import { AI_PROVIDERS } from '../lib/providers-config.js'
import { clearOAuthToken } from '../lib/oauthTokens.js'

describe('draft generation — SEC-2 (no request-body API keys)', () => {
  it('an injected aiApiKey is ignored: with no env/OAuth key generation fails 401 before any provider call', async () => {
    const envKey = AI_PROVIDERS.anthropic.envKey
    const saved = process.env[envKey]
    delete process.env[envKey]
    clearOAuthToken('local', 'anthropic')
    try {
      await expect(
        buildDraftWithAI({ aiProvider: 'anthropic', aiApiKey: 'sk-injected', sourceText: 'x' })
      ).rejects.toMatchObject({ statusCode: 401 })
    } finally {
      if (saved !== undefined) process.env[envKey] = saved
    }
  })
})
