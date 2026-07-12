import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'

import healthRouter from './routes/health.js'
import providersRouter from './routes/providers.js'
import draftRouter from './routes/draft.js'
import exportRouter from './routes/export.js'
import extractRouter from './routes/extract.js'
import convertHwpRouter from './routes/convertHwp.js'
import samplesRouter from './routes/samples.js'
import historyRouter from './routes/history.js'
import metricsRouter from './routes/metrics.js'
import googleAuthRouter from './routes/googleAuth.js'
import { createAuthRouter } from './routes/auth.js'
import { generatedDirectory } from './lib/paths.js'
import { startGeneratedCleanup } from './lib/cleanup.js'
import { requireSession } from './lib/authGuard.js'
import { PORT, HOST, CLIENT_ORIGIN, OAUTH_REDIRECT_BASE } from './lib/config.js'
import { logger } from './lib/logger.js'
import {
  requestLogger,
  securityHeaders,
  authPageCsp,
  globalLimiter,
  costLimiter,
  COST_LIMITED_PATHS
} from './lib/httpMiddleware.js'
import { mountSpa } from './lib/spa.js'

// 부트스트랩: 미들웨어·라우터 장착만 한다 (SPEC-P3-d). 로깅/보안/제한의 내용은
// lib/httpMiddleware.js, SPA 서빙은 lib/spa.js, 관측 라우트는 routes/metrics.js 소유.
const app = express()
app.use(requestLogger())
app.use(securityHeaders())
app.use('/auth', authPageCsp())
app.use(cors({ origin: CLIENT_ORIGIN, methods: ['GET', 'POST'], credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '3mb' }))
// Generated documents may contain user content — gate them behind the session
// in protected mode (no-op in local mode). See review BE-04.
app.use('/generated', requireSession, express.static(generatedDirectory))
app.use('/api/', globalLimiter)
for (const p of COST_LIMITED_PATHS) app.use(p, costLimiter)

app.use(healthRouter)
app.use(providersRouter)
app.use(draftRouter)
app.use(exportRouter)
app.use(extractRouter)
app.use(convertHwpRouter)
app.use(samplesRouter)
app.use(historyRouter)
app.use(metricsRouter)
app.use(googleAuthRouter)
app.use(createAuthRouter({ oauthBase: OAUTH_REDIRECT_BASE, clientOrigin: CLIENT_ORIGIN }))

startGeneratedCleanup(generatedDirectory)
mountSpa(app)

app.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT, authMode: process.env.AUTH_MODE || 'local' }, `AI HWP server listening on http://${HOST}:${PORT}`)
})
