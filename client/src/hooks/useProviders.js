import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'ai-hwp-provider'
const MODEL_STORAGE_KEY = 'ai-hwp-model-by-provider'

function readStoredProvider() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) return stored
    }
  } catch { /* localStorage disabled */ }
  return 'anthropic'
}

function persistProvider(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage && key) {
      window.localStorage.setItem(STORAGE_KEY, key)
    }
  } catch { /* ignore */ }
}

function readModelMap() {
  try {
    return JSON.parse(window.localStorage.getItem(MODEL_STORAGE_KEY)) || {}
  } catch { return {} }
}

function persistModel(providerKey, modelId) {
  try {
    const map = readModelMap()
    map[providerKey] = modelId
    window.localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}

export function useProviders(onError) {
  const [providers, setProviders] = useState([])
  const [aiProvider, setAiProviderState] = useState(readStoredProvider)
  const [modelMap, setModelMap] = useState(readModelMap)

  const setAiProvider = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(aiProvider) : next
    setAiProviderState(resolved)
    persistProvider(resolved)
  }, [aiProvider])

  // Keep onError in a ref so `refresh` stays referentially stable. Otherwise a
  // new inline onError each render → new refresh → the mount effect re-fires →
  // setProviders → re-render → an infinite /api/providers fetch loop (surfaced
  // by the rate limiter). See review FE-03.
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/providers')
      const data = await res.json()
      if (data.ok) {
        setProviders(data.providers)
        // Auto-select a REAL configured provider (skip the always-configured demo
        // — it should only be used via an explicit demo action, never silently).
        const configured = data.providers.find((p) => p.configured && !p.demo)
        if (configured) {
          setAiProviderState((current) => {
            const cur = data.providers.find((p) => p.key === current)
            if (cur?.configured && !cur.demo) return current
            persistProvider(configured.key)
            return configured.key
          })
        }
      }
      return data.providers || []
    } catch (err) {
      onErrorRef.current?.(err)
      return []
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activeProvider = providers.find((p) => p.key === aiProvider) || null
  // "Has a real key" — the demo provider (always configured) does not count, so
  // the generate gate still correctly reflects whether a paid provider is set up.
  const hasConfigured = providers.some((p) => p.configured && !p.demo)
  const hasDemo = providers.some((p) => p.demo)

  const activeModels = activeProvider?.models || []
  const storedModel = modelMap[aiProvider]
  const aiModel = activeModels.some((m) => m.id === storedModel)
    ? storedModel
    : (activeProvider?.defaultModel || storedModel || '')

  const setAiModel = useCallback((modelId) => {
    persistModel(aiProvider, modelId)
    setModelMap((prev) => ({ ...prev, [aiProvider]: modelId }))
  }, [aiProvider])

  return { providers, aiProvider, setAiProvider, refresh, activeProvider, hasConfigured, hasDemo, aiModel, setAiModel, activeModels }
}
