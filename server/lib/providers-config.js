export const AI_PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-opus-4-7',
    envKey: 'ANTHROPIC_API_KEY',
    oauth: null
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
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
    defaultModel: 'moonshot-v1-8k',
    envKey: 'KIMI_API_KEY',
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
    oauth: null
  }
}

export function knownEnvKeys() {
  return new Set([
    ...Object.values(AI_PROVIDERS).map((p) => p.envKey),
    ...Object.values(AI_PROVIDERS).flatMap((p) => p.oauth ? [p.oauth.clientIdEnv, p.oauth.clientSecretEnv] : []),
    'OAUTH_REDIRECT_BASE'
  ])
}
