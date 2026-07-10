import { spawn } from 'child_process'
import { MAX_WORKER_SPAWNS } from './config.js'

// Bound concurrent worker spawns so a burst of exports can't fork-bomb the box
// (each export spawns build_hwpx + validators). Default = cores-2, min 2, and
// overridable via MAX_WORKER_SPAWNS. See review BE-19.
let activeSpawns = 0
const spawnQueue = []

function acquireSpawnSlot() {
  if (activeSpawns < MAX_WORKER_SPAWNS) {
    activeSpawns += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => spawnQueue.push(resolve))
}

function releaseSpawnSlot() {
  const next = spawnQueue.shift()
  if (next) next()
  else activeSpawns = Math.max(0, activeSpawns - 1)
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/\.hwpx$/i, '')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const SIGKILL_GRACE_MS = 5000

export async function runProcess(command, args, cwd, { timeoutMs = 60000, env } = {}) {
  await acquireSpawnSlot()
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { cwd, env: env ? { ...process.env, ...env } : undefined })
    } catch (err) {
      // Synchronous spawn failure (e.g. bad cwd) — never leave the caller hanging.
      releaseSpawnSlot()
      return resolve({ ok: false, stdout: '', stderr: `프로세스를 시작할 수 없습니다: ${err.message}` })
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let killTimer = null

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      releaseSpawnSlot()
      resolve(result)
    }

    // SIGTERM at timeout; if the child ignores it, force SIGKILL after a grace
    // period so a wedged worker (e.g. blocked native lib) can't leak forever.
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      killTimer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* already gone */ } }, SIGKILL_GRACE_MS)
    }, timeoutMs)

    // spawn() can fail asynchronously (ENOENT: python3 missing) — without this
    // the 'close' event never fires and the request hangs indefinitely.
    child.on('error', (err) => {
      finish({ ok: false, stdout: stdout.trim(), stderr: `프로세스 실행 실패: ${err.message}` })
    })

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })

    child.on('close', (code) => {
      finish({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim() || stdout.trim()
      })
    })
  })
}
