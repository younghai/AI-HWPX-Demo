import { forwardRef } from 'react'
import { DOC_TYPES } from '../lib/helpers.js'
import { EditableDraft } from './EditableDraft.jsx'

export const PreviewPanel = forwardRef(function PreviewPanel({
  draft, sourceInsight, docType, parseStatus, builtPreview,
  showEditor, building, canRegenerate,
  onTitleChange, onSectionChange, onAddSection, onRemoveSection, onMoveSection,
  onRegenerateSection, onBuild, onEditAgain
}, ref) {
  const docTypeLabel = DOC_TYPES.find((o) => o.value === docType)?.label || docType
  const hasBuilt = Boolean(builtPreview && builtPreview.svgs && builtPreview.svgs.length > 0)
  const isOptimistic = draft?.engine === 'optimistic-preview'

  const metaItems = showEditor ? [
    { label: '초안 제목', value: draft?.title || '—' },
    { label: '섹션 수', value: draft?.sections?.length ?? 0 },
    { label: '문서 유형', value: docTypeLabel },
    { label: '현재 상태', value: isOptimistic ? 'AI 생성 중' : '검토·수정 중' }
  ] : hasBuilt ? [
    { label: '결과 파일', value: builtPreview.fileName || '—' },
    { label: '페이지 수', value: builtPreview.pageCount || builtPreview.svgs.length },
    { label: '문서 유형', value: docTypeLabel },
    { label: '현재 상태', value: '다운로드 준비 완료' }
  ] : [
    { label: '원본 파일', value: sourceInsight.fileName || '—' },
    { label: '페이지 수', value: sourceInsight.pageCount || '—' },
    { label: '문서 형식',
      value: sourceInsight.mode === 'hwpx-template' ? 'HWPX 양식'
        : sourceInsight.mode === 'hwp-source' ? 'HWP 문서' : '—' },
    { label: '처리 방식',
      value: sourceInsight.mode === 'hwpx-template' ? '템플릿 활용'
        : sourceInsight.mode === 'hwp-source' ? '내용 기반 초안 생성' : '—' }
  ]

  const sectionLabel = showEditor
    ? '초안 검토 · 수정'
    : hasBuilt
      ? 'HWPX 결과물 미리보기'
      : '문서 미리보기'

  const footer = showEditor
    ? '내용을 수정한 뒤 "이 초안으로 HWPX 생성"을 누르면 편집한 그대로 문서가 만들어집니다.'
    : hasBuilt
      ? '이 미리보기는 실제 다운로드 파일과 동일한 HWPX 바이트를 렌더링한 결과입니다.'
      : sourceInsight.mode === 'hwpx-template'
        ? '업로드한 HWPX 양식을 그대로 재사용해 새 문서를 생성할 수 있습니다.'
        : sourceInsight.mode === 'hwp-source'
          ? '업로드한 HWP 문서 내용을 바탕으로 새 HWPX 초안을 생성할 수 있습니다.'
          : '문서를 업로드하면 미리보기와 추출 내용을 한 화면에서 바로 확인할 수 있습니다.'

  return (
    <section className="preview-section">
      <div className="panel" ref={ref}>
        <div className="preview-head">
          <p className="section-label">{sectionLabel}</p>
          {hasBuilt && !showEditor && (
            <button type="button" className="preview-edit-again" onClick={onEditAgain}>
              ← 초안 수정
            </button>
          )}
        </div>
        <div className="meta-grid">
          {metaItems.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        {showEditor ? (
          <EditableDraft
            draft={draft}
            isOptimistic={isOptimistic}
            building={building}
            canRegenerate={canRegenerate}
            onTitleChange={onTitleChange}
            onSectionChange={onSectionChange}
            onAddSection={onAddSection}
            onRemoveSection={onRemoveSection}
            onMoveSection={onMoveSection}
            onRegenerateSection={onRegenerateSection}
            onBuild={onBuild}
          />
        ) : (
          <div className="svg-frame">
            {hasBuilt ? (
              <BuiltContent builtPreview={builtPreview} />
            ) : sourceInsight.previewSvg ? (
              <ParsedContent sourceInsight={sourceInsight} />
            ) : (
              <p className="empty-copy">생성된 내용을 미리보기로 보여드립니다.</p>
            )}
          </div>
        )}
        <p className="status-message">{parseStatus || footer}</p>
      </div>
    </section>
  )
})

function BuiltContent({ builtPreview }) {
  const shown = builtPreview.svgs.length
  const total = builtPreview.pageCount || shown
  return (
    <div className="built-preview">
      {total > shown && (
        <p className="built-truncation-note">
          미리보기 {shown} / 전체 {total}페이지 · 다운로드 파일에는 모든 페이지가 포함됩니다.
        </p>
      )}
      {builtPreview.svgs.map((svg, idx) => (
        <div key={idx} className="built-page" dangerouslySetInnerHTML={{ __html: svg }} />
      ))}
    </div>
  )
}

function ParsedContent({ sourceInsight }) {
  const text = sourceInsight.extractedText
    ? sourceInsight.extractedText.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
    : ''
  return (
    <div className="parsed-content-board">
      <div className="parsed-document-stage">
        <div dangerouslySetInnerHTML={{ __html: sourceInsight.previewSvg }} />
      </div>
      <div className="parsed-text-panel">
        <p className="parsed-text-label">문서 내용</p>
        <div className="parsed-text-content">
          {text ? <p>{text}</p> : <p>첫 페이지 텍스트를 읽는 중입니다.</p>}
        </div>
      </div>
    </div>
  )
}
