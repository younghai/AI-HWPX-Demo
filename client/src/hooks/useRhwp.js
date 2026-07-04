import { useRef, useState } from 'react'
import initRhwp, { HwpDocument } from '@rhwp/core'
import { extractTextFromSvg } from '../lib/helpers.js'
import { buildPdfFromSvgs } from '../lib/pdf.js'

// Hard cap on PDF pages so a pathological doc can't hang the browser (review C3).
const MAX_PDF_PAGES = 100

const BUILT_INITIAL = { svgs: [], pageCount: 0, fileName: '', url: '' }

// Full-document context extraction bounds (review PO-02).
const MAX_CONTEXT_PAGES = 50
const MAX_CONTEXT_CHARS = 12000

export function useRhwp() {
  const docRef = useRef(null)
  const builtDocRef = useRef(null)
  const initPromiseRef = useRef(null)
  const parseJobRef = useRef(0)

  const [sourceInsight, setSourceInsight] = useState({
    fileName: '',
    pageCount: 0,
    previewSvg: '',
    extractedText: '',
    mode: ''
  })
  const [builtPreview, setBuiltPreview] = useState(BUILT_INITIAL)
  const [parseStatus, setParseStatus] = useState('업로드한 문서를 분석하면 여기 상태가 표시됩니다.')

  async function ensureRhwp() {
    if (initPromiseRef.current) return initPromiseRef.current

    let canvasContext = null
    let lastFont = ''
    globalThis.measureTextWidth = (font, text) => {
      if (!canvasContext) {
        canvasContext = document.createElement('canvas').getContext('2d')
      }
      if (!canvasContext) return Math.max(0, String(text || '').length * 8)
      if (font !== lastFont) {
        canvasContext.font = font
        lastFont = font
      }
      return canvasContext.measureText(text).width
    }

    initPromiseRef.current = initRhwp()
    return initPromiseRef.current
  }

  async function parseFile(file) {
    if (!file) return null
    setParseStatus('문서를 로컬 브라우저에서 파싱하는 중입니다...')
    parseJobRef.current += 1
    const jobId = parseJobRef.current

    try {
      await ensureRhwp()
      const buffer = await file.arrayBuffer()
      if (docRef.current) docRef.current.free()
      const bytes = new Uint8Array(buffer)
      const document = new HwpDocument(bytes)
      docRef.current = document
      const totalPages = document.pageCount() || 1
      const previewSvg = document.renderPageSvg(0)
      const firstPageText = extractTextFromSvg(previewSvg).trim()
      const isHwpx = file.name.toLowerCase().endsWith('.hwpx')

      const insight = {
        fileName: file.name,
        pageCount: totalPages,
        previewSvg,
        extractedText: firstPageText,
        mode: isHwpx ? 'hwpx-template' : 'hwp-source'
      }
      setSourceInsight(insight)
      setParseStatus(isHwpx
        ? 'HWPX 양식이 분석되었습니다. 업로드한 양식을 결과 문서 템플릿으로 재사용할 수 있습니다.'
        : 'HWP 문서가 분석되었습니다. 원문 내용을 바탕으로 새 HWPX 초안을 생성합니다.'
      )

      void enrichAdditionalPages({ document, totalPages, initialText: firstPageText, jobId })
      return insight
    } catch (error) {
      console.error('[useRhwp] parseFile failed:', error)
      setParseStatus(`문서 분석에 실패했습니다: ${error.message}`)
      return null
    }
  }

  async function enrichAdditionalPages({ document, totalPages, initialText, jobId }) {
    if (totalPages <= 1) return
    // Extract the whole document (not just 3 pages) so the AI sees the full
    // source, capped by a char budget + hard page cap to keep the prompt sane
    // and the UI responsive on very large files. See review PO-02.
    const pages = [initialText]
    let total = initialText.length
    const pageLimit = Math.min(totalPages, MAX_CONTEXT_PAGES)
    for (let i = 1; i < pageLimit && total < MAX_CONTEXT_CHARS; i += 1) {
      if (parseJobRef.current !== jobId) return
      const text = extractTextFromSvg(document.renderPageSvg(i))
      pages.push(text)
      total += text.length + 1
      // Yield to the event loop periodically so a large doc doesn't freeze the UI.
      if (i % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    }
    if (parseJobRef.current !== jobId) return
    setSourceInsight((current) => ({
      ...current,
      extractedText: pages.join('\n').trim().slice(0, MAX_CONTEXT_CHARS)
    }))
  }

  async function renderBuiltHwpx(url, fileName) {
    if (!url) return null
    try {
      await ensureRhwp()
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HWPX 다운로드 실패: HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      if (builtDocRef.current) {
        builtDocRef.current.free()
        builtDocRef.current = null
      }
      const bytes = new Uint8Array(buffer)
      const document = new HwpDocument(bytes)
      builtDocRef.current = document
      const pageCount = document.pageCount() || 1
      const maxPages = Math.min(pageCount, 5)
      const svgs = []
      for (let i = 0; i < maxPages; i += 1) {
        svgs.push(document.renderPageSvg(i))
      }
      const next = { svgs, pageCount, fileName: fileName || '', url }
      setBuiltPreview(next)
      return next
    } catch (error) {
      setBuiltPreview(BUILT_INITIAL)
      setParseStatus(`생성된 HWPX 미리보기 렌더링 실패: ${error.message}`)
      return null
    }
  }

  function clearBuiltPreview() {
    if (builtDocRef.current) {
      builtDocRef.current.free()
      builtDocRef.current = null
    }
    setBuiltPreview(BUILT_INITIAL)
  }

  // Render EVERY page of the built document (not just the 5 preview pages) and
  // assemble a downloadable PDF (review C3). Reuses the already-parsed doc.
  async function exportBuiltPdf(fileName) {
    const document = builtDocRef.current
    if (!document) return false
    const total = Math.min(document.pageCount() || 1, MAX_PDF_PAGES)
    const svgs = []
    for (let i = 0; i < total; i += 1) {
      svgs.push(document.renderPageSvg(i))
      if (i % 5 === 4) await new Promise((resolve) => setTimeout(resolve, 0)) // yield
    }
    return buildPdfFromSvgs(svgs, fileName || builtPreview.fileName || 'document.hwpx')
  }

  return {
    sourceInsight,
    parseStatus,
    setParseStatus,
    parseFile,
    builtPreview,
    renderBuiltHwpx,
    clearBuiltPreview,
    exportBuiltPdf
  }
}
