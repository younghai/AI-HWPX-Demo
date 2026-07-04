import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { sendError } from '../lib/errors.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const samplesDir = path.join(v4Root, 'templates', 'samples')

// Starter template gallery (review B3). Each is a valid HWPX pre-structured for
// its document type (regenerate with scripts/gen_sample_templates.py). One click
// loads it as the working template, then the AI (or demo) fills the bodies.
const SAMPLES = [
  {
    id: 'report-basic',
    label: '보고서 기본 양식',
    description: '배경·현황·제안·계획·효과 5개 섹션. 분석 보고서 시작점.',
    fileName: 'report-sample.hwpx',
    docType: 'report',
    suggestedTitle: '2026 상반기 분석 보고서'
  },
  {
    id: 'proposal-basic',
    label: '제안서 기본 양식',
    description: '개요·문제·해결·일정·지원 5개 섹션. 사업 제안서 시작점.',
    fileName: 'proposal-sample.hwpx',
    docType: 'proposal',
    suggestedTitle: '신규 서비스 도입 제안서'
  },
  {
    id: 'minutes-basic',
    label: '회의록 기본 양식',
    description: '개요·논의·결정·액션·일정 5개 섹션. 회의록 시작점.',
    fileName: 'minutes-sample.hwpx',
    docType: 'minutes',
    suggestedTitle: '주간 업무 회의록'
  },
  {
    id: 'gonmun-basic',
    label: '공문서 기본 양식',
    description: '5개 섹션의 표준 공문 양식. AI 가 본문을 채웁니다.',
    fileName: 'gonmun-sample.hwpx',
    docType: 'gonmun',
    suggestedTitle: '신규 사업 추진 보고서'
  }
]

const router = Router()

router.get('/api/samples', (_req, res) => {
  res.json({ ok: true, samples: SAMPLES.map(({ fileName, ...meta }) => ({ ...meta, downloadUrl: `/api/samples/${meta.id}/file` })) })
})

router.get('/api/samples/:id/file', async (req, res) => {
  const sample = SAMPLES.find((s) => s.id === req.params.id)
  if (!sample) {
    return res.status(404).json({ ok: false, error: '샘플을 찾을 수 없습니다.' })
  }
  try {
    const filePath = path.join(samplesDir, sample.fileName)
    const data = await fs.readFile(filePath)
    res.setHeader('Content-Type', 'application/hwp+zip')
    res.setHeader('Content-Disposition', `attachment; filename="${sample.fileName}"`)
    res.send(data)
  } catch (err) {
    sendError(res, err)
  }
})

export default router
