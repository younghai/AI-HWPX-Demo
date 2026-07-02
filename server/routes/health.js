import { Router } from 'express'

const router = Router()

router.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: 'local-rhwp-demo',
    ready: true,
    reason: 'v2 localhost 데모가 준비되어 있습니다. rhwp 기반 업로드 파싱과 로컬 초안 생성이 가능합니다.'
  })
})

export default router
