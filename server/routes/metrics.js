import { Router } from 'express'
import { requireSession } from '../lib/authGuard.js'
import { snapshot } from '../lib/metrics.js'

const router = Router()

// Local observability snapshot (counts + avg latency for AI/build ops).
router.get('/api/metrics', requireSession, (_req, res) => res.json({ ok: true, metrics: snapshot() }))

export default router
