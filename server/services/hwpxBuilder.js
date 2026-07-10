import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createHttpError } from '../lib/errors.js'
import { runProcess, slugify } from '../lib/utils.js'
import { decodeOriginalName, assertValidUpload } from '../lib/upload.js'
import { parseSectionsPayload } from '../lib/sections.js'
import { resolveDocFieldValues } from '../../shared/docTypes.js'
import { MAX_DIAGRAM_PNG_BYTES } from '../../shared/limits.js'
import { validateHwpx } from './validator.js'
import { convertHwpToHwpx, isHwpConverterAvailable } from './hwpConvert.js'
import { logger } from '../lib/logger.js'
import { record } from '../lib/metrics.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const scriptsDir = path.join(v4Root, 'scripts')
const buildScript = path.join(scriptsDir, 'build_hwpx.py')
const generatedDir = path.join(v4Root, 'generated')
// Private work dir (NOT served) for uploaded originals + sections JSON, so they
// are never exposed via /generated and can't collide across concurrent requests.
const workDir = path.join(v4Root, '.work')

const venvPython = path.join(v4Root, '.venv', 'bin', 'python3')
const pythonCmd = existsSync(venvPython) ? venvPython : 'python3'

await fs.mkdir(generatedDir, { recursive: true })
await fs.mkdir(workDir, { recursive: true })

export const generatedDirectory = generatedDir

// Map build_hwpx.py's structured stdout error (see its _emit_error) to a
// user-safe message + HTTP status. Falls back to a generic message so raw
// tracebacks never reach the client (CLAUDE.md R4).
const WORKER_ERROR_STATUS = {
  TEMPLATE_NOT_FOUND: 422,
  SECTIONS_PARSE_ERROR: 422,
  BUILD_FAILED: 500
}

function parseWorkerError(stdout) {
  const line = String(stdout || '')
    .split('\n')
    .find((l) => l.startsWith('HWPX_BUILD_ERROR '))
  if (line) {
    try {
      const parsed = JSON.parse(line.slice('HWPX_BUILD_ERROR '.length))
      if (parsed && typeof parsed.message === 'string') {
        return { message: parsed.message, status: WORKER_ERROR_STATUS[parsed.error_code] || 500 }
      }
    } catch {
      /* fall through to generic */
    }
  }
  return { message: 'HWPX 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.', status: 500 }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47])

// Persist client pre-rendered diagram PNGs to the work dir and attach each one's
// path to the matching diagram entry in `combined` (review B1). The client names
// each upload `diagram-{k}.png`, k indexing its diagram list; the k-th diagram
// entry (in order) gets `_pngPath`, so the Python worker embeds those exact bytes
// (preview == download) with no cairosvg needed. Returns the written paths for
// cleanup. Rejects non-PNG or oversized uploads defensively.
async function attachDiagramPngs(combined, diagramImages, workDirPath) {
  const written = []
  if (!Array.isArray(diagramImages) || !diagramImages.length) return written

  const pngByIndex = new Map()
  for (const img of diagramImages) {
    const match = /^diagram-(\d+)\.png$/i.exec(img?.originalname || '')
    if (!match || !img.buffer) continue
    if (img.buffer.length > MAX_DIAGRAM_PNG_BYTES) continue
    if (!img.buffer.subarray(0, 4).equals(PNG_SIGNATURE)) continue
    const p = path.join(workDirPath, `${crypto.randomUUID()}-diagram.png`)
    await fs.writeFile(p, img.buffer)
    pngByIndex.set(Number(match[1]), p)
    written.push(p)
  }
  if (pngByIndex.size) {
    let dIdx = 0
    for (const entry of combined) {
      if (entry && entry._diagram === true) {
        const p = pngByIndex.get(dIdx)
        if (p) entry._pngPath = p
        dIdx += 1
      }
    }
  }
  return written
}

export async function buildHwpx({ title, sourceMode, sourceFile, diagramImages = [], rawSections, rawDiagrams, docType, docFields, edited = false }) {
  if (!title) throw createHttpError('제목이 비어 있습니다.', 422)

  if (sourceFile) {
    sourceFile.originalname = decodeOriginalName(sourceFile.originalname)
    assertValidUpload(sourceFile)
  }

  // Unpredictable, collision-free output name (review BE-04/BE-12). The slug is
  // kept as a human hint; the UUID prevents enumeration and same-ms collisions.
  const outputName = `${slugify(title) || 'generated'}-${crypto.randomUUID()}.hwpx`
  const outputPath = path.join(generatedDir, outputName)

  let templatePath = null
  let uploadedHwpPath = null
  let templateMode = 'generated'
  const sourceDocumentName = (sourceFile?.originalname || 'uploaded-document').normalize('NFC')

  if (sourceFile && sourceFile.originalname.toLowerCase().endsWith('.hwpx')) {
    // Uploaded original goes to the private work dir, never the served dir.
    const uploadPath = path.join(workDir, `${crypto.randomUUID()}.hwpx`)
    await fs.writeFile(uploadPath, sourceFile.buffer)
    templatePath = uploadPath
    templateMode = 'hwpx'
  } else if (sourceFile && sourceFile.originalname.toLowerCase().endsWith('.hwp') && isHwpConverterAvailable()) {
    uploadedHwpPath = path.join(workDir, `${crypto.randomUUID()}.hwp`)
    await fs.writeFile(uploadedHwpPath, sourceFile.buffer)
    const convertedPath = await convertHwpToHwpx(uploadedHwpPath, workDir)
    if (convertedPath) {
      templatePath = convertedPath
      templateMode = 'converted-hwp'
    }
  }

  if (!sourceFile && sourceMode === 'hwpx-template') {
    throw createHttpError('HWPX 양식 기반으로 내보내려면 원본 파일이 필요합니다.', 422)
  }

  let sectionsJsonPath = null
  let diagramPngPaths = []
  const combined = parseSectionsPayload(rawSections, rawDiagrams, {
    onDiagramWarning: (err) => logger.warn({ err: err.message }, 'diagrams JSON parse failed — proceeding without diagrams')
  })
  if (combined) {
    diagramPngPaths = await attachDiagramPngs(combined, diagramImages, workDir)
    sectionsJsonPath = path.join(workDir, `${crypto.randomUUID()}-sections.json`)
    await fs.writeFile(sectionsJsonPath, JSON.stringify(combined), 'utf-8')
  }

  let docFieldsJsonPath = null
  const resolvedFields = resolveDocFieldValues(docType, docFields)
  if (resolvedFields.length) {
    docFieldsJsonPath = path.join(workDir, `${crypto.randomUUID()}-docfields.json`)
    await fs.writeFile(docFieldsJsonPath, JSON.stringify(resolvedFields), 'utf-8')
  }

  // Diagram embed report (review D2): the worker writes requested/embedded/skipped
  // here so we can surface "N/M개 반영" and warn on silent drops.
  const reportJsonPath = path.join(workDir, `${crypto.randomUUID()}-report.json`)

  const args = [
    buildScript,
    '--template', 'gonmun',
    '--output', outputPath,
    '--title', title,
    '--source-document', sourceDocumentName,
    '--report-json', reportJsonPath
  ]
  if (templatePath) args.push('--template-file', templatePath)
  if (sectionsJsonPath) args.push('--sections-json', sectionsJsonPath)
  if (docFieldsJsonPath) args.push('--doc-fields', docFieldsJsonPath)

  // macOS: Homebrew의 libcairo 는 dyld 기본 검색 경로 밖에 있어
  // cairosvg(다이어그램 PNG 변환)가 못 찾는다 → fallback 경로 주입
  const pythonEnv = process.platform === 'darwin'
    ? {
        DYLD_FALLBACK_LIBRARY_PATH: ['/opt/homebrew/lib', '/usr/local/lib', process.env.DYLD_FALLBACK_LIBRARY_PATH]
          .filter(Boolean)
          .join(':')
      }
    : undefined

  const buildStarted = Date.now()
  let result
  let diagramReport = null
  try {
    result = await runProcess(pythonCmd, args, v4Root, { env: pythonEnv })
    try {
      diagramReport = JSON.parse(await fs.readFile(reportJsonPath, 'utf-8'))
    } catch {
      diagramReport = null // report is best-effort; absence never fails the build
    }
  } finally {
    if (templatePath) fs.unlink(templatePath).catch(() => {})
    if (uploadedHwpPath) fs.unlink(uploadedHwpPath).catch(() => {})
    if (sectionsJsonPath) fs.unlink(sectionsJsonPath).catch(() => {})
    if (docFieldsJsonPath) fs.unlink(docFieldsJsonPath).catch(() => {})
    fs.unlink(reportJsonPath).catch(() => {})
    for (const p of diagramPngPaths) fs.unlink(p).catch(() => {})
  }
  record('hwpx_build', { ok: result.ok, ms: Date.now() - buildStarted })

  if (!result.ok) {
    // Clean up any partially-written output so it is never served (review PY-03).
    await fs.unlink(outputPath).catch(() => {})
    const { message, status } = parseWorkerError(result.stdout)
    if (result.stderr) logger.error({ stderr: result.stderr.slice(0, 1200) }, 'build_hwpx worker failed')
    throw createHttpError(message, status)
  }

  // Edit rate (review C4): on a successful build, `ok` counts drafts the user
  // edited before building, `fail` counts unedited — so ok/total = edit rate, a
  // signal of how often the AI's first output needs manual fixing.
  record('draft_edited', { ok: Boolean(edited) })

  // v4: 생성된 HWPX 에 대해 native + polaris 검증 실행.
  // docType 이 지정되면 v4/specs/<docType>.json 으로 polaris 규칙 적용.
  const validation = await validateHwpx(outputPath, { docType })
  const message = templateMode === 'converted-hwp'
    ? '업로드한 HWP 양식을 HWPX로 변환해 새 문서를 생성했습니다.'
    : templateMode === 'hwpx'
      ? '업로드한 HWPX 양식을 기준으로 새 문서를 생성했습니다.'
      : '업로드한 문서 내용을 바탕으로 기본 HWPX 양식의 새 문서를 생성했습니다.'

  return {
    fileName: outputName,
    downloadUrl: `/generated/${outputName}`,
    message,
    templateMode,
    validation,
    diagramReport
  }
}
