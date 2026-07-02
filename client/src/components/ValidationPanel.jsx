import { useMemo, useState } from 'react'

const AXIS_META = {
  rule:      { label: '규칙 적합성',    icon: '📋', color: '#dc2626', desc: '폰트/크기/스타일 조직 규정 준수' },
  structure: { label: '구조 무결성',    icon: '🔗', color: '#7c3aed', desc: '단락·스타일 cross-reference 일관성' },
  container: { label: '컨테이너 건전성', icon: '📦', color: '#0891b2', desc: 'ZIP/mimetype/필수 엔트리' },
  schema:    { label: '스키마 적합성',  icon: '📐', color: '#059669', desc: 'KS X 6101 표준 XML' },
  other:     { label: '기타',           icon: '•',  color: '#6b7280', desc: '' }
}

function severityIcon(sev) {
  if (sev === 'error') return '✗'
  if (sev === 'warning') return '⚠'
  return 'ⓘ'
}

export function ValidationPanel({ validation }) {
  const [expanded, setExpanded] = useState(new Set())

  const grouped = useMemo(() => {
    if (!validation?.violations) return {}
    const out = {}
    for (const v of validation.violations) {
      const axis = AXIS_META[v.axis] ? v.axis : 'other'
      if (!out[axis]) out[axis] = []
      out[axis].push(v)
    }
    return out
  }, [validation])

  if (!validation) return null

  const total = validation.errorCount + validation.warningCount
  const overallStatus = !validation.ok
    ? 'error'
    : validation.warningCount > 0
      ? 'warning'
      : 'ok'

  function toggle(axis) {
    setExpanded((curr) => {
      const next = new Set(curr)
      if (next.has(axis)) next.delete(axis); else next.add(axis)
      return next
    })
  }

  return (
    <div className={`validation-panel is-${overallStatus}`} role="region" aria-label="HWPX 검증 결과">
      <header className="validation-header">
        <div className="validation-summary">
          <span className="validation-icon" aria-hidden="true">
            {overallStatus === 'ok' ? '✓' : overallStatus === 'warning' ? '⚠' : '✗'}
          </span>
          <div>
            <strong>
              {overallStatus === 'ok' && '검증 통과'}
              {overallStatus === 'warning' && `경고 ${validation.warningCount}건`}
              {overallStatus === 'error' && `에러 ${validation.errorCount}건${validation.warningCount > 0 ? ` · 경고 ${validation.warningCount}건` : ''}`}
            </strong>
            <small>
              엔진: {(validation.engines || []).map((e) => `${e.name}${e.available ? '' : '(미설치)'}`).join(' · ') || 'n/a'}
            </small>
          </div>
        </div>
      </header>

      {total === 0 ? (
        <p className="validation-empty">생성된 HWPX 가 모든 검증 축을 통과했습니다.</p>
      ) : (
        <ul className="validation-axis-list">
          {Object.entries(grouped).map(([axis, items]) => {
            const meta = AXIS_META[axis]
            const isOpen = expanded.has(axis)
            const errCount = items.filter((i) => i.severity === 'error').length
            const warnCount = items.filter((i) => i.severity === 'warning').length
            return (
              <li key={axis} className="validation-axis-item">
                <button
                  type="button"
                  className={`validation-axis-toggle ${isOpen ? 'is-open' : ''}`}
                  onClick={() => toggle(axis)}
                  aria-expanded={isOpen}
                >
                  <span className="validation-axis-icon" style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="validation-axis-label">
                    <strong>{meta.label}</strong>
                    <small>{meta.desc}</small>
                  </span>
                  <span className="validation-axis-count">
                    {errCount > 0 && <span className="vc-error">에러 {errCount}</span>}
                    {warnCount > 0 && <span className="vc-warning">경고 {warnCount}</span>}
                  </span>
                  <span className="validation-axis-chevron">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <ul className="validation-violations">
                    {items.map((v, idx) => (
                      <li key={`${v.code}-${idx}`} className={`validation-violation is-${v.severity}`}>
                        <span className="vv-icon" aria-hidden="true">{severityIcon(v.severity)}</span>
                        <div className="vv-body">
                          <code className="vv-code">{v.code}</code>
                          <p className="vv-message">{v.message || <em className="vv-empty-message">(메시지 없음)</em>}</p>
                          {v.location && <small className="vv-location">{v.location}</small>}
                          {v.source && <small className="vv-source">출처: {v.source}</small>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
