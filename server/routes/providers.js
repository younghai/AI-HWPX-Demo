import { Router } from 'express'
import { AI_PROVIDERS, knownEnvKeys } from '../lib/providers-config.js'
import { writeEnvFile } from '../lib/env.js'
import { sendError } from '../lib/errors.js'
import { callAnthropic, callOpenAICompatible } from '../services/ai.js'

const router = Router()

router.get('/api/providers', (_req, res) => {
  const list = Object.entries(AI_PROVIDERS).map(([key, val]) => ({
    key,
    label: val.label,
    defaultModel: val.defaultModel,
    configured: Boolean(process.env[val.envKey]),
    oauthSupported: Boolean(val.oauth && process.env[val.oauth?.clientIdEnv])
  }))
  res.json({ ok: true, providers: list })
})

router.post('/api/settings', async (req, res) => {
  try {
    const allowedKeys = knownEnvKeys()
    const safeKeys = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => allowedKeys.has(k))
    )
    await writeEnvFile(safeKeys)
    for (const [envName, value] of Object.entries(safeKeys)) {
      process.env[envName] = value
    }
    res.json({ ok: true, message: 'API 키가 저장되었습니다.' })
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/api/test-provider', async (req, res) => {
  const { provider: providerKey, apiKey } = req.body || {}
  const provider = AI_PROVIDERS[providerKey]
  if (!provider) {
    return res.status(400).json({ ok: false, error: '알 수 없는 프로바이더입니다.' })
  }
  const key = apiKey || process.env[provider.envKey] || ''
  if (!key) {
    return res.status(400).json({ ok: false, error: 'API 키가 없습니다.' })
  }
  try {
    const text = providerKey === 'anthropic'
      ? await callAnthropic(provider, key, '한 문장으로 자기소개를 해 주세요.')
      : await callOpenAICompatible(provider, key, '한 문장으로 자기소개를 해 주세요.')
    res.json({ ok: true, message: text.slice(0, 200) })
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message })
  }
})

export default router
