import { Router } from 'express'
import multer from 'multer'
import { buildHwpx } from '../services/hwpxBuilder.js'
import { sendError } from '../lib/errors.js'
import { requireSession } from '../lib/authGuard.js'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../../shared/limits.js'

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
        error: `파일이 너무 큽니다. 최대 ${MAX_UPLOAD_MB}MB까지 업로드할 수 있습니다.`
      })
    }
    return res.status(400).json({ ok: false, error: '파일 업로드에 실패했습니다.' })
  })
}

// docFields arrives as a JSON string in the multipart body. A malformed payload
// degrades to undefined (the worker just skips label/value fill) rather than
// failing the export — the section bodies are the critical content.
function parseDocFields(raw) {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : undefined
  } catch {
    return undefined
  }
}

router.post('/api/export-hwpx', requireSession, uploadExportFiles, async (req, res) => {
  try {
    const result = await buildHwpx({
      title: String(req.body?.title || '').trim(),
      sourceMode: String(req.body?.sourceMode || '').trim(),
      sourceFile: req.files?.sourceFile?.[0] || null,
      diagramImages: req.files?.diagramImages || [],
      rawSections: req.body?.sections || '',
      rawDiagrams: req.body?.diagrams || '[]',
      docType: String(req.body?.docType || '').trim() || undefined,
      docFields: parseDocFields(req.body?.docFields),
      edited: req.body?.edited === 'true'
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
