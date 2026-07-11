import { afterEach, describe, expect, it, vi } from 'vitest'
import { phaseLabel, streamGenerateDraft } from '../lib/draftStream.js'

function sseStream(chunks) {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

describe('phaseLabel', () => {
  it('formats prompt/calling/parsing/default phases with elapsed seconds', () => {
    expect(phaseLabel({ phase: 'prompt', elapsedMs: 1500 }))
      .toBe('AI 프롬프트를 구성했습니다. 응답을 기다리는 중… · 2초')
    expect(phaseLabel({ phase: 'calling', provider: 'OpenAI', attempt: 1, elapsedMs: 1500 }))
      .toBe('OpenAI가 초안을 작성하는 중입니다… · 2초')
    expect(phaseLabel({ phase: 'calling', attempt: 2, elapsedMs: 1500 }))
      .toBe('AI 응답이 지연되어 재시도 중입니다 (2차)… · 2초')
    expect(phaseLabel({ phase: 'parsing', elapsedMs: 1500 }))
      .toBe('AI 응답을 검증하는 중… · 2초')
    expect(phaseLabel({ phase: 'unknown', elapsedMs: 1500 }))
      .toBe('생성 중… · 2초')
  })
})

describe('streamGenerateDraft', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses progress and result SSE events', async () => {
    const draft = { title: 'T', sections: [{ heading: 'A', body: 'B' }] }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: sseStream([
        'event: progress\ndata: {"phase":"prompt","elapsedMs":10}\n\n',
        `event: result\ndata: ${JSON.stringify({ ok: true, draft })}\n\n`
      ])
    }))
    vi.stubGlobal('fetch', fetchMock)
    const onPhase = vi.fn()

    await expect(streamGenerateDraft({ fileName: 'a.hwpx' }, undefined, onPhase)).resolves.toEqual(draft)

    expect(onPhase).toHaveBeenCalledWith({ phase: 'prompt', elapsedMs: 10 })
    expect(fetchMock).toHaveBeenCalledWith('/api/generate-draft/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'a.hwpx' }),
      signal: undefined
    })
  })

  it('throws stream-unavailable when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    await expect(streamGenerateDraft({}, undefined, vi.fn())).rejects.toThrow('stream-unavailable')
  })

  it('throws stream-unavailable when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, body: sseStream([]) })))

    await expect(streamGenerateDraft({}, undefined, vi.fn())).rejects.toThrow('stream-unavailable')
  })

  it('throws the SSE error event message without falling back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: sseStream(['event: error\ndata: {"ok":false,"error":"quota exceeded"}\n\n'])
    })))

    await expect(streamGenerateDraft({}, undefined, vi.fn())).rejects.toThrow('quota exceeded')
  })
})
