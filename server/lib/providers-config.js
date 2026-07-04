// Per-model prices are USD per 1M tokens (input/output), approximate and current
// as of 2026-07. Centralized here so a single edit updates cost estimates —
// pair with the provider-reported token counts (services/ai.js) for the estimate.
export const AI_PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-5',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-opus-4-8', label: 'Opus 4.8 · 최고 품질', priceIn: 15, priceOut: 75 },
      { id: 'claude-sonnet-5', label: 'Sonnet 5 · 균형 (권장)', priceIn: 3, priceOut: 15 },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 · 빠름·저비용', priceIn: 1, priceOut: 5 }
    ],
    oauth: null
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    // OpenAI reliably supports response_format json_object; enabling it for the
    // draft path removes JSON-parse flakiness. Left off for kimi/xai until
    // verified with real keys (review BE-13); their responses still go through
    // the hardened tryExtractJson.
    jsonMode: true,
    models: [
      { id: 'gpt-4o', label: 'GPT-4o · 균형 (권장)', priceIn: 2.5, priceOut: 10 },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini · 빠름·저비용', priceIn: 0.15, priceOut: 0.6 }
    ],
    oauth: {
      authorizeUrl: 'https://auth.openai.com/authorize',
      tokenUrl: 'https://auth.openai.com/oauth/token',
      scope: 'openai.organization.read openai.chat.completions.create',
      clientIdEnv: 'OPENAI_CLIENT_ID',
      clientSecretEnv: 'OPENAI_CLIENT_SECRET'
    }
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    defaultModel: 'moonshot-v1-32k',
    envKey: 'KIMI_API_KEY',
    models: [
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k · 짧은 문서', priceIn: 0.2, priceOut: 2 },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k · 권장', priceIn: 0.5, priceOut: 2 },
      { id: 'moonshot-v1-128k', label: 'moonshot-v1-128k · 대형 문서', priceIn: 2, priceOut: 5 }
    ],
    oauth: {
      authorizeUrl: 'https://account.moonshot.cn/oauth/authorize',
      tokenUrl: 'https://account.moonshot.cn/oauth/token',
      scope: 'api',
      clientIdEnv: 'KIMI_CLIENT_ID',
      clientSecretEnv: 'KIMI_CLIENT_SECRET'
    }
  },
  xai: {
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-3-mini',
    envKey: 'XAI_API_KEY',
    models: [
      { id: 'grok-3-mini', label: 'Grok 3 mini · 빠름·저비용', priceIn: 0.3, priceOut: 0.5 },
      { id: 'grok-3', label: 'Grok 3 · 고품질', priceIn: 3, priceOut: 15 }
    ],
    oauth: null
  },
  // Demo provider (A1): no API key, no network. Synthesizes a placeholder draft
  // so a first-time visitor can run the whole flow. `demo: true` keeps it out of
  // the "has a real key" accounting on the client. See services/mockAi.js.
  mock: {
    label: '데모 (키 불필요)',
    demo: true,
    baseUrl: null,
    defaultModel: 'mock',
    envKey: null,
    models: [{ id: 'mock', label: '데모 콘텐츠', priceIn: 0, priceOut: 0 }],
    oauth: null
  }
}

// Resolve a requested model id to a valid one for the provider (falls back to
// the provider default), returning the entry with pricing.
export function resolveModel(provider, requestedId) {
  const models = provider.models || []
  const found = models.find((m) => m.id === requestedId)
  if (found) return found
  return models.find((m) => m.id === provider.defaultModel) || models[0] || { id: provider.defaultModel, priceIn: 0, priceOut: 0 }
}

export function knownEnvKeys() {
  return new Set([
    ...Object.values(AI_PROVIDERS).map((p) => p.envKey).filter(Boolean),
    ...Object.values(AI_PROVIDERS).flatMap((p) => p.oauth ? [p.oauth.clientIdEnv, p.oauth.clientSecretEnv] : []),
    'OAUTH_REDIRECT_BASE'
  ])
}
