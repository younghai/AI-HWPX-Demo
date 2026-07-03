import { describe, it, expect } from 'vitest'
import { validateDraftPayload, tryExtractJson } from '../../../shared/validate.js'

describe('tryExtractJson', () => {
  it('extracts a plain JSON object', () => {
    expect(tryExtractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('ignores trailing prose after the object (balanced scan)', () => {
    expect(tryExtractJson('{"a":1} 이 뒤에 설명이 붙어도 무시')).toEqual({ a: 1 })
  })
  it('extracts from a fenced ```json block', () => {
    expect(tryExtractJson('설명\n```json\n{"a":2}\n```\n끝')).toEqual({ a: 2 })
  })
  it('handles braces inside string values', () => {
    expect(tryExtractJson('{"body":"수식 {x} 포함","n":3} 뒤 문장')).toEqual({ body: '수식 {x} 포함', n: 3 })
  })
  it('handles nested objects', () => {
    expect(tryExtractJson('prefix {"a":{"b":1}} suffix')).toEqual({ a: { b: 1 } })
  })
  it('returns null when no JSON present', () => {
    expect(tryExtractJson('no json here')).toBeNull()
    expect(tryExtractJson(null)).toBeNull()
  })
})

describe('validateDraftPayload', () => {
  it('accepts a valid draft', () => {
    const draft = {
      summary: '테스트 요약',
      sections: [{ heading: '제목', body: '본문' }],
      diagrams: []
    }
    expect(() => validateDraftPayload(draft)).not.toThrow()
  })

  it('treats summary as optional (defaults to empty string)', () => {
    // summary is intentionally optional — buildDraftWithAI supplies a fallback.
    const draft = {
      sections: [{ heading: '제목', body: '본문' }],
      diagrams: []
    }
    let result
    expect(() => { result = validateDraftPayload(draft) }).not.toThrow()
    expect(result.summary).toBe('')
  })

  it('rejects empty sections', () => {
    const draft = {
      summary: '요약',
      sections: [],
      diagrams: []
    }
    expect(() => validateDraftPayload(draft)).toThrow()
  })
})
