import { useRef, useState } from 'react'

const ACCEPTED_EXTENSIONS = ['.hwp', '.hwpx']

function isAcceptedFile(file) {
  if (!file) return false
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Uploader({ onFileSelect, currentFile, currentInsight }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [rejectMessage, setRejectMessage] = useState('')

  function handleFiles(fileList) {
    setRejectMessage('')
    const file = fileList?.[0]
    if (!file) return
    if (!isAcceptedFile(file)) {
      setRejectMessage(`지원하지 않는 파일 형식입니다: ${file.name} — .hwp 또는 .hwpx 만 업로드할 수 있습니다.`)
      return
    }
    onFileSelect(file)
  }

  function handleInputChange(event) {
    handleFiles(event.target.files)
    // allow re-selecting the same file later
    event.target.value = ''
  }

  function openPicker() {
    inputRef.current?.click()
  }

  function handleDragOver(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!isDragging) setIsDragging(true)
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event) {
    event.preventDefault()
    event.stopPropagation()
    // Only clear when leaving the root element, not child elements
    if (event.currentTarget.contains(event.relatedTarget)) return
    setIsDragging(false)
  }

  function handleDrop(event) {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  function handleReset(event) {
    event.stopPropagation()
    onFileSelect(null)
    setRejectMessage('')
  }

  const hasFile = Boolean(currentFile)

  return (
    <div
      className={`uploader ${isDragging ? 'is-dragging' : ''} ${hasFile ? 'has-file' : ''} ${rejectMessage ? 'is-rejected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="HWP 또는 HWPX 파일 업로드 (클릭하거나 드래그하여 놓으세요)"
      onClick={openPicker}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPicker() }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {hasFile ? (
        <div className="uploader-filled">
          <svg className="uploader-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div className="uploader-meta">
            <strong>{currentFile.name}</strong>
            <span>
              {formatSize(currentFile.size)}
              {currentInsight?.pageCount ? ` · ${currentInsight.pageCount}p` : ''}
              {currentInsight?.mode === 'hwpx-template' ? ' · HWPX 양식' : currentInsight?.mode === 'hwp-source' ? ' · HWP 문서' : ''}
            </span>
          </div>
          <button type="button" className="uploader-reset" onClick={handleReset} aria-label="파일 해제">
            ×
          </button>
        </div>
      ) : (
        <div className="uploader-empty">
          <svg className="uploader-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p className="uploader-title">
            {isDragging ? '여기에 놓아 업로드' : 'HWP / HWPX 파일을 여기에 끌어다 놓거나 클릭'}
          </p>
          <p className="uploader-sub">지원 형식: .hwp, .hwpx · 최대 20 MB</p>
        </div>
      )}

      {rejectMessage && (
        <p className="uploader-reject" role="alert">{rejectMessage}</p>
      )}
    </div>
  )
}
