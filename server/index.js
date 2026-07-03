import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'
import pinoHttp from 'pino-http'

import healthRouter from './routes/health.js'
import providersRouter from './routes/providers.js'
import draftRouter from './routes/draft.js'
import exportRouter from './routes/export.js'
import samplesRouter from './routes/samples.js'
import historyRouter from './routes/history.js'
import { createAuthRouter } from './routes/auth.js'
import googleAuthRouter from './routes/googleAuth.js'
import { generatedDirectory } from './services/hwpxBuilder.js'
import { startGeneratedCleanup } from './lib/cleanup.js'
import { requireSession } from './lib/authGuard.js'
import { PORT, CLIENT_ORIGIN, OAUTH_REDIRECT_BASE } from './lib/config.js'
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
// helmet security headers. CSP is disabled because the OAuth result pages rely
// on inline scripts; the other protections (HSTS, noSniff, frameguard, …) apply.
// A tailored CSP is a follow-up refinement.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }))
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
for (const p of ['/api/generate-draft', '/api/regenerate-section', '/api/export-hwpx', '/api/test-provider']) {
  app.use(p, costLimiter)
}

// Local observability snapshot (counts + avg latency for AI/build ops).
app.get('/api/metrics', (_req, res) => res.json({ ok: true, metrics: snapshot() }))

app.use(healthRouter)
app.use(providersRouter)
app.use(draftRouter)
app.use(exportRouter)
app.use(samplesRouter)
app.use(historyRouter)
app.use(googleAuthRouter)
app.use(createAuthRouter({ oauthBase: OAUTH_BASE, clientOrigin: CLIENT_ORIGIN }))

startGeneratedCleanup(generatedDirectory)

app.listen(PORT, '127.0.0.1', () => {
  logger.info({ port: PORT, authMode: process.env.AUTH_MODE || 'local' }, `AI HWP server listening on http://127.0.0.1:${PORT}`)
})
