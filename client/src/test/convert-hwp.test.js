import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { requestHwpConversion } from '../lib/convertHwp.js'
import { useDraft } from '../hooks/useDraft.js'
import { useDocumentFlow } from '../hooks/useDocumentFlow.js'

describe('requestHwpConversion (HC-3)', () => {
  afterEach(() => { vi.unstubAllGlobals(); cleanup() })

  it('returns parsed json on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, downloadUrl: '/generated/a.hwp', fileName: 'a.hwp' })
    }))

    await expect(requestHwpConversion('a.hwpx')).resolves.toEqual({
      ok: true,
      downloadUrl: '/generated/a.hwp',
      fileName: 'a.hwp'
    })
    expect(fetch).toHaveBeenCalledWith('/api/convert-hwp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileName: 'a.hwpx' })
    })
  })

  it('returns null on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    await expect(requestHwpConversion('a.hwpx')).resolves.toBeNull()
  })

  it('returns null on network error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    await expect(requestHwpConversion('a.hwpx')).resolves.toBeNull()
  })
})

describe('HWP conversion flow (HC-3)', () => {
  afterEach(() => { vi.unstubAllGlobals(); cleanup() })

  it('clears stale export state when a new source file is selected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        downloadUrl: '/generated/old.hwpx',
        fileName: 'old.hwpx',
        message: 'ok',
        validation: null
      })
    }))

    const rhwp = {
      sourceInsight: { mode: 'hwpx-template', extractedText: '', fileName: 'old.hwpx' },
      builtPreview: { svgs: [] },
      clearBuiltPreview: vi.fn(),
      setParseStatus: vi.fn(),
      parseFile: vi.fn(async () => {})
    }
    const form = {
      sourceFile: new File(['old'], 'old.hwpx'),
      setSourceFile: vi.fn(),
      docType: 'report',
      setDocType: vi.fn(),
      companyName: 'Bizmatrixx',
      goal: '',
      notes: '',
      targetTitle: '',
      setTargetTitle: vi.fn(),
      docFields: {}
    }
    const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn() }
    const providersInfo = {
      hasConfigured: true,
      hasDemo: false,
      usingDemo: false,
      effectiveProvider: 'mock',
      effectiveModel: 'mock',
      hwpConvertAvailable: true,
      openSettings: vi.fn()
    }

    const { result } = renderHook(() => {
      const draftApi = useDraft({ setParseStatus: rhwp.setParseStatus })
      const flow = useDocumentFlow({
        rhwp,
        draftApi,
        toast,
        providersInfo,
        previewPanelRef: { current: null },
        form
      })
      return { draftApi, flow }
    })

    await act(async () => {
      await result.current.draftApi.buildHwpx({
        draftOverride: { title: 'Old', sections: [{ heading: 'A', body: 'B' }] },
        sourceFile: form.sourceFile,
        sourceInsight: rhwp.sourceInsight,
        docType: 'report',
        docFields: {}
      })
    })
    expect(result.current.draftApi.exportState.fileName).toBe('old.hwpx')

    await act(async () => {
      await result.current.flow.handleFileSelect(new File(['new'], 'new.hwpx'))
    })

    expect(result.current.draftApi.exportState.fileName).toBe('')
    expect(result.current.draftApi.exportState.url).toBe('')
    expect(rhwp.parseFile).toHaveBeenCalledWith(expect.any(File), { serverExtract: true })
  })
})
