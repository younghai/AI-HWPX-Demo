import { useState } from 'react'
import { diagramReportFeedback, usageMessage, validationFeedback } from '../lib/feedback.js'
import { triggerDownload } from '../lib/helpers.js'
import { requestHwpConversion } from '../lib/convertHwp.js'

function scrollToPreview(previewPanelRef) {
  requestAnimationFrame(() => {
    previewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function showFeedback(feedback, toast) {
  if (!feedback) return
  if (feedback.kind === 'success') toast.success(feedback.text)
  else if (feedback.kind === 'info') toast.info(feedback.text)
  else toast.error(feedback.text)
}

export function useDocumentFlow({ rhwp, draftApi, toast, providersInfo, previewPanelRef, form }) {
  const [stage, setStage] = useState('idle')
  const [editing, setEditing] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [hwpBusy, setHwpBusy] = useState(false)

  function draftContext() {
    return {
      docType: form.docType,
      companyName: form.companyName,
      goal: form.goal,
      notes: form.notes,
      docFields: form.docFields,
      sourceText: rhwp.sourceInsight.extractedText,
      aiProvider: providersInfo.effectiveProvider,
      model: providersInfo.effectiveModel
    }
  }

  function handleCancel() {
    draftApi.cancelAll()
    setStage('idle')
    rhwp.setParseStatus('작업을 취소했습니다.')
  }

  async function handleFileSelect(file) {
    setStage('idle')
    setEditing(false)
    if (!file) {
      form.setSourceFile(null)
      draftApi.cancelAll()
      draftApi.setDraft(null)
      rhwp.clearBuiltPreview()
      rhwp.setParseStatus('업로드한 문서를 분석하면 여기 상태가 표시됩니다.')
      return
    }
    form.setSourceFile(file)
    draftApi.cancelAll()
    draftApi.setDraft(null)
    rhwp.clearBuiltPreview()
    // HC-2: 변환기 가용 시 서버 MD 추출로 표 구조 보존 원문을 채택 (실패=flat 폴백)
    await rhwp.parseFile(file, { serverExtract: Boolean(providersInfo.hwpConvertAvailable) })
    if (!form.targetTitle) {
      form.setTargetTitle(file.name.replace(/\.(hwp|hwpx)$/i, ''))
    }
  }

  async function handleTrySample({ file, sample }) {
    if (sample?.suggestedTitle) form.setTargetTitle(sample.suggestedTitle)
    if (sample?.docType) form.setDocType(sample.docType)
    toast.info(`샘플 "${sample.label}" 을 불러왔습니다.`)
    await handleFileSelect(file)
  }

  async function handleGenerate() {
    if (!providersInfo.hasConfigured && !providersInfo.hasDemo) {
      toast.error('먼저 우측 상단 ⚙ 버튼에서 AI 키를 설정해주세요.', {
        action: { label: '설정 열기', onClick: providersInfo.openSettings }
      })
      return
    }
    if (providersInfo.usingDemo) {
      toast.info('데모 모드로 예시 초안을 생성합니다. 실제 AI 응답이 아니며, API 키를 연결하면 실제 생성이 가능합니다.')
    }
    rhwp.clearBuiltPreview()
    setEditing(true)
    setStage('generating')
    const next = await draftApi.generateDraft({
      sourceFile: form.sourceFile,
      sourceInsight: rhwp.sourceInsight,
      docType: form.docType,
      companyName: form.companyName,
      goal: form.goal,
      notes: form.notes,
      targetTitle: form.targetTitle,
      docFields: form.docFields,
      aiProvider: providersInfo.effectiveProvider,
      aiModel: providersInfo.effectiveModel,
      onOptimistic: () => scrollToPreview(previewPanelRef)
    })
    if (!next) {
      setStage('error')
      scrollToPreview(previewPanelRef)
      toast.error('AI 초안 생성에 실패했습니다. 우측 패널의 메시지를 확인해주세요.')
      return
    }
    if (next.title) form.setTargetTitle(next.title)
    if (next.usage) toast.info(usageMessage(next.usage))
    setStage('idle')
    rhwp.setParseStatus('AI 초안이 준비됐습니다. 내용을 검토·수정한 뒤 "이 초안으로 HWPX 생성"을 누르세요.')
    scrollToPreview(previewPanelRef)
  }

  async function handleBuild() {
    if (!draftApi.draft) return
    setEditing(false)
    setStage('building')
    rhwp.setParseStatus('초안 내용을 바탕으로 HWPX 파일을 생성하는 중입니다...')
    const built = await draftApi.buildHwpx({
      draftOverride: draftApi.draft,
      sourceFile: form.sourceFile,
      sourceInsight: rhwp.sourceInsight,
      docType: form.docType,
      docFields: form.docFields
    })
    if (built?.url) {
      setStage('rendering')
      rhwp.setParseStatus('HWPX를 렌더링해 미리보기에 반영합니다...')
      const rendered = await rhwp.renderBuiltHwpx(built.url, built.fileName)
      rhwp.setParseStatus(rendered
        ? '미리보기와 다운로드 파일이 동일한 HWPX로 생성되었습니다.'
        : 'HWPX 파일이 생성되었습니다. 다운로드 버튼으로 받을 수 있습니다.')
      setStage('done')
      showFeedback(diagramReportFeedback(built.diagramReport), toast)
      showFeedback(validationFeedback(built.validation), toast)
    } else {
      setEditing(true)
      setStage('error')
      toast.error('HWPX 빌드에 실패했습니다.')
    }
    scrollToPreview(previewPanelRef)
  }

  function handleRegenerateSection(index) {
    return draftApi.regenerateSection(index, draftContext())
  }

  function handleEditAgain() {
    setEditing(true)
    setStage('idle')
  }

  async function handleDownloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const ok = await rhwp.exportBuiltPdf(draftApi.exportState.fileName)
      if (ok) toast.success('PDF를 내려받았습니다. (미리보기 기준 — 원본 서식은 HWPX가 정확합니다)')
      else toast.error('PDF로 변환할 문서가 없습니다. 먼저 HWPX를 생성해 주세요.')
    } catch (err) {
      console.warn('pdf export failed', err)
      toast.error('PDF 변환에 실패했습니다.')
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleDownloadHwp() {
    if (hwpBusy || !draftApi.exportState.fileName) return
    setHwpBusy(true)
    try {
      const result = await requestHwpConversion(draftApi.exportState.fileName)
      if (result?.ok && result.downloadUrl) {
        triggerDownload(result.downloadUrl, result.fileName)
        toast.success('구버전 호환용 HWP 변환본을 내려받았습니다. 미리보기와 동일한 원본은 HWPX입니다.')
      } else {
        toast.error('HWP 변환에 실패했습니다. HWPX 다운로드를 이용해 주세요.')
      }
    } catch {
      toast.error('HWP 변환에 실패했습니다. HWPX 다운로드를 이용해 주세요.')
    } finally {
      setHwpBusy(false)
    }
  }

  return {
    stage,
    editing,
    pdfBusy,
    hwpBusy,
    showEmptyState: !form.sourceFile && !draftApi.draft && !rhwp.builtPreview.svgs.length,
    showEditor: Boolean(draftApi.draft) && (editing || !rhwp.builtPreview.svgs.length),
    handleCancel,
    handleFileSelect,
    handleTrySample,
    handleGenerate,
    handleBuild,
    handleDownload: draftApi.downloadBuilt,
    handleDownloadPdf,
    handleDownloadHwp,
    handleRegenerateSection,
    handleEditAgain
  }
}
