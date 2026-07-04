import { Router } from 'express'
import multer from 'multer'
import { buildHwpx } from '../services/hwpxBuilder.js'
import { sendError } from '../lib/errors.js'
import { requireSession } from '../lib/authGuard.js'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } })
const router = Router()

// Accept the source template (sourceFile) plus client pre-rendered diagram PNGs
// (diagramImages, review B1). Wrap multer so its errors (e.g. file too large)
// return JSON, not an HTML 500 the client's response.json() can't parse (FE-02).
const uploadFields = upload.fields([
  { name: 'sourceFile', maxCount: 1 },
  { name: 'diagramImages', maxCount: 20 }
])
function uploadExportFiles(req, res, next) {
  uploadFields(req, res, (err) => {
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

router.post('/api/export-hwpx', requireSession, uploadExportFiles, async (req, res) => {
  try {
    const result = await buildHwpx({
      title: String(req.body?.title || '').trim(),
      rawToc: String(req.body?.toc || '').trim(),
      sourceMode: String(req.body?.sourceMode || '').trim(),
      sourceFile: req.files?.sourceFile?.[0] || null,
      diagramImages: req.files?.diagramImages || [],
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
