import { useEffect, useRef, useState } from 'react'

export function Toast({ id, type = 'info', message, action, onDismiss, duration = 5000 }) {
  const [paused, setPaused] = useState(false)
  const remainingRef = useRef(duration)
  const startedRef = useRef(0)

  useEffect(() => {
    if (duration <= 0 || paused) return undefined
    startedRef.current = performance.now()
    const timer = setTimeout(() => onDismiss(id), remainingRef.current)
    return () => {
      clearTimeout(timer)
      // Preserve the time left so hovering pauses (not restarts) the countdown.
      remainingRef.current = Math.max(0, remainingRef.current - (performance.now() - startedRef.current))
    }
  }, [id, duration, onDismiss, paused])

  const icon = type === 'error' ? '✗' : type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'ⓘ'
  return (
    <div
      className={`toast toast-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="toast-icon" aria-hidden="true">{icon}</span>
      <div className="toast-body">
        <p>{message}</p>
        {action && (
          <button type="button" className="toast-action" onClick={() => { action.onClick(); onDismiss(id) }}>
            {action.label}
          </button>
        )}
      </div>
      <button type="button" className="toast-close" aria-label="알림 닫기" onClick={() => onDismiss(id)}>×</button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
