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
import { RecoveryBanner } from './components/RecoveryBanner.jsx'
import { useProviders } from './hooks/useProviders.js'
import { useRhwp } from './hooks/useRhwp.js'
import { useDraft } from './hooks/useDraft.js'
import { useAuth } from './hooks/useAuth.js'
import { useToast } from './hooks/useToast.js'
import { useDocumentFlow } from './hooks/useDocumentFlow.js'
import { providerListErrorMessage } from './lib/feedback.js'

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

  function handleDocTypeChange(next) {
    setDocType(next)
    setDocFields({})
  }
  function setDocField(key, value) {
    setDocFields((prev) => ({ ...prev, [key]: value }))
  }

  const { user, logout, loginWithPopup } = useAuth()
  const autoLogin = import.meta.env.VITE_AUTO_LOGIN === 'true'
  const toast = useToast()

  const providersInfo = useProviders((err) => {
    console.warn('providers fetch failed', err)
    toast.error(providerListErrorMessage())
  })

  const usingDemo = !providersInfo.hasConfigured && providersInfo.hasDemo
  const effectiveProvider = usingDemo ? 'mock' : providersInfo.aiProvider
  const effectiveModel = usingDemo ? 'mock' : providersInfo.aiModel
  const rhwp = useRhwp()
  const draftApi = useDraft({ setParseStatus: rhwp.setParseStatus })
  const flow = useDocumentFlow({
    rhwp,
    draftApi,
    toast,
    providersInfo: {
      hasConfigured: providersInfo.hasConfigured, hasDemo: providersInfo.hasDemo, usingDemo,
      effectiveProvider, effectiveModel, openSettings: () => setShowSettings(true)
    },
    previewPanelRef,
    form: {
      sourceFile, setSourceFile, docType, setDocType, companyName, goal, notes,
      targetTitle, setTargetTitle, docFields
    }
  })

  return (
    <ErrorBoundary>
      <div className="app-shell">
        {autoLogin && <LoginOverlay onLogin={loginWithPopup} user={user} />}
      <TopBar
        hasConfigured={providersInfo.hasConfigured}
        usingDemo={usingDemo}
        activeProviderLabel={providersInfo.activeProvider?.label}
        onOpenSettings={() => setShowSettings(true)}
        user={user}
        onLogin={loginWithPopup}
        onLogout={logout}
      />

      <ProviderSettings
        open={showSettings}
        providers={providersInfo.providers}
        aiProvider={providersInfo.aiProvider}
        setAiProvider={providersInfo.setAiProvider}
        refreshProviders={providersInfo.refresh}
        onClose={() => setShowSettings(false)}
      />

      <main className="workspace">
        <ControlPanel
          onFileSelect={flow.handleFileSelect}
          sourceFile={sourceFile}
          sourceInsight={rhwp.sourceInsight}
          docType={docType} setDocType={handleDocTypeChange}
          docFields={docFields} setDocField={setDocField}
          companyName={companyName} setCompanyName={setCompanyName}
          targetTitle={targetTitle} setTargetTitle={setTargetTitle}
          goal={goal} setGoal={setGoal}
          notes={notes} setNotes={setNotes}
          activeModels={providersInfo.activeModels} aiModel={providersInfo.aiModel} setAiModel={providersInfo.setAiModel}
          hwpConvertAvailable={Boolean(providersInfo.capabilities?.hwpConvert)}
          onGenerate={flow.handleGenerate}
          onDownload={flow.handleDownload}
          onDownloadPdf={flow.handleDownloadPdf}
          canDownloadPdf={rhwp.builtPreview.svgs.length > 0}
          pdfBusy={flow.pdfBusy}
          draftLoading={draftApi.draftLoading}
          exportState={draftApi.exportState}
          hasDraft={Boolean(draftApi.draft)}
          usingDemo={usingDemo}
          parseStatus={rhwp.parseStatus}
        />

        <div className="preview-column">
          {draftApi.recoverable && !draftApi.draft && (
            <RecoveryBanner recoverable={draftApi.recoverable} onRecover={draftApi.recoverDraft} onDismiss={draftApi.dismissRecovery} />
          )}

          {flow.showEmptyState && <EmptyState onTrySample={flow.handleTrySample} />}

          <ProgressStepper stage={flow.stage} onCancel={flow.handleCancel} />

          <PreviewPanel
            ref={previewPanelRef}
            draft={draftApi.draft}
            sourceInsight={rhwp.sourceInsight}
            docType={docType}
            parseStatus={rhwp.parseStatus}
            builtPreview={rhwp.builtPreview}
            showEditor={flow.showEditor}
            editing={flow.editing}
            building={draftApi.exportState.loading}
            canRegenerate={providersInfo.hasConfigured || providersInfo.hasDemo}
            onTitleChange={draftApi.updateTitle}
            onSectionChange={draftApi.updateSection}
            onAddSection={draftApi.addSection}
            onRemoveSection={draftApi.removeSection}
            onMoveSection={draftApi.moveSection}
            onRegenerateSection={flow.handleRegenerateSection}
            onBuild={flow.handleBuild}
            onEditAgain={flow.handleEditAgain}
          />

          {draftApi.exportState.validation && (
            <ValidationPanel validation={draftApi.exportState.validation} />
          )}

          <HistoryPanel refreshKey={draftApi.exportState.url} />
        </div>
      </main>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
    </ErrorBoundary>
  )
}
