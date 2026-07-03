import { spawn } from 'child_process'

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/\.hwpx$/i, '')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function sanitizeName(value) {
  return String(value).normalize('NFC').replace(/[^a-zA-Z0-9._\-가-힣]/g, '-')
}

const SIGKILL_GRACE_MS = 5000

export function runProcess(command, args, cwd, { timeoutMs = 60000, env } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { cwd, env: env ? { ...process.env, ...env } : undefined })
    } catch (err) {
      // Synchronous spawn failure (e.g. bad cwd) — never leave the caller hanging.
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
