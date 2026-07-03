import { Router } from 'express'
import { buildDraftWithAI, regenerateSectionWithAI } from '../services/draft.js'
import { sendError } from '../lib/errors.js'

const router = Router()

router.post('/api/generate-draft', async (req, res) => {
  try {
    const draft = await buildDraftWithAI(req.body || {})
    res.json({ ok: true, draft })
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/api/regenerate-section', async (req, res) => {
  try {
    const { body } = await regenerateSectionWithAI(req.body || {})
    res.json({ ok: true, body })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
