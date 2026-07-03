import 'dotenv/config'

// Single source of truth for server configuration (review BE-P2). Previously the
// port/origin defaults were duplicated across index.js and googleAuth.js and had
// DRIFTED (5192/8792 vs 5188/8788), which broke the OAuth redirect_uri when env
// vars were unset. Centralizing here keeps them consistent.
export const PORT = Number(process.env.PORT || 8792)
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5192'
export const OAUTH_REDIRECT_BASE = process.env.OAUTH_REDIRECT_BASE || `http://127.0.0.1:${PORT}`
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'
export const AUTH_MODE = process.env.AUTH_MODE === 'protected' ? 'protected' : 'local'
export const SESSION_COOKIE = 'ai_hwp_session'
