import crypto from 'crypto'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { logger } from '../lib/logger.js'
import { JAVA_BIN } from '../lib/config.js'
import { repoRoot } from '../lib/paths.js'

const vendorDir = path.join(repoRoot, 'vendor', 'hwpconverter')
const converterJar = path.join(vendorDir, 'hwpConverter.jar')
const converterLibGlob = path.join(vendorDir, 'lib', '*')
const CONVERTER_CLASS = 'kr.n.nframe.newfeature.HwpConverterCli'
const STDERR_SNIPPET_BYTES = 1200
const MAX_OUTPUT_CHARS = 64 * 1024
const CONVERTER_TIMEOUT_MS = 60000
const SIGKILL_GRACE_MS = 5000
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

function appendOutput(current, chunk, child, state) {
  if (current.length >= MAX_OUTPUT_CHARS) return current
  const next = current + chunk.toString()
  if (next.length <= MAX_OUTPUT_CHARS) return next
  state.outputExceeded = true
  child.kill('SIGTERM')
  return next.slice(0, MAX_OUTPUT_CHARS)
}

function runConverter(args) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(JAVA_BIN, args, { cwd: repoRoot, env: converterEnv() })
    } catch (err) {
      return resolve({ ok: false, stdout: '', stderr: '', reason: `spawn failed: ${err.message}` })
    }

    const state = { timedOut: false, outputExceeded: false }
    let stdout = ''
    let stderr = ''
    let settled = false
    let killTimer = null

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (killTimer) clearTimeout(killTimer)
      resolve(result)
    }

    const timeout = setTimeout(() => {
      state.timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, SIGKILL_GRACE_MS)
    }, CONVERTER_TIMEOUT_MS)

    child.on('error', (err) => {
      finish({ ok: false, stdout, stderr, reason: `process error: ${err.message}` })
    })
    child.stdout?.on('data', (chunk) => { stdout = appendOutput(stdout, chunk, child, state) })
    child.stderr?.on('data', (chunk) => { stderr = appendOutput(stderr, chunk, child, state) })
    child.on('close', (code, signal) => {
      finish({
        ok: code === 0 && !state.timedOut && !state.outputExceeded,
        stdout: stdout.trim(),
        stderr: stderr.trim() || stdout.trim(),
        reason: state.timedOut ? 'timeout' : state.outputExceeded ? 'output limit exceeded' : `exit ${code}${signal ? ` signal ${signal}` : ''}`
      })
    })
  })
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
    const result = await runConverter(['-Xmx512m', '-cp', classPath, CONVERTER_CLASS, inputHwpPath, outputPath])

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
