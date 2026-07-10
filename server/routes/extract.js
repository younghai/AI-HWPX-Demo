import { Router } from 'express'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'
import { sendError } from '../lib/errors.js'
import { requireSession } from '../lib/authGuard.js'
import { decodeOriginalName, assertValidUpload } from '../lib/upload.js'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../../shared/limits.js'
import { workDirectory } from '../lib/paths.js'
import { extractMarkdown, isHwpConverterAvailable } from '../services/hwpConvert.js'

// 프롬프트로 흘러갈 상한보다 넉넉하되 폭주는 차단 — 클라이언트가 최종 예산
// (extractText.js MAX_SOURCE_TEXT_CHARS)으로 다시 자른다.
export const MAX_MARKDOWN_BYTES = 200 * 1024

// 응답에 실을 마크다운 절단 (HC-2). buf 는 Buffer.
export function capMarkdown(buf) {
  if (buf.length <= MAX_MARKDOWN_BYTES) {
    return { markdown: buf.toString('utf-8'), truncated: false }
  }
  return { markdown: buf.subarray(0, MAX_MARKDOWN_BYTES).toString('utf-8'), truncated: true }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } })
const router = Router()

// multer 에러를 JSON 으로 (FE-02 규약 — export.js 와 동일).
function uploadExtractFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
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

// HC-2: 업로드 문서를 hwpConverter 로 Markdown 추출해 표 구조가 보존된
// 원문 컨텍스트를 돌려준다. 변환기 미가용/실패는 HTTP 200 + ok:false —
// 클라이언트는 rhwp flat 텍스트로 폴백한다 (설계: docs/design-hc2-md-context.md).
router.post('/api/extract', requireSession, uploadExtractFile, async (req, res) => {
  let inputPath = null
  let mdPath = null
  try {
    const file = req.file
    if (!file) return res.status(400).json({ ok: false, error: '파일이 없습니다.' })
    file.originalname = decodeOriginalName(file.originalname)
    assertValidUpload(file)

    if (!isHwpConverterAvailable()) {
      return res.json({ ok: false, reason: 'unavailable' })
    }

    const ext = file.originalname.toLowerCase().endsWith('.hwpx') ? '.hwpx' : '.hwp'
    inputPath = path.join(workDirectory, `${crypto.randomUUID()}${ext}`)
    await fs.writeFile(inputPath, file.buffer)

    mdPath = await extractMarkdown(inputPath, workDirectory)
    if (!mdPath) return res.json({ ok: false, reason: 'convert-failed' })

    const { markdown, truncated } = capMarkdown(await fs.readFile(mdPath))
    res.json({ ok: true, markdown, truncated })
  } catch (error) {
    sendError(res, error)
  } finally {
    if (inputPath) fs.unlink(inputPath).catch(() => {})
    if (mdPath) fs.unlink(mdPath).catch(() => {})
  }
})

export default router
