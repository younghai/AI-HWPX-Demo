import { renderDiagramSvg } from '../lib/diagrams.js'

// Editable review surface for the AI draft (review PO-01). Every edit flows
// straight into the draft state, so the built HWPX reflects exactly what the
// user sees here — the "생성 → 검토·수정 → 확정" loop.
export function EditableDraft({
  draft,
  isOptimistic,
  building,
  canRegenerate,
  onTitleChange,
  onSectionChange,
  onAddSection,
  onRemoveSection,
  onMoveSection,
  onRegenerateSection,
  onBuild
}) {
  const sections = draft.sections || []

  return (
    <div className="editable-draft">
      <div className="editable-draft-head">
        <label className="editable-title-field">
          <span>문서 제목</span>
          <input
            value={draft.title || ''}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="문서 제목"
          />
        </label>
        {draft.summary && <p className="editable-draft-summary">{draft.summary}</p>}
      </div>

      {isOptimistic ? (
        <>
          <p className="editable-draft-hint">AI가 초안을 작성하는 중입니다. 잠시 후 이 자리에 실제 내용이 채워집니다.</p>
          <ol className="editable-sections" aria-busy="true">
            {sections.map((section, index) => (
              <li key={index} className="editable-section is-skeleton">
                <div className="editable-section-toolbar">
                  <span className="editable-section-num">{index + 1}</span>
                  <span className="skeleton-heading">{section.heading}</span>
                </div>
                <div className="skeleton-lines">
                  <span className="skeleton-line" />
                  <span className="skeleton-line" />
                  <span className="skeleton-line short" />
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
      <ol className="editable-sections">
        {sections.map((section, index) => {
          const diagramSpec = (draft.diagrams || []).find((d) => d.afterSection === section.heading)
          const diagramSvg = diagramSpec ? renderDiagramSvg(diagramSpec) : null
          return (
            <li key={index} className="editable-section">
              <div className="editable-section-toolbar">
                <span className="editable-section-num">{index + 1}</span>
                <input
                  className="editable-section-heading"
                  value={section.heading}
                  onChange={(e) => onSectionChange(index, { heading: e.target.value })}
                  placeholder="섹션 제목"
                  aria-label={`섹션 ${index + 1} 제목`}
                />
                <div className="editable-section-actions">
                  <button type="button" onClick={() => onMoveSection(index, -1)} disabled={index === 0} aria-label="위로" title="위로">↑</button>
                  <button type="button" onClick={() => onMoveSection(index, 1)} disabled={index === sections.length - 1} aria-label="아래로" title="아래로">↓</button>
                  {canRegenerate && (
                    <button
                      type="button"
                      className="editable-regen"
                      onClick={() => onRegenerateSection(index)}
                      disabled={section.regenerating}
                      title="이 섹션만 AI로 다시 생성"
                    >
                      {section.regenerating ? '생성 중…' : '↻ AI'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="editable-remove"
                    onClick={() => onRemoveSection(index)}
                    disabled={sections.length <= 1}
                    aria-label="섹션 삭제"
                    title="섹션 삭제"
                  >✕</button>
                </div>
              </div>
              <textarea
                className="editable-section-body"
                value={section.body}
                onChange={(e) => onSectionChange(index, { body: e.target.value })}
                placeholder="섹션 본문을 입력하거나 AI 생성 결과를 수정하세요."
                rows={Math.max(3, Math.ceil((section.body || '').length / 45))}
                aria-label={`섹션 ${index + 1} 본문`}
              />
              {diagramSvg && (
                <div className="diagram-preview" dangerouslySetInnerHTML={{ __html: diagramSvg }} />
              )}
              <button type="button" className="editable-add-between" onClick={() => onAddSection(index)}>
                + 여기에 섹션 추가
              </button>
            </li>
          )
        })}
      </ol>
      )}

      {!isOptimistic && (
        <div className="editable-draft-footer">
          <button type="button" className="secondary-button" onClick={() => onAddSection(sections.length - 1)}>
            + 섹션 추가
          </button>
          <button type="button" className="primary-button" onClick={onBuild} disabled={building}>
            {building ? 'HWPX 생성 중…' : '이 초안으로 HWPX 생성'}
          </button>
        </div>
      )}
    </div>
  )
}
