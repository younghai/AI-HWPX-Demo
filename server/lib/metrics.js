// Lightweight in-memory metrics for local observability (review BE-18 / PO-09).
// Not a full metrics backend — just enough to answer "how many generations
// succeeded/failed and how slow" without external infra. Exposed at /api/metrics.
const counters = {}

function bucket(name) {
  if (!counters[name]) counters[name] = { ok: 0, fail: 0, totalMs: 0, count: 0 }
  return counters[name]
}

// Record one operation's outcome + latency. Returns nothing.
export function record(name, { ok, ms }) {
  const b = bucket(name)
  if (ok) b.ok += 1; else b.fail += 1
  if (typeof ms === 'number') {
    b.totalMs += ms
    b.count += 1
  }
}

// Time an async operation and record it under `name`. Re-throws after recording.
export async function timed(name, fn) {
  const started = Date.now()
  try {
    const result = await fn()
    record(name, { ok: true, ms: Date.now() - started })
    return result
  } catch (err) {
    record(name, { ok: false, ms: Date.now() - started })
    throw err
  }
}

export function snapshot() {
  const out = {}
  for (const [name, b] of Object.entries(counters)) {
    out[name] = {
      ok: b.ok,
      fail: b.fail,
      total: b.ok + b.fail,
      avgMs: b.count ? Math.round(b.totalMs / b.count) : null
    }
  }
  return out
}
