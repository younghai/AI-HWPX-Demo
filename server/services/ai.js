const AI_TIMEOUT_MS = 45000

function withTimeout(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

export async function callAnthropic(provider, apiKey, prompt) {
  const { signal, clear } = withTimeout(AI_TIMEOUT_MS)
  try {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: provider.defaultModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || `Anthropic API 오류 (${response.status})`)
    }

    const block = data.content?.find((b) => b.type === 'text')
    return block?.text || ''
  } finally {
    clear()
  }
}

export async function callOpenAICompatible(provider, apiKey, prompt) {
  const { signal, clear } = withTimeout(AI_TIMEOUT_MS)
  try {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: provider.defaultModel,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: '당신은 한국어 공식 문서 작성 전문가입니다. 요청받은 JSON 형식으로만 응답하세요.' },
          { role: 'user', content: prompt }
        ]
      }),
      signal
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || `${provider.label} API 오류 (${response.status})`)
    }

    return data.choices?.[0]?.message?.content || ''
  } finally {
    clear()
  }
}
