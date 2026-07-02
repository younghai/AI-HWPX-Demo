import { useRef, useState } from 'react'
import initRhwp, { HwpDocument } from '@rhwp/core'
import { extractTextFromSvg } from '../lib/helpers.js'

const BUILT_INITIAL = { svgs: [], pageCount: 0, fileName: '', url: '' }

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
    const extractedPages = [initialText]
    for (let i = 1; i < Math.min(totalPages, 3); i += 1) {
      extractedPages.push(extractTextFromSvg(document.renderPageSvg(i)))
    }
    if (parseJobRef.current !== jobId) return
    setSourceInsight((current) => ({
      ...current,
      extractedText: extractedPages.join('\n').trim()
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

  return {
    sourceInsight,
    parseStatus,
    setParseStatus,
    parseFile,
    builtPreview,
    renderBuiltHwpx,
    clearBuiltPreview
  }
}
