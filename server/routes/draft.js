import { Router } from 'express'
import { buildDraftWithAI, buildDraftParallel, regenerateSectionWithAI } from '../services/draft.js'
import { sendError } from '../lib/errors.js'
import { requireSession } from '../lib/authGuard.js'
import { record } from '../lib/metrics.js'

const router = Router()

router.post('/api/generate-draft', requireSession, async (req, res) => {
  try {
    const draft = await buildDraftWithAI(req.body || {})
    res.json({ ok: true, draft })
  } catch (error) {
    sendError(res, error)
  }
})

// Streaming variant (review B2): emits SSE progress events (phase/attempt/elapsed)
// during generation, then a final `result` or `error` event. The client falls
// back to the plain JSON endpoint above if streaming is unavailable.
router.post('/api/generate-draft/stream', requireSession, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  const started = Date.now()
  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  try {
    // Opt-in experimental parallel section generation (review C2). Off by default.
    const generate = req.body?.parallel === true ? buildDraftParallel : buildDraftWithAI
    const draft = await generate(req.body || {}, {
      onProgress: (evt) => send('progress', { ...evt, elapsedMs: Date.now() - started })
    })
    send('result', { ok: true, draft })
  } catch (error) {
    send('error', { ok: false, error: error.message || '초안 생성에 실패했습니다.' })
  } finally {
    res.end()
  }
})

router.post('/api/regenerate-section', requireSession, async (req, res) => {
  // Section-regenerate rate is a prompt-quality signal (review C4): a high rate
  // vs. ai_draft count means users often reject the first section output.
  const started = Date.now()
  try {
    const { body } = await regenerateSectionWithAI(req.body || {})
    record('section_regenerate', { ok: true, ms: Date.now() - started })
    res.json({ ok: true, body })
  } catch (error) {
    record('section_regenerate', { ok: false, ms: Date.now() - started })
    sendError(res, error)
  }
})

export default router
