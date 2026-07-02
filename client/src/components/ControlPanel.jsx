import { DOC_TYPES } from '../lib/helpers.js'
import { Uploader } from './Uploader.jsx'

const GOAL_MAX = 400
const NOTES_MAX = 300

export function ControlPanel({
  onFileSelect,
  sourceFile,
  sourceInsight,
  docType, setDocType,
  companyName, setCompanyName,
  targetTitle, setTargetTitle,
  goal, setGoal,
  notes, setNotes,
  onGenerate, onDownload,
  draftLoading, exportState, hasDraft,
  parseStatus
}) {
  return (
    <section className="control-column">
      <div className="panel">
        <p className="section-label">1. 생성 조건</p>
        <label>
          <span>문서 유형</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <small className="helper">생성할 문서의 성격을 선택하세요.</small>
        </label>
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
          <button className="primary-button" type="button" onClick={onGenerate} disabled={draftLoading || exportState.loading}>
            {draftLoading
              ? '초안 생성 중...'
              : exportState.loading
                ? 'HWPX 생성 중...'
                : hasDraft ? '초안 재생성' : '초안 생성'}
          </button>
          <button className="secondary-button" type="button" onClick={onDownload} disabled={!exportState.url || exportState.loading}>
            HWPX 다운로드
          </button>
        </div>
        {exportState.url && (
          <a className="download-link" href={exportState.url} download={exportState.fileName}>
            {exportState.fileName} 다운로드
          </a>
        )}
        <p className="status-message">{parseStatus}</p>
      </div>

      <div className="panel">
        <p className="section-label">2. 원본 문서 업로드</p>
        <Uploader
          onFileSelect={onFileSelect}
          currentFile={sourceFile}
          currentInsight={sourceInsight}
        />
        <p className="helper">
          HWP는 내용을 분석해 새 HWPX 초안을 만들고, HWPX는 업로드한 양식을 결과 문서 템플릿으로 재사용합니다.
        </p>
      </div>
    </section>
  )
}
