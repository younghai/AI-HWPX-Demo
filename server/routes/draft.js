import { Router } from 'express'
import { buildDraftWithAI } from '../services/draft.js'
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

export default router
