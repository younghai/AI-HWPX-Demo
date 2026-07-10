import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickSourceText, fetchServerExtract, MAX_SOURCE_TEXT_CHARS } from '../lib/extractText.js'

describe('pickSourceText (HC-2)', () => {
  it('adopts server markdown when ok and non-empty', () => {
    const md = '| 일시 | 2026-07-11 |\n|---|---|'
    const picked = pickSourceText('flat text', { ok: true, markdown: md })
    expect(picked.engine).toBe('hwpconverter')
    expect(picked.text).toBe(md)
  })

  it('falls back to flat text when server says ok:false', () => {
    const picked = pickSourceText('flat text', { ok: false, reason: 'unavailable' })
    expect(picked.engine).toBe('rhwp')
    expect(picked.text).toBe('flat text')
  })

  it('falls back when markdown is empty/whitespace', () => {
    const picked = pickSourceText('flat text', { ok: true, markdown: '   \n ' })
    expect(picked.engine).toBe('rhwp')
    expect(picked.text).toBe('flat text')
  })

  it('caps adopted markdown at the shared source-text budget', () => {
    const big = 'x'.repeat(MAX_SOURCE_TEXT_CHARS + 500)
    const picked = pickSourceText('flat', { ok: true, markdown: big })
    expect(picked.engine).toBe('hwpconverter')
    expect(picked.text.length).toBe(MAX_SOURCE_TEXT_CHARS)
  })
})

describe('fetchServerExtract (HC-2)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns parsed json on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, markdown: '# md', truncated: false })
    }))
    const file = new File([new Uint8Array([1, 2, 3])], 'a.hwp')
    await expect(fetchServerExtract(file)).resolves.toEqual({ ok: true, markdown: '# md', truncated: false })
  })

  it('returns null on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const file = new File([new Uint8Array([1])], 'a.hwp')
    await expect(fetchServerExtract(file)).resolves.toBeNull()
  })

  it('returns null on network error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    const file = new File([new Uint8Array([1])], 'a.hwp')
    await expect(fetchServerExtract(file)).resolves.toBeNull()
  })
})
