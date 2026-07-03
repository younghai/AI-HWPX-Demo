import { useEffect, useState } from 'react'
import { triggerDownload } from '../lib/helpers.js'

function formatWhen(iso) {
  try {
    const d = new Date(iso)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}.${dd} ${hh}:${mi}`
  } catch {
    return ''
  }
}

// Recent generated documents so results survive a page reload (review PO-07).
export function HistoryPanel({ refreshKey }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/history')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok) setItems(d.items) })
      .catch(() => { /* history is non-critical */ })
    return () => { cancelled = true }
  }, [refreshKey])

  if (items.length === 0) return null

  return (
    <div className="history-panel">
      <button
        type="button"
        className="history-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>최근 생성 문서 {items.length}건</span>
        <span className="history-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="history-list">
          {items.map((item) => (
            <li key={item.fileName} className="history-item">
              <div className="history-item-meta">
                <strong title={item.fileName}>{item.fileName}</strong>
                <span>{formatWhen(item.createdAt)} · {item.sizeKb}KB</span>
              </div>
              <button
                type="button"
                className="history-download"
                onClick={() => triggerDownload(item.downloadUrl, item.fileName)}
              >
                다운로드
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
