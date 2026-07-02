import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'v2-aiProvider'

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

export function useProviders(onError) {
  const [providers, setProviders] = useState([])
  const [aiProvider, setAiProviderState] = useState(readStoredProvider)

  const setAiProvider = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(aiProvider) : next
    setAiProviderState(resolved)
    persistProvider(resolved)
  }, [aiProvider])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/providers')
      const data = await res.json()
      if (data.ok) {
        setProviders(data.providers)
        const configured = data.providers.find((p) => p.configured)
        if (configured) {
          setAiProviderState((current) => {
            const currentIsConfigured = data.providers.find((p) => p.key === current)?.configured
            if (currentIsConfigured) return current
            persistProvider(configured.key)
            return configured.key
          })
        }
      }
      return data.providers || []
    } catch (err) {
      onError?.(err)
      return []
    }
  }, [onError])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activeProvider = providers.find((p) => p.key === aiProvider) || null
  const hasConfigured = providers.some((p) => p.configured)

  return { providers, aiProvider, setAiProvider, refresh, activeProvider, hasConfigured }
}
