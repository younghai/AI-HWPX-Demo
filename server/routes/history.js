import { Router } from 'express'
import path from 'path'
import fs from 'fs/promises'
import { requireSession } from '../lib/authGuard.js'
import { sendError } from '../lib/errors.js'
import { generatedDirectory } from '../lib/paths.js'

const router = Router()
const MAX_HISTORY = 20

// Recent generated documents (review PO-07). Files are served by the existing
// /generated static mount; this only lists metadata so a fresh page load can
// re-access past results instead of losing them.
router.get('/api/history', requireSession, async (_req, res) => {
  try {
    let names = []
    try {
      names = await fs.readdir(generatedDirectory)
    } catch (err) {
      if (err.code === 'ENOENT') return res.json({ ok: true, items: [] })
      throw err
    }

    const hwpxNames = names.filter((n) => n.toLowerCase().endsWith('.hwpx'))
    const stats = await Promise.all(hwpxNames.map(async (name) => {
      try {
        const s = await fs.stat(path.join(generatedDirectory, name))
        return { name, size: s.size, mtimeMs: s.mtimeMs }
      } catch {
        return null
      }
    }))

    const items = stats
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, MAX_HISTORY)
      .map((s) => ({
        fileName: s.name,
        downloadUrl: `/generated/${encodeURIComponent(s.name)}`,
        sizeKb: Math.max(1, Math.round(s.size / 1024)),
        createdAt: new Date(s.mtimeMs).toISOString()
      }))

    res.json({ ok: true, items })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
