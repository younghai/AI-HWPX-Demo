import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { sendError } from '../lib/errors.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v4Root = path.resolve(__dirname, '..', '..')
const samplesDir = path.join(v4Root, 'templates', 'samples')

const SAMPLES = [
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
