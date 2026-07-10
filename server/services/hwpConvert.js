import crypto from 'crypto'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'
import { logger } from '../lib/logger.js'
import { JAVA_BIN } from '../lib/config.js'
import { repoRoot } from '../lib/paths.js'
import { runProcess } from '../lib/utils.js'

const vendorDir = path.join(repoRoot, 'vendor', 'hwpconverter')
const converterJar = path.join(vendorDir, 'hwpConverter.jar')
const converterLibGlob = path.join(vendorDir, 'lib', '*')
const CONVERTER_CLASS = 'kr.n.nframe.newfeature.HwpConverterCli'
const STDERR_SNIPPET_BYTES = 1200
const MAX_OUTPUT_CHARS = 64 * 1024
const CONVERTER_TIMEOUT_MS = 60000
const CHILD_ENV_KEYS = ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'JAVA_HOME', 'TMPDIR']

function probeAvailability() {
  if (!existsSync(converterJar)) {
    return { available: false, reason: 'hwpConverter.jar not found' }
  }
  const javaProbe = spawnSync(JAVA_BIN, ['-version'], { encoding: 'utf8', timeout: 5000 })
  if (javaProbe.error) {
    return { available: false, reason: `java unavailable: ${javaProbe.error.message}` }
  }
  if (javaProbe.status !== 0) {
    return { available: false, reason: `java exited ${javaProbe.status}` }
  }
  return { available: true, reason: 'hwpConverter.jar and java available' }
}

const availability = probeAvailability()
let availabilityLogged = false

function logAvailabilityOnce() {
  if (availabilityLogged) return
  availabilityLogged = true
  if (availability.available) {
    logger.info({ javaBin: JAVA_BIN, converterJar }, 'hwp converter available')
  } else {
    logger.warn({ javaBin: JAVA_BIN, converterJar, reason: availability.reason }, 'hwp converter unavailable')
  }
}

function stderrSnippet(stderr) {
  return String(stderr || '').slice(0, STDERR_SNIPPET_BYTES)
}

function converterEnv() {
  const env = {}
  for (const key of CHILD_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

export function isHwpConverterAvailable() {
  logAvailabilityOnce()
  return availability.available
}

export async function convertHwpToHwpx(inputHwpPath, outDir) {
  try {
    if (!isHwpConverterAvailable()) return null

    await fs.mkdir(outDir, { recursive: true })
    const outputPath = path.join(outDir, `${crypto.randomUUID()}.hwpx`)
    const classPath = [converterJar, converterLibGlob].join(path.delimiter)
    // runProcess 로 통합(P3-b): timeout→SIGTERM→SIGKILL 상태기계 재구현 제거,
    // converter 도 spawn 슬롯 예산(MAX_WORKER_SPAWNS)에 포함된다.
    // exactEnv — CHILD_ENV_KEYS 화이트리스트를 병합 없이 그대로 전달.
    const result = await runProcess(
      JAVA_BIN,
      ['-Xmx512m', '-cp', classPath, CONVERTER_CLASS, inputHwpPath, outputPath],
      repoRoot,
      { timeoutMs: CONVERTER_TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_CHARS, exactEnv: converterEnv() }
    )

    if (!result.ok) {
      await fs.unlink(outputPath).catch(() => {})
      logger.warn({ reason: result.reason, stderr: stderrSnippet(result.stderr) }, 'hwp converter failed')
      return null
    }
    return outputPath
  } catch (err) {
    logger.warn({ err: err?.message }, 'hwp converter failed')
    return null
  }
}
