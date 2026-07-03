import { Router } from 'express'
import { buildDraftWithAI, regenerateSectionWithAI } from '../services/draft.js'
import { sendError } from '../lib/errors.js'
import { requireSession } from '../lib/authGuard.js'

const router = Router()

router.post('/api/generate-draft', requireSession, async (req, res) => {
  try {
    const draft = await buildDraftWithAI(req.body || {})
    res.json({ ok: true, draft })
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/api/regenerate-section', requireSession, async (req, res) => {
  try {
    const { body } = await regenerateSectionWithAI(req.body || {})
    res.json({ ok: true, body })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
