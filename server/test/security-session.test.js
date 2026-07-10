import { describe, it, expect, afterEach, vi } from 'vitest'

// ── oauth token store (BE-05, SEC-1 per-user scoping) ───────────────────────
import { setOAuthToken, hasOAuthToken, getValidAccessToken, clearOAuthToken } from '../lib/oauthTokens.js'
import { tokenOwnerKey } from '../lib/authGuard.js'

describe('oauthTokens', () => {
  afterEach(() => {
    clearOAuthToken('local', 'openai')
    clearOAuthToken('a@x.com', 'openai')
    clearOAuthToken('b@x.com', 'openai')
  })
  it('stores and returns a valid token (owner-scoped)', async () => {
    setOAuthToken('local', 'openai', { accessToken: 'tok', refreshToken: 'r', expiresInSec: 3600 })
    expect(hasOAuthToken('local', 'openai')).toBe(true)
    const provider = { oauth: { tokenUrl: 'https://x', clientIdEnv: 'X', clientSecretEnv: 'Y' } }
    expect(await getValidAccessToken(provider, 'local', 'openai')).toBe('tok')
  })
  it('drops an expired token with no refresh capability', async () => {
    setOAuthToken('local', 'openai', { accessToken: 'tok', refreshToken: null, expiresInSec: -10 })
    const provider = { oauth: null }
    expect(await getValidAccessToken(provider, 'local', 'openai')).toBeNull()
    expect(hasOAuthToken('local', 'openai')).toBe(false)
  })
  it("SEC-1: one user's token is invisible and unusable to another user", async () => {
    setOAuthToken('a@x.com', 'openai', { accessToken: 'tokA', refreshToken: 'r', expiresInSec: 3600 })
    const provider = { oauth: { tokenUrl: 'https://x', clientIdEnv: 'X', clientSecretEnv: 'Y' } }
    expect(hasOAuthToken('a@x.com', 'openai')).toBe(true)
    expect(hasOAuthToken('b@x.com', 'openai')).toBe(false)
    expect(await getValidAccessToken(provider, 'b@x.com', 'openai')).toBeNull()
    expect(await getValidAccessToken(provider, 'a@x.com', 'openai')).toBe('tokA')
  })
})

describe('tokenOwnerKey', () => {
  it('scopes by email, then id, then the local bucket', () => {
    expect(tokenOwnerKey({ email: 'a@x.com', id: 'ignored' })).toBe('a@x.com')
    expect(tokenOwnerKey({ id: 'uid-1' })).toBe('uid-1')
    expect(tokenOwnerKey(null)).toBe('local')
    expect(tokenOwnerKey(undefined)).toBe('local')
  })
})

// ── authGuard: local passes, protected 401s (BE-01) ──────────────────────────
function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this }
  }
}

describe('requireSession', () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllEnvs() })

  it('local mode passes through without a session', async () => {
    vi.stubEnv('AUTH_MODE', 'local')
    vi.resetModules()
    const { requireSession } = await import('../lib/authGuard.js')
    const res = mockRes()
    let called = false
    requireSession({ cookies: {} }, res, () => { called = true })
    expect(called).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  it('protected mode returns 401 without a session', async () => {
    vi.stubEnv('AUTH_MODE', 'protected')
    vi.resetModules()
    const { requireSession } = await import('../lib/authGuard.js')
    const res = mockRes()
    let called = false
    requireSession({ cookies: {} }, res, () => { called = true })
    expect(called).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body.code).toBe('UNAUTHENTICATED')
  })
})
