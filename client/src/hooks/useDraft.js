import { useEffect, useRef, useState } from 'react'
import { buildOptimisticDraft, triggerDownload, estimateTemplateSlots } from '../lib/helpers.js'
import { renderDiagramSvg } from '../lib/diagrams.js'
import { svgToPngBlob } from '../lib/rasterize.js'

// Autosave (A2): persist the working draft so an accidental refresh mid-edit
// doesn't discard 10 minutes of work. Only the draft content is saved — the
// uploaded source file can't be persisted, so recovery restores the text and
// prompts the user to re-upload the original before re-building.
const AUTOSAVE_KEY = 'ai-hwp-draft-autosave'

function loadSavedDraft() {
  try {
    const raw = window.localStorage?.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.draft && Array.isArray(parsed.draft.sections) && parsed.draft.sections.length) return parsed
  } catch { /* disabled / corrupt */ }
  return null
}

// Human-readable status for a streaming progress event (review B2).
function phaseLabel(p) {
  const secs = p?.elapsedMs ? ` · ${Math.round(p.elapsedMs / 1000)}초` : ''
  switch (p?.phase) {
    case 'prompt': return `AI 프롬프트를 구성했습니다. 응답을 기다리는 중…${secs}`
    case 'calling': return p.attempt > 1
      ? `AI 응답이 지연되어 재시도 중입니다 (${p.attempt}차)…${secs}`
      : `${p.provider || 'AI'}가 초안을 작성하는 중입니다…${secs}`
    case 'parsing': return `AI 응답을 검증하는 중…${secs}`
    default: return `생성 중…${secs}`
  }
}

// POST to the SSE stream endpoint and parse progress/result/error events.
// Throws Error('stream-unavailable') when the transport itself can't stream
// (so the caller can safely fall back to the plain JSON endpoint); a real
// generation error arrives as an SSE `error` event and is thrown as-is (never
// retried, to avoid a second AI charge).
async function streamGenerateDraft(body, signal, onPhase) {
  let res
  try {
    res = await fetch('/api/generate-draft/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error('stream-unavailable')
  }
  if (!res.ok || !res.body) throw new Error('stream-unavailable')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result = null
  let genError = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      const ev = (raw.match(/^event:\s*(.+)$/m) || [])[1] || 'message'
      const dataLine = (raw.match(/^data:\s*(.+)$/m) || [])[1]
      if (!dataLine) continue
      let data
      try { data = JSON.parse(dataLine) } catch { continue }
      if (ev === 'progress') onPhase?.(data)
      else if (ev === 'result') result = data
      else if (ev === 'error') genError = new Error(data.error || '초안 생성에 실패했습니다.')
    }
  }
  if (genError) throw genError
  if (!result?.draft) throw new Error('stream-unavailable')
  return result.draft
}

export function useDraft({ setParseStatus }) {
  const [draft, setDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [exportState, setExportState] = useState({ loading: false, url: '', fileName: '', message: '' })
  // Saved draft from a previous session, offered via a recovery banner (never
  // auto-loaded). Read once on mount.
  const [recoverable, setRecoverable] = useState(loadSavedDraft)
  const draftControllerRef = useRef(null)
  const exportControllerRef = useRef(null)

  // Persist any real (non-optimistic) draft on change, stripping transient flags.
  useEffect(() => {
    if (!draft || draft.engine === 'optimistic-preview') return
    try {
      const clean = { ...draft, sections: (draft.sections || []).map(({ regenerating, ...s }) => s) }
      window.localStorage?.setItem(AUTOSAVE_KEY, JSON.stringify({ draft: clean, savedAt: Date.now() }))
    } catch { /* quota exceeded / disabled — autosave is best-effort */ }
  }, [draft])

  function recoverDraft() {
    if (recoverable?.draft) {
      setDraft(recoverable.draft)
      setParseStatus('이전에 작업하던 초안을 복구했습니다. 원본 파일을 다시 업로드하면 이 초안으로 HWPX를 생성할 수 있습니다.')
    }
    setRecoverable(null)
  }

  function dismissRecovery() {
    setRecoverable(null)
    try { window.localStorage?.removeItem(AUTOSAVE_KEY) } catch { /* ignore */ }
  }

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
      const body = {
        fileName: sourceInsight.fileName,
        sourceText: sourceInsight.extractedText,
        docType, companyName, goal, notes, targetTitle, aiProvider,
        docFields: docFields || {},
        model: aiModel,
        templateBodySlots
      }

      // Stream progress (B2); on transport failure fall back to the plain JSON
      // endpoint. A real generation error is re-thrown by streamGenerateDraft
      // (not 'stream-unavailable'), so it is NOT retried here.
      let nextDraft
      try {
        nextDraft = await streamGenerateDraft(body, controller.signal, (p) => setParseStatus(phaseLabel(p)))
      } catch (streamErr) {
        if (streamErr.message !== 'stream-unavailable') throw streamErr
        const response = await fetch('/api/generate-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        })
        const payload = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || '초안 생성에 실패했습니다.')
        nextDraft = payload.draft
      }

      setDraft(nextDraft)
      setParseStatus('업로드 문서를 바탕으로 새 문서 초안이 생성되었고, 오른쪽 미리보기에 바로 반영되었습니다.')
      return nextDraft
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

  async function buildHwpx({ draftOverride, sourceFile, sourceInsight, docType, docFields }) {
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
      formData.append('edited', String(Boolean(activeDraft.edited)))  // edit-rate KPI (C4)
      if (docType) formData.append('docType', docType)
      // C1: send docFields so the server can fill label/value form-table cells
      // (e.g. 회의록 일시/참석자). Only when non-empty — otherwise a plain no-op.
      if (docFields && Object.keys(docFields).length) formData.append('docFields', JSON.stringify(docFields))

      // B1: rasterize each diagram to a PNG so the server embeds the exact
      // preview pixels (no cairosvg needed). A failure just omits that PNG —
      // the server then falls back to its own render.
      const diagrams = activeDraft.diagrams || []
      await Promise.all(diagrams.map(async (spec, k) => {
        try {
          const svg = renderDiagramSvg(spec)
          if (!svg) return
          const blob = await svgToPngBlob(svg)
          formData.append('diagramImages', blob, `diagram-${k}.png`)
        } catch (err) {
          console.warn(`diagram ${k} 래스터화 실패 — 서버 렌더링으로 대체`, err)
        }
      }))

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
    updateSection, addSection, removeSection, moveSection, updateTitle, regenerateSection,
    recoverable, recoverDraft, dismissRecovery
  }
}
