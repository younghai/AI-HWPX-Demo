// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSavedDraft, loadSavedDraft, saveDraft } from '../lib/draftAutosave.js'

function currentAutosaveKey() {
  saveDraft({ title: 'probe', sections: [{ heading: 'Probe', body: '' }] })
  const key = window.localStorage.key(0)
  window.localStorage.clear()
  return key
}

describe('draft autosave', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('returns null when storage is empty, corrupt, or has no sections', () => {
    expect(loadSavedDraft()).toBeNull()

    const key = currentAutosaveKey()
    window.localStorage.setItem(key, '{not json')
    expect(loadSavedDraft()).toBeNull()

    window.localStorage.setItem(key, JSON.stringify({ draft: { sections: [] }, savedAt: 1 }))
    expect(loadSavedDraft()).toBeNull()
  })

  it('returns a valid saved draft object', () => {
    const saved = { draft: { title: 'T', sections: [{ heading: 'A', body: 'B' }] }, savedAt: 123 }
    const key = currentAutosaveKey()
    window.localStorage.setItem(key, JSON.stringify(saved))

    expect(loadSavedDraft()).toEqual(saved)
  })

  it('strips transient regenerating flags before saving', () => {
    vi.spyOn(Date, 'now').mockReturnValue(456)

    saveDraft({
      title: 'T',
      engine: 'edited',
      sections: [
        { heading: 'A', body: 'B', regenerating: true },
        { heading: 'C', body: 'D', regenerating: false }
      ]
    })

    expect(loadSavedDraft()).toEqual({
      draft: {
        title: 'T',
        engine: 'edited',
        sections: [
          { heading: 'A', body: 'B' },
          { heading: 'C', body: 'D' }
        ]
      },
      savedAt: 456
    })
  })

  it('silently ignores quota failures while saving', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })

    expect(() => saveDraft({ sections: [{ heading: 'A', body: 'B' }] })).not.toThrow()
  })

  it('clears saved drafts and silently ignores removal failures', () => {
    saveDraft({ title: 'T', sections: [{ heading: 'A', body: 'B' }] })
    expect(loadSavedDraft()).not.toBeNull()

    clearSavedDraft()
    expect(loadSavedDraft()).toBeNull()

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('disabled') })
    expect(() => clearSavedDraft()).not.toThrow()
  })
})
