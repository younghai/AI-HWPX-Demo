import { useEffect, useState } from 'react'

export function EmptyState({ onTrySample }) {
  const [samples, setSamples] = useState([])
  const [loadingId, setLoadingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/samples')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok) setSamples(d.samples) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function handleTry(sample) {
    setLoadingId(sample.id)
    try {
      const res = await fetch(sample.downloadUrl)
      if (!res.ok) throw new Error('샘플 다운로드 실패')
      const blob = await res.blob()
      const file = new File([blob], `${sample.id}.hwpx`, { type: 'application/hwp+zip' })
      onTrySample({ file, sample })
    } catch (err) {
      console.warn('샘플 시도 실패', err)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="empty-state-card">
      <div className="empty-state-hero">
        <span className="empty-state-icon" aria-hidden="true">📝</span>
        <h2>HWP/HWPX 문서를 업로드하면 시작합니다</h2>
        <p className="empty-state-subtitle">
          왼쪽 업로더에 파일을 끌어다 놓거나, 클릭해서 선택하세요.
          <br />아니면 아래 샘플로 즉시 체험해 볼 수 있습니다.
        </p>
      </div>

      <div className="empty-state-steps">
        <div className="empty-step">
          <span className="empty-step-num">1</span>
          <span>HWP / HWPX 업로드</span>
        </div>
        <div className="empty-step">
          <span className="empty-step-num">2</span>
          <span>AI 가 초안 자동 생성</span>
        </div>
        <div className="empty-step">
          <span className="empty-step-num">3</span>
          <span>HWPX 다운로드 + 검증 결과 확인</span>
        </div>
      </div>

      {samples.length > 0 && (
        <div className="empty-state-samples">
          <p className="empty-samples-label">샘플로 즉시 체험</p>
          <div className="empty-samples-list">
            {samples.map((s) => (
              <button
                key={s.id}
                type="button"
                className="empty-sample-card"
                disabled={loadingId === s.id}
                onClick={() => handleTry(s)}
              >
                <strong>{s.label}</strong>
                <small>{s.description}</small>
                <span className="empty-sample-cta">
                  {loadingId === s.id ? '불러오는 중...' : '이 샘플로 시작 →'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
