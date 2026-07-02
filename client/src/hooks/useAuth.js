import { useCallback, useEffect, useState } from 'react'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' })
      const data = await res.json()
      if (data.ok && data.user) {
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    } finally {
      setUser(null)
    }
  }, [])

  const loginWithPopup = useCallback(() => {
    const popup = window.open(
      '/auth/google',
      'google-oauth',
      'width=600,height=700,left=200,top=100'
    )
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = '/auth/google'
      return
    }
    let handled = false
    const handler = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'google-auth-result') {
        window.removeEventListener('message', handler)
        clearInterval(checkClosed)
        handled = true
        refresh()
      }
    }
    window.addEventListener('message', handler)
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener('message', handler)
        if (!handled) refresh()
      }
    }, 500)
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { user, loading, logout, loginWithPopup }
}
