import { useEffect } from 'react'

export function Toast({ id, type = 'info', message, action, onDismiss, duration = 5000 }) {
  useEffect(() => {
    if (duration <= 0) return undefined
    const timer = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onDismiss])

  const icon = type === 'error' ? '✗' : type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'ⓘ'
  return (
    <div className={`toast toast-${type}`} role={type === 'error' ? 'alert' : 'status'}>
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
