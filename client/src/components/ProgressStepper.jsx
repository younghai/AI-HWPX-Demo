const STAGES = [
  { key: 'analyzing', label: '문서 분석' },
  { key: 'generating', label: 'AI 초안' },
  { key: 'building', label: 'HWPX 빌드' },
  { key: 'rendering', label: '미리보기 렌더' }
]

const ORDER = STAGES.map((s) => s.key)

// Which stages count as "work in progress" (cancelable). `done`/`error`/`idle` do not.
const ACTIVE = new Set(ORDER)

export function ProgressStepper({ stage, onCancel }) {
  if (!stage || stage === 'idle') return null

  const currentIdx = ORDER.indexOf(stage)
  const isActive = ACTIVE.has(stage)
  const isError = stage === 'error'

  return (
    <div className="progress-stepper" role="status" aria-live="polite">
      <ol className="progress-steps">
        {STAGES.map((s, idx) => {
          const state =
            stage === 'done' || idx < currentIdx ? 'complete'
              : idx === currentIdx ? (isError ? 'error' : 'current')
                : 'pending'
          return (
            <li key={s.key} className={`progress-step is-${state}`}>
              <span className="progress-step-marker" aria-hidden="true">
                {state === 'complete' ? '✓' : state === 'error' ? '✗' : idx + 1}
              </span>
              <span className="progress-step-label">{s.label}</span>
            </li>
          )
        })}
      </ol>
      {isActive && (
        <button type="button" className="progress-cancel" onClick={onCancel}>
          취소
        </button>
      )}
    </div>
  )
}
