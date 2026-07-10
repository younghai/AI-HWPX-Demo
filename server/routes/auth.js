import { Router } from 'express'
import crypto from 'crypto'
import { AI_PROVIDERS } from '../lib/providers-config.js'
import { rememberState, consumeState, oauthResultPage } from '../lib/oauth.js'
import { setOAuthToken } from '../lib/oauthTokens.js'
import { currentUser, tokenOwnerKey, AUTH_MODE } from '../lib/authGuard.js'

export function createAuthRouter({ oauthBase, clientOrigin }) {
  const router = Router()

  router.get('/auth/:provider', (req, res) => {
    const providerKey = req.params.provider
    const provider = AI_PROVIDERS[providerKey]
    if (!provider?.oauth) {
      return res.status(400).send('이 프로바이더는 OAuth를 지원하지 않습니다.')
    }
    const clientId = process.env[provider.oauth.clientIdEnv]
    if (!clientId) {
      return res.status(400).send(`OAuth 설정이 필요합니다. .env에 ${provider.oauth.clientIdEnv}를 설정하세요.`)
    }
    // SEC-1: 토큰은 사용자별 버킷에 저장되므로 protected 모드에서는 로그인한
    // 세션만 연결할 수 있다 — 익명 연결은 아무도 읽지 못하는 버킷에 들어갈 뿐이다.
    if (AUTH_MODE === 'protected' && !currentUser(req)) {
      return res.status(401).send('로그인 후 AI 프로바이더를 연결할 수 있습니다.')
    }

    const state = crypto.randomBytes(16).toString('hex')
    rememberState(state, providerKey)

    const redirectUri = `${oauthBase}/auth/${providerKey}/callback`
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: provider.oauth.scope,
      state
    })
    res.redirect(`${provider.oauth.authorizeUrl}?${params}`)
  })

  router.get('/auth/:provider/callback', async (req, res) => {
    const providerKey = req.params.provider
    const provider = AI_PROVIDERS[providerKey]
    const { code, state, error } = req.query

    if (error) {
      return res.send(oauthResultPage(false, `인증 거부: ${error}`, clientOrigin))
    }
    const saved = consumeState(state)
    if (!saved) {
      return res.send(oauthResultPage(false, '잘못된 인증 요청이거나 세션이 만료되었습니다.', clientOrigin))
    }
    if (saved.provider !== providerKey) {
      return res.send(oauthResultPage(false, '인증 세션이 일치하지 않습니다.', clientOrigin))
    }
    if (!provider?.oauth) {
      return res.send(oauthResultPage(false, 'OAuth 미지원 프로바이더입니다.', clientOrigin))
    }
    const sessionUser = currentUser(req)
    if (AUTH_MODE === 'protected' && !sessionUser) {
      return res.send(oauthResultPage(false, '로그인 세션이 만료되었습니다. 다시 로그인한 뒤 연결해 주세요.', clientOrigin))
    }

    const clientId = process.env[provider.oauth.clientIdEnv]
    const clientSecret = process.env[provider.oauth.clientSecretEnv]
    const redirectUri = `${oauthBase}/auth/${providerKey}/callback`

    try {
      const tokenRes = await fetch(provider.oauth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        })
      })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || !tokenData.access_token) {
        return res.send(oauthResultPage(false, tokenData.error_description || tokenData.error || '토큰 교환에 실패했습니다.', clientOrigin))
      }
      // Store in the OAuth token store (in-memory, with expiry + refresh), NOT
      // the .env API-key slot — see lib/oauthTokens.js / review BE-05.
      // Scoped to the requesting user's bucket (SEC-1).
      setOAuthToken(tokenOwnerKey(sessionUser), providerKey, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresInSec: tokenData.expires_in
      })
      res.send(oauthResultPage(true, `${provider.label} OAuth 연결 완료!`, clientOrigin))
    } catch (err) {
      res.send(oauthResultPage(false, `토큰 교환 오류: ${err.message}`, clientOrigin))
    }
  })

  return router
}
