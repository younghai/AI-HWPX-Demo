export function phaseLabel(p) {
  const secs = p?.elapsedMs ? ` · ${Math.round(p.elapsedMs / 1000)}초` : ''
  switch (p?.phase) {
    case 'prompt': return `AI 프롬프트를 구성했습니다. 응답을 기다리는 중…${secs}`
    case 'calling': return p.attempt > 1
      ? `AI 응답이 지연되어 재시도 중입니다 (${p.attempt}차)…${secs}`
      : `${p.provider || 'AI'}가 초안을 작성하는 중입니다…${secs}`
    case 'parsing': return `AI 응답을 검증하는 중…${secs}`
    default: return `생성 중…${secs}`
  }
}

// POST to the SSE stream endpoint and parse progress/result/error events.
// Throws Error('stream-unavailable') when the transport itself can't stream
// (so the caller can safely fall back to the plain JSON endpoint); a real
// generation error arrives as an SSE `error` event and is thrown as-is (never
// retried, to avoid a second AI charge).
export async function streamGenerateDraft(body, signal, onPhase) {
  let res
  try {
    res = await fetch('/api/generate-draft/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error('stream-unavailable', { cause: err })
  }
  if (!res.ok || !res.body) throw new Error('stream-unavailable')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result = null
  let genError = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      const ev = (raw.match(/^event:\s*(.+)$/m) || [])[1] || 'message'
      const dataLine = (raw.match(/^data:\s*(.+)$/m) || [])[1]
      if (!dataLine) continue
      let data
      try { data = JSON.parse(dataLine) } catch { continue }
      if (ev === 'progress') onPhase?.(data)
      else if (ev === 'result') result = data
      else if (ev === 'error') genError = new Error(data.error || '초안 생성에 실패했습니다.')
    }
  }
  if (genError) throw genError
  if (!result?.draft) throw new Error('stream-unavailable')
  return result.draft
}
