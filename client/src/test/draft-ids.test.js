// @vitest-environment jsdom
// SPEC-P1b(완결): client 가 Section.id 를 발급하고 afterSectionId 를 발신하는지.
// 소비 측(python 의 id exact 배치)은 scripts/tests/test_pipeline.py 의
// test_diagram_after_section_id_wins_over_legacy_substring 이 증명한다 —
// 여기서는 발신 측 wire 계약을 잠근다.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// jsdom 에는 canvas/이미지 로딩이 없어 실제 래스터화는 hang 된다 — 빌드 플로우가
// PNG 실패를 서버 렌더 폴백으로 처리하는 기존 경로 그대로 throw 하게 mock.
vi.mock('../lib/rasterize.js', () => ({
  svgToPngBlob: vi.fn(async () => { throw new Error('no canvas in jsdom') })
}))

import { withSectionIds, buildOptimisticDraft, DOC_TYPES } from '../lib/helpers.js'
import { useDraft } from '../hooks/useDraft.js'

describe('withSectionIds', () => {
  it('id 없는 섹션에 id 를 부여하고 기존 id 는 보존한다 (재호출 안정)', () => {
    const draft = { sections: [{ heading: 'A', body: 'a' }, { id: 'keep', heading: 'B', body: 'b' }] }
    const once = withSectionIds(draft)
    expect(once.sections[0].id).toBeTruthy()
    expect(once.sections[1].id).toBe('keep')
    const twice = withSectionIds(once)
    expect(twice.sections.map((s) => s.id)).toEqual(once.sections.map((s) => s.id))
  })

  it('다이어그램 afterSection(heading)을 해당 섹션의 afterSectionId 로 해석한다', () => {
    const draft = {
      sections: [{ heading: '알파', body: '' }, { heading: '베타', body: '' }],
      diagrams: [{ _diagram: true, type: 'flowchart', title: '', afterSection: '베타', data: [] }]
    }
    const out = withSectionIds(draft)
    expect(out.diagrams[0].afterSectionId).toBe(out.sections[1].id)
  })

  it('중복 heading 은 첫 일치 섹션의 id 로 해석한다 (명시적 규칙)', () => {
    const draft = {
      sections: [{ heading: '중복', body: '1' }, { heading: '중복', body: '2' }],
      diagrams: [{ _diagram: true, type: 'timeline', title: '', afterSection: '중복', data: [] }]
    }
    const out = withSectionIds(draft)
    expect(out.diagrams[0].afterSectionId).toBe(out.sections[0].id)
    expect(out.sections[0].id).not.toBe(out.sections[1].id)
  })

  it('미일치 afterSection 과 기존 afterSectionId 는 그대로 둔다 (legacy 폴백 유지)', () => {
    const draft = {
      sections: [{ heading: '알파', body: '' }],
      diagrams: [
        { _diagram: true, type: 'flowchart', title: '', afterSection: '없는 섹션', data: [] },
        { _diagram: true, type: 'flowchart', title: '', afterSection: '알파', afterSectionId: 'preset', data: [] }
      ]
    }
    const out = withSectionIds(draft)
    expect(out.diagrams[0].afterSectionId).toBeUndefined()
    expect(out.diagrams[1].afterSectionId).toBe('preset')
  })
})

describe('buildOptimisticDraft', () => {
  it('모든 섹션이 고유 id 를 가진다', () => {
    const d = buildOptimisticDraft({
      sourceInsight: { extractedText: '', fileName: 't.hwpx' },
      docType: DOC_TYPES[0],
      companyName: '테스트사',
      targetTitle: ''
    })
    const ids = d.sections.map((s) => s.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('useDraft — id 발급점', () => {
  it('addSection 이 새 섹션에 id 를 발급한다', () => {
    const { result } = renderHook(() => useDraft({ setParseStatus: vi.fn() }))
    act(() => result.current.setDraft({ title: 'T', engine: 'edited', sections: [{ id: 's1', heading: 'A', body: 'a' }] }))
    act(() => result.current.addSection(0))
    const sections = result.current.draft.sections
    expect(sections).toHaveLength(2)
    expect(sections[1].heading).toBe('새 섹션')
    expect(sections[1].id).toBeTruthy()
    expect(sections[1].id).not.toBe('s1')
  })
})

describe('buildHwpx wire 계약 (SPEC-P1b)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POST 하는 sections JSON 에 id, diagrams JSON 에 afterSectionId 가 실린다', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, downloadUrl: '/generated/x.hwpx', fileName: 'x.hwpx', message: 'ok', validation: null })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const draft = withSectionIds({
      title: 'T',
      engine: 'edited',
      sections: [{ heading: '알파', body: 'a' }, { heading: '베타', body: 'b' }],
      diagrams: [{ _diagram: true, type: 'flowchart', title: '', afterSection: '베타', data: ['x'] }]
    })
    const { result } = renderHook(() => useDraft({ setParseStatus: vi.fn() }))

    let out
    await act(async () => {
      out = await result.current.buildHwpx({
        draftOverride: draft,
        sourceFile: new File(['x'], 't.hwpx'),
        sourceInsight: { mode: 'hwpx-template', extractedText: '', fileName: 't.hwpx' },
        docType: '',
        docFields: {}
      })
    })

    expect(out).toBeTruthy()
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/export-hwpx')
    expect(call).toBeTruthy()
    const fd = call[1].body
    const sections = JSON.parse(fd.get('sections'))
    expect(sections.map((s) => s.id).every(Boolean)).toBe(true)
    const diagrams = JSON.parse(fd.get('diagrams'))
    expect(diagrams[0].afterSectionId).toBe(sections[1].id)
  })
})
