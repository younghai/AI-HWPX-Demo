import { Router } from 'express'
import multer from 'multer'
import { buildHwpx } from '../services/hwpxBuilder.js'
import { sendError } from '../lib/errors.js'
import { requireSession } from '../lib/authGuard.js'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } })
const router = Router()

// Wrap multer so its errors (e.g. file too large) return JSON, not an HTML 500
// that the client's response.json() cannot parse (review FE-02).
function uploadSourceFile(req, res, next) {
  upload.single('sourceFile')(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        error: `파일이 너무 큽니다. 최대 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB까지 업로드할 수 있습니다.`
      })
    }
    return res.status(400).json({ ok: false, error: '파일 업로드에 실패했습니다.' })
  })
}

router.post('/api/export-hwpx', requireSession, uploadSourceFile, async (req, res) => {
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
