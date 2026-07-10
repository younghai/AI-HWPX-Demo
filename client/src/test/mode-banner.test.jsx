import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ControlPanel } from '../components/ControlPanel.jsx'

afterEach(() => {
  cleanup()
})

function renderControlPanel({ mode, hwpConvertAvailable = false }) {
  return render(
    <ControlPanel
      onFileSelect={vi.fn()}
      sourceFile={{ name: mode === 'hwpx-template' ? 'template.hwpx' : 'source.hwp', size: 1024 }}
      sourceInsight={{ mode, pageCount: 1 }}
      docType="report"
      setDocType={vi.fn()}
      docFields={{}}
      setDocField={vi.fn()}
      companyName="Bizmatrixx"
      setCompanyName={vi.fn()}
      targetTitle=""
      setTargetTitle={vi.fn()}
      goal=""
      setGoal={vi.fn()}
      notes=""
      setNotes={vi.fn()}
      activeModels={[]}
      aiModel=""
      setAiModel={vi.fn()}
      hwpConvertAvailable={hwpConvertAvailable}
      onGenerate={vi.fn()}
      onDownload={vi.fn()}
      onDownloadPdf={vi.fn()}
      canDownloadPdf={false}
      pdfBusy={false}
      draftLoading={false}
      exportState={{ loading: false, url: '', fileName: '' }}
      hasDraft={false}
      usingDemo={false}
      parseStatus=""
    />
  )
}

describe('mode banner', () => {
  it('keeps the HWPX template text for uploaded templates', () => {
    renderControlPanel({ mode: 'hwpx-template', hwpConvertAvailable: true })

    expect(screen.getByRole('status')).toHaveClass('mode-banner--template')
    expect(screen.getByText('양식 유지 모드')).toBeInTheDocument()
    expect(screen.getByText(/업로드한 HWPX 서식·표·레이아웃을 그대로 두고 본문만 AI로 채웁니다/)).toBeInTheDocument()
  })

  it('shows HWP conversion text when the converter is available', () => {
    renderControlPanel({ mode: 'hwp-source', hwpConvertAvailable: true })

    expect(screen.getByRole('status')).toHaveClass('mode-banner--template')
    expect(screen.getByText('HWP 변환 모드')).toBeInTheDocument()
    expect(screen.getByText(/업로드한 HWP를 HWPX로 변환해 원본 서식·표·이미지를 유지하고 본문만 AI로 채웁니다/)).toBeInTheDocument()
  })

  it('keeps the new-form warning when the converter is unavailable', () => {
    renderControlPanel({ mode: 'hwp-source', hwpConvertAvailable: false })

    expect(screen.getByRole('status')).toHaveClass('mode-banner--source')
    expect(screen.getByText('새 양식 생성 모드')).toBeInTheDocument()
    expect(screen.getByText(/원본 서식은 유지되지 않습니다/)).toBeInTheDocument()
  })
})
