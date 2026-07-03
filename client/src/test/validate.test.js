import { describe, it, expect } from 'vitest'
import { validateDraftPayload } from '../../../shared/validate.js'

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
