import { useRef, useState } from 'react'
import { TopBar } from './components/TopBar.jsx'
import { LoginOverlay } from './components/LoginOverlay.jsx'
import { ProviderSettings } from './components/ProviderSettings.jsx'
import { ControlPanel } from './components/ControlPanel.jsx'
import { PreviewPanel } from './components/PreviewPanel.jsx'
import { ValidationPanel } from './components/ValidationPanel.jsx'
import { EmptyState } from './components/EmptyState.jsx'
import { ToastContainer } from './components/Toast.jsx'
import { useProviders } from './hooks/useProviders.js'
import { useRhwp } from './hooks/useRhwp.js'
import { useDraft } from './hooks/useDraft.js'
import { useAuth } from './hooks/useAuth.js'
import { useToast } from './hooks/useToast.js'

export default function App() {
  const previewPanelRef = useRef(null)

  const [sourceFile, setSourceFile] = useState(null)
  const [aiApiKey] = useState('')
  const [docType, setDocType] = useState('report')
  const [companyName, setCompanyName] = useState('Bizmatrixx')
  const [goal, setGoal] = useState('업로드한 문서의 핵심 내용을 바탕으로 임원 검토용 초안을 만들어 주세요.')
  const [notes, setNotes] = useState('핵심 메시지는 유지하고, 목차는 더 명확하게 재구성해 주세요.')
  const [targetTitle, setTargetTitle] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const { user, logout, loginWithPopup } = useAuth()
  const autoLogin = import.meta.env.VITE_AUTO_LOGIN === 'true'
  const { toasts, dismiss, success, error: errorToast, info } = useToast()

  const {
    providers, aiProvider, setAiProvider, refresh: refreshProviders, activeProvider, hasConfigured
  } = useProviders((err) => {
    console.warn('providers fetch failed', err)
    errorToast('AI provider 목록을 불러오지 못했습니다.')
  })

  const {
    sourceInsight,
    parseStatus,
    setParseStatus,
    parseFile,
    builtPreview,
    renderBuiltHwpx,
    clearBuiltPreview
  } = useRhwp()
  const {
    draft, setDraft, draftLoading, exportState, generateDraft, buildHwpx, downloadBuilt
  } = useDraft({ setParseStatus })

  async function handleFileSelect(file) {
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

  async function handleGenerate() {
    clearBuiltPreview()
    if (!hasConfigured) {
      errorToast('먼저 우측 상단 ⚙ 버튼에서 AI 키를 설정해주세요.', {
        action: { label: '설정 열기', onClick: () => setShowSettings(true) }
      })
      return
    }
    const next = await generateDraft({
      sourceFile, sourceInsight, docType, companyName, goal, notes, targetTitle,
      aiProvider, onOptimistic: scrollToPreview
    })
    if (!next) {
      scrollToPreview()
      errorToast('AI 초안 생성에 실패했습니다. 우측 패널의 메시지를 확인해주세요.')
      return
    }
    if (next.title) setTargetTitle(next.title)
    if (next.usage) {
      const cost = next.usage.estCostUsd > 0
        ? ` · 추정 비용 $${next.usage.estCostUsd.toFixed(4)}`
        : ''
      info(`AI 응답 ${(next.usage.elapsedMs / 1000).toFixed(1)}초${cost}`)
    }

    setParseStatus('AI 초안을 바탕으로 HWPX 파일을 생성하는 중입니다...')
    const built = await buildHwpx({ draftOverride: next, sourceFile, sourceInsight, docType })
    if (built?.url) {
      setParseStatus('HWPX를 렌더링해 미리보기에 반영합니다...')
      const rendered = await renderBuiltHwpx(built.url, built.fileName)
      if (rendered) {
        setParseStatus('미리보기와 다운로드 파일이 동일한 HWPX로 생성되었습니다.')
      } else {
        setParseStatus('HWPX 파일이 생성되었습니다. 다운로드 버튼으로 받을 수 있습니다.')
      }
      // 검증 결과 토스트
      const v = built.validation
      if (v) {
        if (!v.ok) {
          errorToast(`HWPX 검증: 에러 ${v.errorCount}건, 경고 ${v.warningCount}건. 우측 검증 패널을 확인하세요.`)
        } else if (v.warningCount > 0) {
          info(`HWPX 검증: 경고 ${v.warningCount}건. 큰 문제는 없습니다.`)
        } else {
          success('HWPX 검증 통과!')
        }
      }
    } else {
      errorToast('HWPX 빌드에 실패했습니다.')
    }
    scrollToPreview()
  }

  function handleDownload() {
    downloadBuilt()
  }

  const showEmptyState = !sourceFile && !draft && !builtPreview.svgs.length

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
          docType={docType} setDocType={setDocType}
          companyName={companyName} setCompanyName={setCompanyName}
          targetTitle={targetTitle} setTargetTitle={setTargetTitle}
          goal={goal} setGoal={setGoal}
          notes={notes} setNotes={setNotes}
          onGenerate={handleGenerate}
          onDownload={handleDownload}
          draftLoading={draftLoading}
          exportState={exportState}
          hasDraft={Boolean(draft)}
          parseStatus={parseStatus}
        />

        <div className="preview-column">
          {showEmptyState && <EmptyState onTrySample={handleTrySample} />}

          <PreviewPanel
            ref={previewPanelRef}
            draft={draft}
            sourceInsight={sourceInsight}
            docType={docType}
            parseStatus={parseStatus}
            builtPreview={builtPreview}
          />

          {exportState.validation && (
            <ValidationPanel validation={exportState.validation} />
          )}
        </div>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
    </ErrorBoundary>
  )
}
