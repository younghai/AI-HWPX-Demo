const AI_TIMEOUT_MS = 45000

function withTimeout(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

const DEFAULT_SYSTEM = '당신은 한국어 공식 문서 작성 전문가입니다. 요청받은 JSON 형식으로만 응답하세요.'

// Both callers return { text, usage } where usage carries the provider-reported
// token counts (review PO-05) — null if the provider omitted them.
export async function callAnthropic(provider, apiKey, prompt, { systemPrompt, model } = {}) {
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
        model: model || provider.defaultModel,
        max_tokens: 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }]
      }),
      signal
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || `Anthropic API 오류 (${response.status})`)
    }

    const block = data.content?.find((b) => b.type === 'text')
    const usage = data.usage
      ? { inputTokens: data.usage.input_tokens || 0, outputTokens: data.usage.output_tokens || 0 }
      : null
    return { text: block?.text || '', usage }
  } finally {
    clear()
  }
}

export async function callOpenAICompatible(provider, apiKey, prompt, { systemPrompt, model } = {}) {
  const { signal, clear } = withTimeout(AI_TIMEOUT_MS)
  try {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || provider.defaultModel,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt || DEFAULT_SYSTEM },
          { role: 'user', content: prompt }
        ]
      }),
      signal
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || `${provider.label} API 오류 (${response.status})`)
    }

    const usage = data.usage
      ? { inputTokens: data.usage.prompt_tokens || 0, outputTokens: data.usage.completion_tokens || 0 }
      : null
    return { text: data.choices?.[0]?.message?.content || '', usage }
  } finally {
    clear()
  }
}
