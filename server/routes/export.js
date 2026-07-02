import { Router } from 'express'
import multer from 'multer'
import { buildHwpx } from '../services/hwpxBuilder.js'
import { sendError } from '../lib/errors.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
const router = Router()

router.post('/api/export-hwpx', upload.single('sourceFile'), async (req, res) => {
  try {
    const result = await buildHwpx({
      title: String(req.body?.title || '').trim(),
      rawToc: String(req.body?.toc || '').trim(),
      sourceMode: String(req.body?.sourceMode || '').trim(),
      sourceFile: req.file || null,
      rawSections: req.body?.sections || '',
      rawDiagrams: req.body?.diagrams || '[]',
      docType: String(req.body?.docType || '').trim() || undefined
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
