import { DOC_TYPES, getDocTypeMeta } from '../lib/helpers.js'
import { Uploader } from './Uploader.jsx'

const GOAL_MAX = 400
const NOTES_MAX = 300

export function ControlPanel({
  onFileSelect,
  sourceFile,
  sourceInsight,
  docType, setDocType,
  docFields = {}, setDocField,
  companyName, setCompanyName,
  targetTitle, setTargetTitle,
  goal, setGoal,
  notes, setNotes,
  activeModels = [], aiModel, setAiModel,
  onGenerate, onDownload,
  onDownloadPdf, canDownloadPdf, pdfBusy,
  draftLoading, exportState, hasDraft, usingDemo,
  parseStatus
}) {
  const hasFile = Boolean(sourceFile)

  return (
    <section className="control-column">
      <div className="panel">
        <p className="section-label">1. 원본 문서 업로드</p>
        <Uploader
          onFileSelect={onFileSelect}
          currentFile={sourceFile}
          currentInsight={sourceInsight}
        />
        {hasFile && sourceInsight.mode ? (
          <div className={`mode-banner mode-banner--${sourceInsight.mode === 'hwpx-template' ? 'template' : 'source'}`} role="status">
            <span className="mode-banner-icon" aria-hidden="true">
              {sourceInsight.mode === 'hwpx-template' ? '🧩' : '✍️'}
            </span>
            <span className="mode-banner-text">
              {sourceInsight.mode === 'hwpx-template'
                ? <><strong>양식 유지 모드</strong> — 업로드한 HWPX 서식·표·레이아웃을 그대로 두고 본문만 AI로 채웁니다.</>
                : <><strong>새 양식 생성 모드</strong> — HWP 원본 내용을 분석해 기본 HWPX 양식으로 새 문서를 만듭니다. 원본 서식은 유지되지 않습니다.</>}
            </span>
          </div>
        ) : (
          <p className="helper">
            HWP는 내용을 분석해 새 HWPX 초안을 만들고, HWPX는 업로드한 양식을 결과 문서 템플릿으로 재사용합니다.
          </p>
        )}
      </div>

      <div className={`panel ${hasFile ? '' : 'panel--dimmed'}`} aria-disabled={!hasFile}>
        <p className="section-label">2. 생성 조건</p>
        {!hasFile && (
          <p className="panel-dim-hint">먼저 위에서 문서를 업로드하면 생성 조건을 설정할 수 있습니다.</p>
        )}
        <label>
          <span>문서 유형</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <small className="helper">생성할 문서의 성격을 선택하세요.</small>
        </label>
        {getDocTypeMeta(docType).fields.map((field) => (
          <label key={field.key}>
            <span>{field.label}</span>
            <input
              value={docFields[field.key] || ''}
              onChange={(e) => setDocField(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </label>
        ))}
        {activeModels.length > 1 && (
          <label>
            <span>AI 모델</span>
            <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
              {activeModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <small className="helper">품질·속도·비용이 다릅니다. 응답 후 실제 사용 토큰 기준 비용이 표시됩니다.</small>
          </label>
        )}
        <label>
          <span>회사명</span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="예: Bizmatrixx"
          />
          <small className="helper">문서 전반에 삽입될 회사/기관 이름입니다.</small>
        </label>
        <label>
          <span>목표 제목</span>
          <input
            value={targetTitle}
            onChange={(e) => setTargetTitle(e.target.value)}
            placeholder="예: 2026 상반기 AI 문서 자동화 제안서"
          />
          <small className="helper">비워두면 업로드 파일명에서 자동으로 생성됩니다.</small>
        </label>
        <label>
          <span>생성 요청</span>
          <textarea
            rows="4"
            value={goal}
            maxLength={GOAL_MAX}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="예: 임원 검토용 요약과 실행 계획을 중심으로 재구성해 주세요."
          />
          <small className="helper helper-counter">
            핵심 목적/독자/톤을 1–2문장으로 적어주세요. <span>{goal.length}/{GOAL_MAX}</span>
          </small>
        </label>
        <label>
          <span>추가 메모</span>
          <textarea
            rows="4"
            value={notes}
            maxLength={NOTES_MAX}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="예: 3분기 KPI 수치는 초안 단계에서 제외해 주세요."
          />
          <small className="helper helper-counter">
            반영할 제약·선호 사항을 자유롭게 남겨주세요. <span>{notes.length}/{NOTES_MAX}</span>
          </small>
        </label>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={onGenerate} disabled={!hasFile || draftLoading || exportState.loading}>
            {draftLoading
              ? '초안 생성 중...'
              : exportState.loading
                ? 'HWPX 생성 중...'
                : hasDraft ? '초안 재생성' : usingDemo ? '데모로 초안 생성' : '초안 생성'}
          </button>
          <button className="secondary-button" type="button" onClick={onDownload} disabled={!exportState.url || exportState.loading}>
            HWPX 다운로드
          </button>
        </div>
        {canDownloadPdf && (
          <button className="secondary-button pdf-button" type="button" onClick={onDownloadPdf} disabled={pdfBusy}>
            {pdfBusy ? 'PDF 변환 중…' : '📄 PDF로 받기 (미리보기 기준)'}
          </button>
        )}
        {exportState.url && (
          <a className="download-link" href={exportState.url} download={exportState.fileName}>
            {exportState.fileName} 다운로드
          </a>
        )}
        <p className="status-message">{parseStatus}</p>
      </div>
    </section>
  )
}
