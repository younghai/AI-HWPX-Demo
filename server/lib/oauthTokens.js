// Separate store for provider OAuth tokens (review BE-05). Previously the OAuth
// access_token was written into the provider's API-key env slot, which (a) mixed
// a short-lived token into a long-lived secret and (b) dropped the refresh_token,
// so calls failed silently forever once the token expired.
//
// Tokens are held in memory only — not persisted to .env — so a plaintext bearer
// never lands on disk. On restart the user re-authorizes (or uses an API key).
const store = new Map()  // providerKey -> { accessToken, refreshToken, expiresAt }
const EXPIRY_SKEW_MS = 60 * 1000  // refresh a minute early

export function setOAuthToken(providerKey, { accessToken, refreshToken, expiresInSec }) {
  store.set(providerKey, {
    accessToken,
    refreshToken: refreshToken || store.get(providerKey)?.refreshToken || null,
    expiresAt: expiresInSec ? Date.now() + expiresInSec * 1000 : null
  })
}

export function hasOAuthToken(providerKey) {
  return store.has(providerKey)
}

export function clearOAuthToken(providerKey) {
  store.delete(providerKey)
}

// Return a currently-valid access token, refreshing it if expired and a refresh
// token + provider token endpoint are available. Returns null if unavailable.
export async function getValidAccessToken(provider, providerKey) {
  const entry = store.get(providerKey)
  if (!entry) return null

  const stillValid = !entry.expiresAt || entry.expiresAt - EXPIRY_SKEW_MS > Date.now()
  if (stillValid) return entry.accessToken

  if (!entry.refreshToken || !provider.oauth?.tokenUrl) {
    // Expired and unrefreshable — drop it so callers fall back to the API key.
    store.delete(providerKey)
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
      store.delete(providerKey)
      return null
    }
    setOAuthToken(providerKey, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSec: data.expires_in
    })
    return data.access_token
  } catch {
    store.delete(providerKey)
    return null
  }
}
