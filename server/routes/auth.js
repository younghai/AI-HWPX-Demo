import { Router } from 'express'
import crypto from 'crypto'
import { AI_PROVIDERS } from '../lib/providers-config.js'
import { writeEnvFile } from '../lib/env.js'
import { rememberState, consumeState, oauthResultPage } from '../lib/oauth.js'

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
      process.env[provider.envKey] = tokenData.access_token
      await writeEnvFile({ [provider.envKey]: tokenData.access_token })
      res.send(oauthResultPage(true, `${provider.label} OAuth 연결 완료!`, clientOrigin))
    } catch (err) {
      res.send(oauthResultPage(false, `토큰 교환 오류: ${err.message}`, clientOrigin))
    }
  })

  return router
}
