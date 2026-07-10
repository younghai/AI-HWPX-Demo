import { describe, it, expect } from 'vitest'
import { diagramReportFeedback, providerListErrorMessage, usageMessage, validationFeedback } from '../lib/feedback.js'

describe('usageMessage', () => {
  it('returns an empty message when usage is missing', () => {
    expect(usageMessage(null)).toBe('')
  })

  it('formats measured usage with elapsed time and cost', () => {
    expect(usageMessage({ elapsedMs: 1234, estCostUsd: 0.12345, tokensMeasured: true }))
      .toBe('AI 응답 1.2초 · 비용 $0.1235')
  })

  it('marks cost as estimated when tokens were not measured', () => {
    expect(usageMessage({ elapsedMs: 1234, estCostUsd: 0.12345, tokensMeasured: false }))
      .toBe('AI 응답 1.2초 · 추정 비용 $0.1235')
  })

  it('omits the cost when the estimate is zero', () => {
    expect(usageMessage({ elapsedMs: 1234, estCostUsd: 0, tokensMeasured: false }))
      .toBe('AI 응답 1.2초')
  })
})

describe('providerListErrorMessage', () => {
  it('returns the provider list load failure toast text', () => {
    expect(providerListErrorMessage()).toBe('AI provider 목록을 불러오지 못했습니다.')
  })
})

describe('diagramReportFeedback', () => {
  it('returns no feedback when there were no requested diagrams', () => {
    expect(diagramReportFeedback(null)).toBeNull()
    expect(diagramReportFeedback({ requestedCount: 0, embeddedCount: 0 })).toBeNull()
  })

  it('reports full diagram embedding', () => {
    expect(diagramReportFeedback({ requestedCount: 2, embeddedCount: 2 })).toEqual({
      kind: 'info',
      text: '다이어그램 2/2개가 문서에 반영되었습니다.'
    })
  })

  it('reports zero diagram embedding', () => {
    expect(diagramReportFeedback({ requestedCount: 2, embeddedCount: 0 })).toEqual({
      kind: 'error',
      text: '다이어그램 2개가 문서에 반영되지 못했습니다. 미리보기를 다시 생성하거나 브라우저를 새로고침해 보세요.'
    })
  })

  it('reports partial diagram embedding', () => {
    expect(diagramReportFeedback({ requestedCount: 3, embeddedCount: 1 })).toEqual({
      kind: 'error',
      text: '다이어그램 1/3개만 반영되었습니다. 일부 다이어그램이 누락됐습니다.'
    })
  })
})

describe('validationFeedback', () => {
  it('returns no feedback when validation is missing', () => {
    expect(validationFeedback(null)).toBeNull()
  })

  it('reports validation errors', () => {
    expect(validationFeedback({ ok: false, errorCount: 2, warningCount: 1 })).toEqual({
      kind: 'error',
      text: 'HWPX 검증: 에러 2건, 경고 1건. 우측 검증 패널을 확인하세요.'
    })
  })

  it('reports validation warnings', () => {
    expect(validationFeedback({ ok: true, errorCount: 0, warningCount: 3 })).toEqual({
      kind: 'info',
      text: 'HWPX 검증: 경고 3건. 큰 문제는 없습니다.'
    })
  })

  it('reports validation success', () => {
    expect(validationFeedback({ ok: true, errorCount: 0, warningCount: 0 })).toEqual({
      kind: 'success',
      text: 'HWPX 검증 통과! 다운로드할 수 있습니다.'
    })
  })
})
