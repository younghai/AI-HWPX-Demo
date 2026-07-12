import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { sendError, createHttpError } from '../lib/errors.js'
import { requireSession } from '../lib/authGuard.js'
import { generatedDirectory } from '../lib/paths.js'
import { convertHwpxToHwp, isHwpConverterAvailable } from '../services/hwpConvert.js'

const router = Router()
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/
const MAX_GENERATED_FILE_NAME_BYTES = 255

function generatedUrl(fileName) {
  return `/generated/${encodeURIComponent(fileName)}`
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

router.post('/api/convert-hwp', requireSession, async (req, res) => {
  let tempPath = null
  try {
    const fileName = req.body?.fileName
    if (
      typeof fileName !== 'string' ||
      path.basename(fileName) !== fileName ||
      CONTROL_CHARS.test(fileName) ||
      Buffer.byteLength(fileName, 'utf8') > MAX_GENERATED_FILE_NAME_BYTES
    ) {
      throw createHttpError('올바른 파일명이 아닙니다.', 400)
    }
    if (!fileName.endsWith('.hwpx')) {
      throw createHttpError('HWPX 파일만 HWP로 변환할 수 있습니다.', 400)
    }

    const inputPath = path.join(generatedDirectory, fileName)
    const inputExists = await pathExists(inputPath)
    if (!inputExists) {
      throw createHttpError('변환할 HWPX 파일을 찾을 수 없습니다.', 404)
    }

    const hwpName = fileName.replace(/\.hwpx$/, '.hwp')
    const outputPath = path.join(generatedDirectory, hwpName)
    const cached = await pathExists(outputPath)
    if (cached) {
      return res.json({ ok: true, downloadUrl: generatedUrl(hwpName), fileName: hwpName })
    }

    if (!isHwpConverterAvailable()) {
      return res.json({ ok: false, reason: 'unavailable' })
    }

    tempPath = await convertHwpxToHwp(inputPath, generatedDirectory)
    if (!tempPath) {
      return res.json({ ok: false, reason: 'convert-failed' })
    }

    await fs.rename(tempPath, outputPath)
    tempPath = null
    return res.json({ ok: true, downloadUrl: generatedUrl(hwpName), fileName: hwpName })
  } catch (error) {
    sendError(res, error)
  } finally {
    if (tempPath) fs.unlink(tempPath).catch(() => {})
  }
})

export default router
