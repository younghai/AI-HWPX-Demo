import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'
import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import pinoHttp from 'pino-http'

import healthRouter from './routes/health.js'
import providersRouter from './routes/providers.js'
import draftRouter from './routes/draft.js'
import exportRouter from './routes/export.js'
import samplesRouter from './routes/samples.js'
import historyRouter from './routes/history.js'
import { createAuthRouter } from './routes/auth.js'
import googleAuthRouter from './routes/googleAuth.js'
import { generatedDirectory } from './lib/paths.js'
import { startGeneratedCleanup } from './lib/cleanup.js'
import { requireSession } from './lib/authGuard.js'
import { PORT, HOST, CLIENT_ORIGIN, OAUTH_REDIRECT_BASE } from './lib/config.js'
import { logger } from './lib/logger.js'
import { snapshot } from './lib/metrics.js'

const OAUTH_BASE = OAUTH_REDIRECT_BASE

const app = express()
// Structured request logging with a per-request id; skip the noisy health poll.
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  autoLogging: { ignore: (req) => req.url === '/api/health' }
}))
// helmet security headers + CSP (spec-11). SPA/API 는 엄격 정책:
// - script-src 'wasm-unsafe-eval' — @rhwp/core 의 WebAssembly.instantiate 에 필요
// - img-src blob:/data: — 다이어그램 캔버스 래스터화·미리보기 이미지
// - upgrade-insecure-requests 해제 — 로컬은 http 직결(배포는 nginx 가 TLS 종단)
// OAuth 결과 페이지의 인라인 스크립트는 아래 /auth 전용 완화 정책이 덮어쓴다
// (이전에는 이 페이지들 때문에 CSP 전체가 꺼져 있었다).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", "'wasm-unsafe-eval'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'"],
      'upgrade-insecure-requests': null
    }
  },
  crossOriginResourcePolicy: false
}))
// OAuth 팝업 결과·모의 로그인 페이지는 인라인 <script>/onclick/<style> 을 쓰는
// 서버 생성 HTML(메시지는 escapeXml 경유) — 이 경로만 완화 정책으로 덮어쓴다.
const OAUTH_PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
app.use('/auth', (_req, res, next) => {
  res.set('Content-Security-Policy', OAUTH_PAGE_CSP)
  next()
})
app.use(cors({ origin: CLIENT_ORIGIN, methods: ['GET', 'POST'], credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '3mb' }))
// Generated documents may contain user content — gate them behind the session
// in protected mode (no-op in local mode). See review BE-04.
app.use('/generated', requireSession, express.static(generatedDirectory))

// Rate limiting: a generous global cap plus a strict cap on AI/spawn/cost routes
// so an exposed deployment can't be driven into cost-blowup or DoS (review BE-06).
const jsonLimit = (message) => ({
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ ok: false, code: 'RATE_LIMITED', error: message })
})
// Global cap accommodates a polling UI (providers/history/me); health is exempt
// so monitoring never trips it. The cost limiter below stays strict on AI routes.
const globalLimiter = rateLimit({
  ...jsonLimit('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'),
  max: 1000,
  skip: (req) => req.path === '/api/health'
})
const costLimiter = rateLimit({ ...jsonLimit('AI 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'), max: 30 })
app.use('/api/', globalLimiter)
for (const p of ['/api/generate-draft', '/api/generate-draft/stream', '/api/regenerate-section', '/api/export-hwpx', '/api/test-provider']) {
  app.use(p, costLimiter)
}

// Local observability snapshot (counts + avg latency for AI/build ops).
app.get('/api/metrics', requireSession, (_req, res) => res.json({ ok: true, metrics: snapshot() }))

app.use(healthRouter)
app.use(providersRouter)
app.use(draftRouter)
app.use(exportRouter)
app.use(samplesRouter)
app.use(historyRouter)
app.use(googleAuthRouter)
app.use(createAuthRouter({ oauthBase: OAUTH_BASE, clientOrigin: CLIENT_ORIGIN }))

startGeneratedCleanup(generatedDirectory)

// Production: serve the built SPA from this same process so a single container
// serves both the API and the client (review A3). No-op in dev, where vite
// serves the client and proxies /api here. Placed after all API/auth routers so
// the catch-all only handles unmatched, non-API GET routes.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '..', 'client', 'dist')
if (existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/generated') || req.path.startsWith('/auth')) {
      return next()
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
  logger.info({ clientDist }, 'serving built SPA')
}

app.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT, authMode: process.env.AUTH_MODE || 'local' }, `AI HWP server listening on http://${HOST}:${PORT}`)
})
