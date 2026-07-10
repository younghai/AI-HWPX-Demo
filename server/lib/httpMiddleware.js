import crypto from 'crypto'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import pinoHttp from 'pino-http'
import { logger } from './logger.js'

// 앱-수준 HTTP 미들웨어 구성 (SPEC-P3-d). 부트스트랩(index.js)은 장착만 하고,
// 무엇을 어떻게 기록/보호/제한하는지는 이 모듈이 소유한다.

// Structured request logging with a per-request id; skip the noisy health poll.
export function requestLogger() {
  return pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: { ignore: (req) => req.url === '/api/health' }
  })
}

// helmet security headers + CSP (spec-11). SPA/API 는 엄격 정책:
// - script-src 'wasm-unsafe-eval' — @rhwp/core 의 WebAssembly.instantiate 에 필요
// - img-src blob:/data: — 다이어그램 캔버스 래스터화·미리보기 이미지
// - upgrade-insecure-requests 해제 — 로컬은 http 직결(배포는 nginx 가 TLS 종단)
// OAuth 결과 페이지의 인라인 스크립트는 authPageCsp 의 완화 정책이 덮어쓴다
// (이전에는 이 페이지들 때문에 CSP 전체가 꺼져 있었다).
export function securityHeaders() {
  return helmet({
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
  })
}

// OAuth 팝업 결과·모의 로그인 페이지는 인라인 <script>/onclick/<style> 을 쓰는
// 서버 생성 HTML(메시지는 escapeXml 경유) — /auth 경로만 이 완화 정책으로 덮어쓴다.
const OAUTH_PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
export function authPageCsp() {
  return (_req, res, next) => {
    res.set('Content-Security-Policy', OAUTH_PAGE_CSP)
    next()
  }
}

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
export const globalLimiter = rateLimit({
  ...jsonLimit('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'),
  max: 1000,
  skip: (req) => req.path === '/api/health'
})

export const costLimiter = rateLimit({ ...jsonLimit('AI 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'), max: 30 })

// AI 호출·워커 spawn 등 비용이 큰 라우트 — costLimiter 적용 대상.
export const COST_LIMITED_PATHS = [
  '/api/generate-draft',
  '/api/generate-draft/stream',
  '/api/regenerate-section',
  '/api/export-hwpx',
  '/api/extract',
  '/api/test-provider'
]
