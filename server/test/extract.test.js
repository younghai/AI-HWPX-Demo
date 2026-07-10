import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// ── HC-2: extractMarkdown 서비스 (미가용 graceful) ───────────────────────────
describe('extractMarkdown', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllEnvs() })

  it('returns null quickly when the converter is unavailable', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    const { extractMarkdown } = await import('../services/hwpConvert.js')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwpmd-unavailable-'))

    try {
      await expect(extractMarkdown(path.join(dir, 'input.hwp'), dir)).resolves.toBeNull()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

// ── HC-2: /api/extract 응답 절단 규약 ────────────────────────────────────────
import { capMarkdown, MAX_MARKDOWN_BYTES } from '../routes/extract.js'

describe('capMarkdown', () => {
  it('passes small markdown through untruncated', () => {
    const { markdown, truncated } = capMarkdown(Buffer.from('| a | b |\n|---|---|\n| 1 | 2 |'))
    expect(truncated).toBe(false)
    expect(markdown).toContain('| a | b |')
  })

  it('caps at MAX_MARKDOWN_BYTES and flags truncation', () => {
    const big = Buffer.alloc(MAX_MARKDOWN_BYTES + 10, 0x61) // 'a' * (cap+10)
    const { markdown, truncated } = capMarkdown(big)
    expect(truncated).toBe(true)
    expect(Buffer.byteLength(markdown, 'utf-8')).toBe(MAX_MARKDOWN_BYTES)
  })

  it('keeps exactly-at-cap content untruncated (boundary)', () => {
    const exact = Buffer.alloc(MAX_MARKDOWN_BYTES, 0x62)
    const { truncated } = capMarkdown(exact)
    expect(truncated).toBe(false)
  })
})
