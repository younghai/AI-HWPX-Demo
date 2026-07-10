import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('hwpConvert', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllEnvs() })

  it('reports converter availability as a boolean without throwing when unavailable', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    const { isHwpConverterAvailable } = await import('../services/hwpConvert.js')

    expect(() => isHwpConverterAvailable()).not.toThrow()
    expect(typeof isHwpConverterAvailable()).toBe('boolean')
  })

  it('returns null quickly when conversion is unavailable', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    const { convertHwpToHwpx } = await import('../services/hwpConvert.js')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwpconv-unavailable-'))

    try {
      await expect(convertHwpToHwpx(path.join(dir, 'input.hwp'), dir)).resolves.toBeNull()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

// ── env parse + atomic concurrent write (BE-03) ──────────────────────────────
import { parseEnvFile } from '../lib/env.js'

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines, ignores comments/blanks', () => {
    const m = parseEnvFile('# c\nA=1\n\nB="two"\nC=\n')
    expect(m.get('A')).toBe('1')
    expect(m.get('B')).toBe('two')
    expect(m.get('C')).toBe('')
  })
})

// ── metrics (BE-18) ──────────────────────────────────────────────────────────
import { record, snapshot } from '../lib/metrics.js'

describe('metrics', () => {
  it('records ok/fail + averages latency', () => {
    record('unit_op', { ok: true, ms: 100 })
    record('unit_op', { ok: false, ms: 200 })
    const s = snapshot().unit_op
    expect(s.ok).toBe(1)
    expect(s.fail).toBe(1)
    expect(s.total).toBe(2)
    expect(s.avgMs).toBe(150)
  })
})

// ── createTtlStore (P3-c: 3벌 복붙 TTL 스토어의 단일 구현) ───────────────────
import { createTtlStore } from '../lib/ttlStore.js'

describe('createTtlStore', () => {
  it('stores, take() consumes one-shot values, and get() expires by ttl', async () => {
    const store = createTtlStore(50)
    store.set('k', 'v')
    expect(store.get('k')).toBe('v')
    expect(store.take('k')).toBe('v')
    expect(store.get('k')).toBeNull()
    store.set('e', 'x')
    await new Promise((r) => setTimeout(r, 70))
    expect(store.get('e')).toBeNull()
  })
})

// ── runProcess 옵션 (P3-b: spawn 단일화) ─────────────────────────────────────
import { runProcess } from '../lib/utils.js'

describe('runProcess options (P3-b)', () => {
  it('kills and fails when output exceeds maxOutputBytes', async () => {
    const r = await runProcess(
      process.execPath,
      ['-e', "process.stdout.write('x'.repeat(200000))"],
      process.cwd(),
      { maxOutputBytes: 1000, timeoutMs: 10000 }
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('output limit exceeded')
    expect(r.stdout.length).toBeLessThanOrEqual(1000)
  })

  it('exactEnv passes the environment verbatim (no process.env merge)', async () => {
    const r = await runProcess(
      process.execPath,
      ['-e', "console.log((process.env.ONLY || '') + ':' + (process.env.HOME || ''))"],
      process.cwd(),
      { exactEnv: { ONLY: '1', PATH: process.env.PATH }, timeoutMs: 10000 }
    )
    expect(r.ok).toBe(true)
    expect(r.stdout).toBe('1:')
  })
})

// ── cleanup sweep (BE-09) ────────────────────────────────────────────────────
import { sweepGenerated } from '../lib/cleanup.js'

describe('sweepGenerated', () => {
  let dir
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sweep-')) })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('deletes files older than TTL, keeps recent ones', async () => {
    const oldF = path.join(dir, 'old.hwpx')
    const newF = path.join(dir, 'new.hwpx')
    await fs.writeFile(oldF, 'x')
    await fs.writeFile(newF, 'y')
    const old = new Date(Date.now() - 48 * 3600 * 1000)
    await fs.utimes(oldF, old, old)
    const res = await sweepGenerated(dir, { now: Date.now() })
    expect(res.removed).toBe(1)
    expect(await fs.readdir(dir)).toEqual(['new.hwpx'])
  })

  it('returns 0 for a missing directory', async () => {
    const res = await sweepGenerated(path.join(dir, 'nope'), { now: Date.now() })
    expect(res.removed).toBe(0)
  })
})
