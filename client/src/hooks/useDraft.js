import { useRef, useState } from 'react'
import { buildOptimisticDraft, triggerDownload, estimateTemplateSlots } from '../lib/helpers.js'

export function useDraft({ setParseStatus }) {
  const [draft, setDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [exportState, setExportState] = useState({ loading: false, url: '', fileName: '', message: '' })
  const draftControllerRef = useRef(null)
  const exportControllerRef = useRef(null)

  function resetExport() {
    setExportState({ loading: false, url: '', fileName: '', message: '' })
  }

  async function generateDraft({ sourceFile, sourceInsight, docType, companyName, goal, notes, targetTitle, docFields, aiProvider, aiModel, onOptimistic }) {
    if (!sourceFile) {
      setParseStatus('먼저 HWP 또는 HWPX 문서를 업로드해 주세요.')
      return null
    }

    // Abort any previous draft request
    draftControllerRef.current?.abort()
    const controller = new AbortController()
    draftControllerRef.current = controller

    setDraftLoading(true)
    resetExport()
    const optimistic = buildOptimisticDraft({ sourceInsight, docType, companyName, goal, notes, targetTitle })
    setDraft(optimistic)
    setParseStatus('오른쪽에 초안 미리보기를 먼저 표시했습니다. 서버 응답이 오면 최신 내용으로 갱신됩니다.')
    onOptimistic?.()

    try {
      const templateBodySlots = sourceInsight.mode === 'hwpx-template'
        ? estimateTemplateSlots(sourceInsight.extractedText)
        : 0
      const response = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: sourceInsight.fileName,
          sourceText: sourceInsight.extractedText,
          docType, companyName, goal, notes, targetTitle, aiProvider,
          docFields: docFields || {},
          model: aiModel,
          templateBodySlots
        }),
        signal: controller.signal
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '초안 생성에 실패했습니다.')
      }
      setDraft(payload.draft)
      setParseStatus('업로드 문서를 바탕으로 새 문서 초안이 생성되었고, 오른쪽 미리보기에 바로 반영되었습니다.')
      return payload.draft
    } catch (error) {
      if (error.name === 'AbortError') return null
      setDraft(null)
      setParseStatus(`AI 초안 생성 실패: ${error.message}`)
      return null
    } finally {
      if (draftControllerRef.current === controller) {
        draftControllerRef.current = null
        setDraftLoading(false)
      }
    }
  }

  async function buildHwpx({ draftOverride, sourceFile, sourceInsight, docType }) {
    const activeDraft = draftOverride || draft
    if (!activeDraft || !sourceFile) {
      setParseStatus('먼저 문서를 업로드하고 초안을 생성해 주세요.')
      return null
    }

    // Abort any previous export request
    exportControllerRef.current?.abort()
    const controller = new AbortController()
    exportControllerRef.current = controller

    setExportState({ loading: true, url: '', fileName: '', message: '' })

    try {
      // Derive TOC from the (possibly edited/added/removed/reordered) section
      // headings so manual edits always flow through to the built HWPX.
      const toc = activeDraft.sections.map((s) => s.heading)
      const formData = new FormData()
      formData.append('title', activeDraft.title)
      formData.append('toc', toc.join('\n'))
      formData.append('sections', JSON.stringify(activeDraft.sections))
      formData.append('diagrams', JSON.stringify(activeDraft.diagrams || []))
      formData.append('sourceFile', sourceFile)
      formData.append('sourceMode', sourceInsight.mode)
      formData.append('sourceText', sourceInsight.extractedText)
      if (docType) formData.append('docType', docType)

      const response = await fetch('/api/export-hwpx', { method: 'POST', body: formData, signal: controller.signal })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'HWPX 생성에 실패했습니다.')
      }
      const result = {
        url: payload.downloadUrl,
        fileName: payload.fileName,
        message: payload.message,
        validation: payload.validation || null
      }
      setExportState({ loading: false, ...result })
      setParseStatus(payload.message)
      return result
    } catch (error) {
      if (error.name === 'AbortError') return null
      resetExport()
      setParseStatus(error.message)
      return null
    }
  }

  function downloadBuilt() {
    if (!exportState.url) {
      setParseStatus('다운로드할 HWPX가 아직 준비되지 않았습니다.')
      return
    }
    triggerDownload(exportState.url, exportState.fileName)
  }

  function cancelAll() {
    draftControllerRef.current?.abort()
    exportControllerRef.current?.abort()
    draftControllerRef.current = null
    exportControllerRef.current = null
    setDraftLoading(false)
    resetExport()
  }

  // ── Draft editing (review PO-01) ───────────────────────────────────────────
  // All edits mark the draft as user-edited so downstream UI (labels, build)
  // treats it as final content rather than an optimistic/AI placeholder.
  function patchDraft(mutator) {
    setDraft((current) => {
      if (!current) return current
      const next = mutator(current)
      return next ? { ...next, engine: next.engine === 'optimistic-preview' ? next.engine : (next.engine || 'edited'), edited: true } : current
    })
  }

  function updateSection(index, patch) {
    patchDraft((d) => {
      const sections = d.sections.map((s, i) => (i === index ? { ...s, ...patch } : s))
      return { ...d, sections, toc: sections.map((s) => s.heading) }
    })
  }

  function addSection(afterIndex) {
    patchDraft((d) => {
      const sections = [...d.sections]
      const at = typeof afterIndex === 'number' ? afterIndex + 1 : sections.length
      sections.splice(at, 0, { heading: '새 섹션', body: '' })
      return { ...d, sections, toc: sections.map((s) => s.heading) }
    })
  }

  function removeSection(index) {
    patchDraft((d) => {
      if (d.sections.length <= 1) return d
      const sections = d.sections.filter((_, i) => i !== index)
      return { ...d, sections, toc: sections.map((s) => s.heading) }
    })
  }

  function moveSection(index, dir) {
    patchDraft((d) => {
      const target = index + dir
      if (target < 0 || target >= d.sections.length) return d
      const sections = [...d.sections]
      ;[sections[index], sections[target]] = [sections[target], sections[index]]
      return { ...d, sections, toc: sections.map((s) => s.heading) }
    })
  }

  function updateTitle(title) {
    patchDraft((d) => ({ ...d, title }))
  }

  async function regenerateSection(index, context) {
    const current = draft
    if (!current || !current.sections[index]) return
    const section = current.sections[index]
    updateSection(index, { regenerating: true })
    try {
      const response = await fetch('/api/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heading: section.heading,
          title: current.title,
          otherHeadings: current.sections.filter((_, i) => i !== index).map((s) => s.heading),
          ...context
        })
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '섹션 재생성에 실패했습니다.')
      }
      updateSection(index, { body: payload.body, regenerating: false })
      return payload.body
    } catch (error) {
      updateSection(index, { regenerating: false })
      setParseStatus(`섹션 재생성 실패: ${error.message}`)
      return null
    }
  }

  return {
    draft, setDraft, draftLoading, exportState, generateDraft, buildHwpx, downloadBuilt, cancelAll,
    updateSection, addSection, removeSection, moveSection, updateTitle, regenerateSection
  }
}
