// Separate store for provider OAuth tokens (review BE-05). Previously the OAuth
// access_token was written into the provider's API-key env slot, which (a) mixed
// a short-lived token into a long-lived secret and (b) dropped the refresh_token,
// so calls failed silently forever once the token expired.
//
// Tokens are held in memory only — not persisted to .env — so a plaintext bearer
// never lands on disk. On restart the user re-authorizes (or uses an API key).
//
// SEC-1: entries are scoped per token OWNER (see authGuard.tokenOwnerKey). A
// global providerKey-only store meant that in AUTH_MODE=protected one user's
// connected account silently paid for every other user's generations. Local
// single-user mode has no login, so everything shares the 'local' bucket —
// behaviorally identical to the old global store.
const store = new Map()  // `${owner}\u0000${providerKey}` -> { accessToken, refreshToken, expiresAt }
const EXPIRY_SKEW_MS = 60 * 1000  // refresh a minute early

// NUL separator: cannot appear in an email address or provider key, so the
// composite key can never collide across owners.
function entryKey(owner, providerKey) {
  return `${owner}\u0000${providerKey}`
}

export function setOAuthToken(owner, providerKey, { accessToken, refreshToken, expiresInSec }) {
  const key = entryKey(owner, providerKey)
  store.set(key, {
    accessToken,
    refreshToken: refreshToken || store.get(key)?.refreshToken || null,
    expiresAt: expiresInSec ? Date.now() + expiresInSec * 1000 : null
  })
}

export function hasOAuthToken(owner, providerKey) {
  return store.has(entryKey(owner, providerKey))
}

export function clearOAuthToken(owner, providerKey) {
  store.delete(entryKey(owner, providerKey))
}

// Return a currently-valid access token for this owner, refreshing it if expired
// and a refresh token + provider token endpoint are available. Returns null if
// unavailable.
export async function getValidAccessToken(provider, owner, providerKey) {
  const key = entryKey(owner, providerKey)
  const entry = store.get(key)
  if (!entry) return null

  const stillValid = !entry.expiresAt || entry.expiresAt - EXPIRY_SKEW_MS > Date.now()
  if (stillValid) return entry.accessToken

  if (!entry.refreshToken || !provider.oauth?.tokenUrl) {
    // Expired and unrefreshable — drop it so callers fall back to the API key.
    store.delete(key)
    return null
  }

  try {
    const res = await fetch(provider.oauth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: entry.refreshToken,
        client_id: process.env[provider.oauth.clientIdEnv] || '',
        client_secret: process.env[provider.oauth.clientSecretEnv] || ''
      })
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      store.delete(key)
      return null
    }
    setOAuthToken(owner, providerKey, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSec: data.expires_in
    })
    return data.access_token
  } catch {
    store.delete(key)
    return null
  }
}
