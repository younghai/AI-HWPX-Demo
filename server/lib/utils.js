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

// 옵션 (P3-b: hwpConvert 의 수제 spawn 상태기계를 흡수하며 확장):
// - env: process.env 위에 병합(기존 계약).
// - exactEnv: 병합 없이 그대로 전달 — 자식 env 화이트리스트가 필요한 호출자용.
// - maxOutputBytes: 초과분은 버리고 SIGTERM — 폭주 출력이 메모리를 채우지 못하게.
// 결과에 reason('timeout' | 'output limit exceeded' | 'exit N' …)을 포함한다.
export async function runProcess(command, args, cwd, { timeoutMs = 60000, env, exactEnv, maxOutputBytes } = {}) {
  await acquireSpawnSlot()
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env: exactEnv ?? (env ? { ...process.env, ...env } : undefined)
      })
    } catch (err) {
      // Synchronous spawn failure (e.g. bad cwd) — never leave the caller hanging.
      releaseSpawnSlot()
      return resolve({ ok: false, stdout: '', stderr: `프로세스를 시작할 수 없습니다: ${err.message}`, reason: 'spawn failed' })
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let killTimer = null
    const state = { timedOut: false, outputExceeded: false }

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
      state.timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* already gone */ } }, SIGKILL_GRACE_MS)
    }, timeoutMs)

    // spawn() can fail asynchronously (ENOENT: python3 missing) — without this
    // the 'close' event never fires and the request hangs indefinitely.
    child.on('error', (err) => {
      finish({ ok: false, stdout: stdout.trim(), stderr: `프로세스 실행 실패: ${err.message}`, reason: 'process error' })
    })

    const append = (current, chunk) => {
      if (maxOutputBytes == null) return current + chunk.toString()
      if (current.length >= maxOutputBytes) return current
      const next = current + chunk.toString()
      if (next.length <= maxOutputBytes) return next
      state.outputExceeded = true
      child.kill('SIGTERM')
      return next.slice(0, maxOutputBytes)
    }
    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk) })

    child.on('close', (code, signal) => {
      finish({
        ok: code === 0 && !state.timedOut && !state.outputExceeded,
        stdout: stdout.trim(),
        stderr: stderr.trim() || stdout.trim(),
        reason: state.timedOut
          ? 'timeout'
          : state.outputExceeded
            ? 'output limit exceeded'
            : `exit ${code}${signal ? ` signal ${signal}` : ''}`
      })
    })
  })
}
