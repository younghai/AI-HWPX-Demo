import { useCallback, useState } from 'react'

let _id = 0
const nextId = () => ++_id

export function useToast() {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((curr) => curr.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((opts) => {
    const t = { id: nextId(), type: 'info', duration: 5000, ...opts }
    setToasts((curr) => [...curr, t])
    return t.id
  }, [])

  const success = useCallback((message, opts = {}) => push({ type: 'success', message, ...opts }), [push])
  const error = useCallback((message, opts = {}) => push({ type: 'error', message, duration: 8000, ...opts }), [push])
  const info = useCallback((message, opts = {}) => push({ type: 'info', message, ...opts }), [push])
  const warning = useCallback((message, opts = {}) => push({ type: 'warning', message, ...opts }), [push])

  return { toasts, dismiss, push, success, error, info, warning }
}
