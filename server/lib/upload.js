import { createHttpError } from './errors.js'

const HWPX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const ALLOWED_UPLOAD_MIME = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.hancom.hwpx',
  'application/haansofthwpx',
  ''
])

export function decodeOriginalName(rawName) {
  if (!rawName) return 'uploaded-document'
  let name = rawName
  try {
    const looksMojibake = /[\u00c0-\u00ff]{2,}/.test(rawName)
    if (looksMojibake) {
      name = Buffer.from(rawName, 'latin1').toString('utf8')
    }
  } catch {
    name = rawName
  }
  return name.normalize('NFC')
}

export function assertValidUpload(file) {
  if (!file) return
  const lowerName = (file.originalname || '').toLowerCase()
  const extOk = lowerName.endsWith('.hwp') || lowerName.endsWith('.hwpx')
  if (!extOk) {
    throw createHttpError('지원하지 않는 파일 형식입니다. (.hwp 또는 .hwpx 만 허용)', 415)
  }
  const mime = (file.mimetype || '').toLowerCase()
  if (mime && !ALLOWED_UPLOAD_MIME.has(mime)) {
    throw createHttpError(`허용되지 않은 MIME 타입입니다: ${mime}`, 415)
  }
  if (lowerName.endsWith('.hwpx')) {
    const head = file.buffer?.subarray(0, 4)
    if (!head || !head.equals(HWPX_MAGIC)) {
      throw createHttpError('HWPX 파일 시그니처가 올바르지 않습니다.', 415)
    }
  }
}
