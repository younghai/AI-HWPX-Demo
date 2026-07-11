// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/diagrams.js', () => ({
  renderDiagramSvg: vi.fn(() => '<svg viewBox="0 0 1 1"></svg>')
}))

vi.mock('../lib/rasterize.js', () => ({
  svgToPngBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' }))
}))

import { renderDiagramSvg } from '../lib/diagrams.js'
import { buildExportFormData } from '../lib/exportForm.js'
import { svgToPngBlob } from '../lib/rasterize.js'

const sourceFile = new File(['source'], 'source.hwpx', { type: 'application/haansofthwpx' })
const sourceInsight = { mode: 'hwpx-template', extractedText: '원문 텍스트' }

function draftFixture(patch = {}) {
  return {
    title: '회의록',
    edited: true,
    sections: [
      { id: 's1', heading: '개요', body: '본문1' },
      { id: 's2', heading: '결론', body: '본문2' }
    ],
    diagrams: [{ type: 'flowchart', title: '흐름', data: ['A'] }],
    ...patch
  }
}

describe('buildExportFormData', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('builds the export FormData fields and diagram image payload', async () => {
    const form = await buildExportFormData({
      draft: draftFixture(),
      sourceFile,
      sourceInsight,
      docType: 'minutes',
      docFields: { 참석자: '홍길동', 일시: '2026-07-11' }
    })

    expect(form.get('title')).toBe('회의록')
    expect(form.get('toc')).toBe('개요\n결론')
    expect(JSON.parse(form.get('sections'))).toEqual(draftFixture().sections)
    expect(JSON.parse(form.get('diagrams'))).toEqual(draftFixture().diagrams)
    expect(form.get('sourceFile')).toBe(sourceFile)
    expect(form.get('sourceMode')).toBe('hwpx-template')
    expect(form.get('sourceText')).toBe('원문 텍스트')
    expect(form.get('edited')).toBe('true')
    expect(form.get('docType')).toBe('minutes')
    expect(JSON.parse(form.get('docFields'))).toEqual({ 참석자: '홍길동', 일시: '2026-07-11' })
    expect(form.getAll('diagramImages')).toHaveLength(1)
    expect(renderDiagramSvg).toHaveBeenCalledWith(draftFixture().diagrams[0])
    expect(svgToPngBlob).toHaveBeenCalledWith('<svg viewBox="0 0 1 1"></svg>')
  })

  it('omits optional docType and empty docFields while stringifying edited false', async () => {
    const form = await buildExportFormData({
      draft: draftFixture({ edited: false, diagrams: [] }),
      sourceFile,
      sourceInsight,
      docType: '',
      docFields: {}
    })

    expect(form.get('edited')).toBe('false')
    expect(form.get('docType')).toBeNull()
    expect(form.get('docFields')).toBeNull()
    expect(form.getAll('diagramImages')).toEqual([])
  })

  it('omits only the failed diagram image and keeps the remaining fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(svgToPngBlob).mockRejectedValueOnce(new Error('canvas failed'))

    const form = await buildExportFormData({
      draft: draftFixture(),
      sourceFile,
      sourceInsight,
      docType: 'minutes',
      docFields: { 참석자: '홍길동' }
    })

    expect(form.get('title')).toBe('회의록')
    expect(form.get('toc')).toBe('개요\n결론')
    expect(form.get('docType')).toBe('minutes')
    expect(JSON.parse(form.get('docFields'))).toEqual({ 참석자: '홍길동' })
    expect(form.getAll('diagramImages')).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('diagram 0 래스터화 실패'), expect.any(Error))
  })
})
