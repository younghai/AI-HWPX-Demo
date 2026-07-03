import path from 'path'
import fs from 'fs/promises'

const TTL_MS = Number(process.env.GENERATED_TTL_MS) || 24 * 60 * 60 * 1000  // 24h
const MAX_TOTAL_BYTES = Number(process.env.GENERATED_MAX_BYTES) || 500 * 1024 * 1024  // 500MB
const SWEEP_INTERVAL_MS = 60 * 60 * 1000  // hourly

// Prune the generated/ directory so a long-running deployment doesn't grow the
// disk without bound (review BE-09). Deletes files older than TTL, then, if the
// directory is still over the size cap, deletes oldest-first until under it.
export async function sweepGenerated(dir, { now }) {
  let names
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return { removed: 0 }
    throw err
  }

  const entries = []
  for (const name of names) {
    try {
      const stat = await fs.stat(path.join(dir, name))
      if (stat.isFile()) entries.push({ name, size: stat.size, mtimeMs: stat.mtimeMs })
    } catch { /* raced deletion — ignore */ }
  }

  let removed = 0
  const survivors = []
  for (const entry of entries) {
    if (now - entry.mtimeMs > TTL_MS) {
      await fs.unlink(path.join(dir, entry.name)).catch(() => {})
      removed += 1
    } else {
      survivors.push(entry)
    }
  }

  // Size cap: delete oldest survivors until under the cap.
  let total = survivors.reduce((sum, e) => sum + e.size, 0)
  if (total > MAX_TOTAL_BYTES) {
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs)
    for (const entry of survivors) {
      if (total <= MAX_TOTAL_BYTES) break
      await fs.unlink(path.join(dir, entry.name)).catch(() => {})
      total -= entry.size
      removed += 1
    }
  }

  return { removed }
}

// Start the recurring sweep. Caller passes a clock so the sweep is testable and
// so the startup pass runs immediately. Timer is unref'd so it never blocks exit.
export function startGeneratedCleanup(dir) {
  const run = () => sweepGenerated(dir, { now: Date.now() }).catch((err) => {
    console.error('[cleanup] generated sweep failed:', err.message)
  })
  run()
  const timer = setInterval(run, SWEEP_INTERVAL_MS)
  timer.unref?.()
  return timer
}
