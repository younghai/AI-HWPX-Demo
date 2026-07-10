export function RecoveryBanner({ recoverable, onRecover, onDismiss }) {
  return (
    <div className="recovery-banner" role="status">
      <div className="recovery-banner-text">
        <strong>이전에 작업하던 초안이 있습니다.</strong>
        <span>{recoverable.draft?.title || '제목 없는 초안'} · 섹션 {recoverable.draft?.sections?.length ?? 0}개. 복구하면 편집 내용을 이어서 볼 수 있습니다.</span>
      </div>
      <div className="recovery-banner-actions">
        <button type="button" className="primary-button" onClick={onRecover}>복구</button>
        <button type="button" className="secondary-button" onClick={onDismiss}>무시</button>
      </div>
    </div>
  )
}
