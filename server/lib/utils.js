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

export function runProcess(command, args, cwd, { timeoutMs = 60000, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: env ? { ...process.env, ...env } : undefined })
    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim() || stdout.trim()
      })
    })
  })
}
