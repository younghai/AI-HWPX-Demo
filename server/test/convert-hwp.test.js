import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { generatedDirectory } from '../lib/paths.js'

async function dispatchConvertHwp(fileName) {
  const { default: convertHwpRouter } = await import('../routes/convertHwp.js')
  return new Promise((resolve, reject) => {
    const req = {
      method: 'POST',
      url: '/api/convert-hwp',
      originalUrl: '/api/convert-hwp',
      headers: {},
      cookies: {},
      body: { fileName }
    }
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this },
      json(body) { this.body = body; resolve({ status: this.statusCode, body }); return this },
      setHeader() {},
      getHeader() {},
      end() { resolve({ status: this.statusCode, body: this.body }) }
    }
    convertHwpRouter.handle(req, res, reject)
  })
}

describe('convertHwpxToHwp', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllEnvs() })

  it('returns null quickly when the converter is unavailable', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    const { convertHwpxToHwp } = await import('../services/hwpConvert.js')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwpx2hwp-unavailable-'))

    try {
      await expect(convertHwpxToHwp(path.join(dir, 'input.hwpx'), dir)).resolves.toBeNull()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('/api/convert-hwp', () => {
  afterEach(async () => {
    vi.resetModules()
    vi.doUnmock('../services/hwpConvert.js')
    vi.unstubAllEnvs()
    await fs.rm(path.join(generatedDirectory, 'unit-hc3.hwpx'), { force: true })
    await fs.rm(path.join(generatedDirectory, 'unit-hc3.hwp'), { force: true })
  })

  it('rejects traversal file names with 4xx', async () => {
    const res = await dispatchConvertHwp('../x.hwpx')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(res.body.ok).toBe(false)
  })

  it('rejects non-HWPX file names with 4xx', async () => {
    const res = await dispatchConvertHwp('x.hwp')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(res.body.ok).toBe(false)
  })

  it('rejects control characters before filesystem access', async () => {
    const res = await dispatchConvertHwp('unit-hc3\u0000.hwpx')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('올바른 파일명이 아닙니다.')
  })

  it('rejects overlong file names before filesystem access', async () => {
    const res = await dispatchConvertHwp(`${'a'.repeat(5000)}.hwpx`)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('올바른 파일명이 아닙니다.')
  })

  it('rejects missing generated files with 4xx', async () => {
    const res = await dispatchConvertHwp('unit-hc3-missing.hwpx')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(res.body.ok).toBe(false)
  })

  it('returns unavailable gracefully when the converter is not available', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    await fs.mkdir(generatedDirectory, { recursive: true })
    await fs.writeFile(path.join(generatedDirectory, 'unit-hc3.hwpx'), 'fixture')

    const res = await dispatchConvertHwp('unit-hc3.hwpx')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('renames a successful converted file to the matching HWP basename', async () => {
    vi.resetModules()
    vi.doMock('../services/hwpConvert.js', () => ({
      isHwpConverterAvailable: () => true,
      convertHwpxToHwp: async (_inputPath, outDir) => {
        const tempPath = path.join(outDir, 'unit-hc3-temp.hwp')
        await fs.writeFile(tempPath, 'converted')
        return tempPath
      }
    }))
    await fs.mkdir(generatedDirectory, { recursive: true })
    await fs.writeFile(path.join(generatedDirectory, 'unit-hc3.hwpx'), 'fixture')

    const res = await dispatchConvertHwp('unit-hc3.hwpx')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      downloadUrl: '/generated/unit-hc3.hwp',
      fileName: 'unit-hc3.hwp'
    })
    await expect(fs.readFile(path.join(generatedDirectory, 'unit-hc3.hwp'), 'utf8')).resolves.toBe('converted')
  })

  it('returns the cached HWP without requiring converter availability', async () => {
    vi.stubEnv('JAVA_BIN', '__missing_java_for_unit_test__')
    vi.resetModules()
    await fs.mkdir(generatedDirectory, { recursive: true })
    await fs.writeFile(path.join(generatedDirectory, 'unit-hc3.hwpx'), 'fixture')
    await fs.writeFile(path.join(generatedDirectory, 'unit-hc3.hwp'), 'cached')

    const res = await dispatchConvertHwp('unit-hc3.hwpx')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      downloadUrl: '/generated/unit-hc3.hwp',
      fileName: 'unit-hc3.hwp'
    })
  })
})
