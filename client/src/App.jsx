import { useRef, useState } from 'react'
import { TopBar } from './components/TopBar.jsx'
import { LoginOverlay } from './components/LoginOverlay.jsx'
import { ProviderSettings } from './components/ProviderSettings.jsx'
import { ControlPanel } from './components/ControlPanel.jsx'
import { PreviewPanel } from './components/PreviewPanel.jsx'
import { ProgressStepper } from './components/ProgressStepper.jsx'
import { ValidationPanel } from './components/ValidationPanel.jsx'
import { HistoryPanel } from './components/HistoryPanel.jsx'
import { EmptyState } from './components/EmptyState.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { ToastContainer } from './components/Toast.jsx'
import { useProviders } from './hooks/useProviders.js'
import { useRhwp } from './hooks/useRhwp.js'
import { useDraft } from './hooks/useDraft.js'
import { useAuth } from './hooks/useAuth.js'
import { useToast } from './hooks/useToast.js'

export default function App() {
  const previewPanelRef = useRef(null)

  const [sourceFile, setSourceFile] = useState(null)
  const [docType, setDocType] = useState('report')
  const [companyName, setCompanyName] = useState('Bizmatrixx')
  const [goal, setGoal] = useState('업로드한 문서의 핵심 내용을 바탕으로 임원 검토용 초안을 만들어 주세요.')
  const [notes, setNotes] = useState('핵심 메시지는 유지하고, 목차는 더 명확하게 재구성해 주세요.')
  const [targetTitle, setTargetTitle] = useState('')
  const [docFields, setDocFields] = useState({})
  const [showSettings, setShowSettings] = useState(false)
  const [stage, setStage] = useState('idle')

  // Reset type-specific fields when the document type changes.
  function handleDocTypeChange(next) {
    setDocType(next)
    setDocFields({})
  }
  function setDocField(key, value) {
    setDocFields((prev) => ({ ...prev, [key]: value }))
  }

  const { user, logout, loginWithPopup } = useAuth()
  const autoLogin = import.meta.env.VITE_AUTO_LOGIN === 'true'
  const { toasts, dismiss, success, error: errorToast, info } = useToast()

  const {
    providers, aiProvider, setAiProvider, refresh: refreshProviders, activeProvider, hasConfigured, hasDemo,
    aiModel, setAiModel, activeModels
  } = useProviders((err) => {
    console.warn('providers fetch failed', err)
    errorToast('AI provider 목록을 불러오지 못했습니다.')
  })

  // When the user has no real key, fall back to the demo provider (placeholder
  // content, no network) so the full flow is still reachable. A1 데모 모드.
  const usingDemo = !hasConfigured && hasDemo
  const effectiveProvider = usingDemo ? 'mock' : aiProvider
  const effectiveModel = usingDemo ? 'mock' : aiModel

  const {
    sourceInsight,
    parseStatus,
    setParseStatus,
    parseFile,
    builtPreview,
    renderBuiltHwpx,
    clearBuiltPreview,
    exportBuiltPdf
  } = useRhwp()
  const [pdfBusy, setPdfBusy] = useState(false)
  const {
    draft, setDraft, draftLoading, exportState, generateDraft, buildHwpx, downloadBuilt, cancelAll,
    updateSection, addSection, removeSection, moveSection, updateTitle, regenerateSection,
    recoverable, recoverDraft, dismissRecovery
  } = useDraft({ setParseStatus })

  const [editing, setEditing] = useState(false)

  // Shared context for section-level regenerate + build (review PO-01).
  function draftContext() {
    return { docType, companyName, goal, notes, docFields, sourceText: sourceInsight.extractedText, aiProvider: effectiveProvider, model: effectiveModel }
  }

  function usageMessage(usage) {
    if (!usage) return ''
    const prefix = usage.tokensMeasured ? '' : '추정 '
    const cost = usage.estCostUsd > 0 ? ` · ${prefix}비용 $${usage.estCostUsd.toFixed(4)}` : ''
    return `AI 응답 ${(usage.elapsedMs / 1000).toFixed(1)}초${cost}`
  }

  function handleCancel() {
    cancelAll()
    setStage('idle')
    setParseStatus('작업을 취소했습니다.')
  }

  async function handleFileSelect(file) {
    setStage('idle')
    setEditing(false)
    if (!file) {
      setSourceFile(null)
      setDraft(null)
      clearBuiltPreview()
      setParseStatus('업로드한 문서를 분석하면 여기 상태가 표시됩니다.')
      return
    }
    setSourceFile(file)
    setDraft(null)
    clearBuiltPreview()
    await parseFile(file)
    if (!targetTitle) {
      setTargetTitle(file.name.replace(/\.(hwp|hwpx)$/i, ''))
    }
  }

  async function handleTrySample({ file, sample }) {
    if (sample?.suggestedTitle) setTargetTitle(sample.suggestedTitle)
    if (sample?.docType) setDocType(sample.docType)
    info(`샘플 "${sample.label}" 을 불러왔습니다.`)
    await handleFileSelect(file)
  }

  function scrollToPreview() {
    requestAnimationFrame(() => {
      previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // Step 1 of the loop: generate the draft, then hand off to the editor for
  // review/edit. Building the HWPX is a separate, explicit step (handleBuild).
  async function handleGenerate() {
    // Only hard-block when there's neither a real key nor the demo provider.
    if (!hasConfigured && !hasDemo) {
      errorToast('먼저 우측 상단 ⚙ 버튼에서 AI 키를 설정해주세요.', {
        action: { label: '설정 열기', onClick: () => setShowSettings(true) }
      })
      return
    }
    if (usingDemo) {
      info('데모 모드로 예시 초안을 생성합니다. 실제 AI 응답이 아니며, API 키를 연결하면 실제 생성이 가능합니다.')
    }
    clearBuiltPreview()
    setEditing(true)
    setStage('generating')
    const next = await generateDraft({
      sourceFile, sourceInsight, docType, companyName, goal, notes, targetTitle, docFields,
      aiProvider: effectiveProvider, aiModel: effectiveModel, onOptimistic: scrollToPreview
    })
    if (!next) {
      setStage('error')
      scrollToPreview()
      errorToast('AI 초안 생성에 실패했습니다. 우측 패널의 메시지를 확인해주세요.')
      return
    }
    if (next.title) setTargetTitle(next.title)
    if (next.usage) info(usageMessage(next.usage))
    setStage('idle')
    setParseStatus('AI 초안이 준비됐습니다. 내용을 검토·수정한 뒤 "이 초안으로 HWPX 생성"을 누르세요.')
    scrollToPreview()
  }

  // Step 2: build the HWPX from the (possibly edited) draft, then render it.
  async function handleBuild() {
    if (!draft) return
    setEditing(false)
    setStage('building')
    setParseStatus('초안 내용을 바탕으로 HWPX 파일을 생성하는 중입니다...')
    const built = await buildHwpx({ draftOverride: draft, sourceFile, sourceInsight, docType })
    if (built?.url) {
      setStage('rendering')
      setParseStatus('HWPX를 렌더링해 미리보기에 반영합니다...')
      const rendered = await renderBuiltHwpx(built.url, built.fileName)
      setParseStatus(rendered
        ? '미리보기와 다운로드 파일이 동일한 HWPX로 생성되었습니다.'
        : 'HWPX 파일이 생성되었습니다. 다운로드 버튼으로 받을 수 있습니다.')
      setStage('done')
      // Diagram embed visibility (review D2): tell the user how many diagrams
      // actually made it into the file — a partial/zero embed is no longer silent.
      const dr = built.diagramReport
      if (dr && dr.requestedCount > 0) {
        if (dr.embeddedCount === dr.requestedCount) {
          info(`다이어그램 ${dr.embeddedCount}/${dr.requestedCount}개가 문서에 반영되었습니다.`)
        } else if (dr.embeddedCount === 0) {
          errorToast(`다이어그램 ${dr.requestedCount}개가 문서에 반영되지 못했습니다. 미리보기를 다시 생성하거나 브라우저를 새로고침해 보세요.`)
        } else {
          errorToast(`다이어그램 ${dr.embeddedCount}/${dr.requestedCount}개만 반영되었습니다. 일부 다이어그램이 누락됐습니다.`)
        }
      }
      const v = built.validation
      if (v) {
        if (!v.ok) {
          errorToast(`HWPX 검증: 에러 ${v.errorCount}건, 경고 ${v.warningCount}건. 우측 검증 패널을 확인하세요.`)
        } else if (v.warningCount > 0) {
          info(`HWPX 검증: 경고 ${v.warningCount}건. 큰 문제는 없습니다.`)
        } else {
          success('HWPX 검증 통과! 다운로드할 수 있습니다.')
        }
      }
    } else {
      setEditing(true)
      setStage('error')
      errorToast('HWPX 빌드에 실패했습니다.')
    }
    scrollToPreview()
  }

  function handleRegenerateSection(index) {
    return regenerateSection(index, draftContext())
  }

  function handleEditAgain() {
    setEditing(true)
    setStage('idle')
  }

  function handleDownload() {
    downloadBuilt()
  }

  async function handleDownloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const ok = await exportBuiltPdf(exportState.fileName)
      if (ok) success('PDF를 내려받았습니다. (미리보기 기준 — 원본 서식은 HWPX가 정확합니다)')
      else errorToast('PDF로 변환할 문서가 없습니다. 먼저 HWPX를 생성해 주세요.')
    } catch (err) {
      console.warn('pdf export failed', err)
      errorToast('PDF 변환에 실패했습니다.')
    } finally {
      setPdfBusy(false)
    }
  }

  const showEmptyState = !sourceFile && !draft && !builtPreview.svgs.length
  const showEditor = Boolean(draft) && (editing || !builtPreview.svgs.length)

  return (
    <ErrorBoundary>
      <div className="app-shell">
        {autoLogin && <LoginOverlay onLogin={loginWithPopup} user={user} />}
      <TopBar
        hasConfigured={hasConfigured}
        activeProviderLabel={activeProvider?.label}
        onOpenSettings={() => setShowSettings(true)}
        user={user}
        onLogin={loginWithPopup}
        onLogout={logout}
      />

      <ProviderSettings
        open={showSettings}
        providers={providers}
        aiProvider={aiProvider}
        setAiProvider={setAiProvider}
        refreshProviders={refreshProviders}
        onClose={() => setShowSettings(false)}
      />

      <main className="workspace">
        <ControlPanel
          onFileSelect={handleFileSelect}
          sourceFile={sourceFile}
          sourceInsight={sourceInsight}
          docType={docType} setDocType={handleDocTypeChange}
          docFields={docFields} setDocField={setDocField}
          companyName={companyName} setCompanyName={setCompanyName}
          targetTitle={targetTitle} setTargetTitle={setTargetTitle}
          goal={goal} setGoal={setGoal}
          notes={notes} setNotes={setNotes}
          activeModels={activeModels} aiModel={aiModel} setAiModel={setAiModel}
          onGenerate={handleGenerate}
          onDownload={handleDownload}
          onDownloadPdf={handleDownloadPdf}
          canDownloadPdf={builtPreview.svgs.length > 0}
          pdfBusy={pdfBusy}
          draftLoading={draftLoading}
          exportState={exportState}
          hasDraft={Boolean(draft)}
          parseStatus={parseStatus}
        />

        <div className="preview-column">
          {recoverable && !draft && (
            <div className="recovery-banner" role="status">
              <div className="recovery-banner-text">
                <strong>이전에 작업하던 초안이 있습니다.</strong>
                <span>{recoverable.draft?.title || '제목 없는 초안'} · 섹션 {recoverable.draft?.sections?.length ?? 0}개. 복구하면 편집 내용을 이어서 볼 수 있습니다.</span>
              </div>
              <div className="recovery-banner-actions">
                <button type="button" className="primary-button" onClick={recoverDraft}>복구</button>
                <button type="button" className="secondary-button" onClick={dismissRecovery}>무시</button>
              </div>
            </div>
          )}

          {showEmptyState && <EmptyState onTrySample={handleTrySample} />}

          <ProgressStepper stage={stage} onCancel={handleCancel} />

          <PreviewPanel
            ref={previewPanelRef}
            draft={draft}
            sourceInsight={sourceInsight}
            docType={docType}
            parseStatus={parseStatus}
            builtPreview={builtPreview}
            showEditor={showEditor}
            editing={editing}
            building={exportState.loading}
            canRegenerate={hasConfigured || hasDemo}
            onTitleChange={updateTitle}
            onSectionChange={updateSection}
            onAddSection={addSection}
            onRemoveSection={removeSection}
            onMoveSection={moveSection}
            onRegenerateSection={handleRegenerateSection}
            onBuild={handleBuild}
            onEditAgain={handleEditAgain}
          />

          {exportState.validation && (
            <ValidationPanel validation={exportState.validation} />
          )}

          <HistoryPanel refreshKey={exportState.url} />
        </div>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
    </ErrorBoundary>
  )
}
