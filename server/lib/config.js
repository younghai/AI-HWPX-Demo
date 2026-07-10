import 'dotenv/config'
import os from 'os'

// Single source of truth for server configuration (review BE-P2). Previously the
// port/origin defaults were duplicated across index.js and googleAuth.js and had
// DRIFTED (5192/8792 vs 5188/8788), which broke the OAuth redirect_uri when env
// vars were unset. Centralizing here keeps them consistent.
export const PORT = Number(process.env.PORT || 8792)
// Bind host. Defaults to loopback for local safety; containers/servers set
// HOST=0.0.0.0 so the port is reachable from outside (review A3 Docker).
export const HOST = process.env.HOST || '127.0.0.1'
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5192'
export const OAUTH_REDIRECT_BASE = process.env.OAUTH_REDIRECT_BASE || `http://127.0.0.1:${PORT}`
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'
export const AUTH_MODE = process.env.AUTH_MODE === 'protected' ? 'protected' : 'local'
export const SESSION_COOKIE = 'ai_hwp_session'
export const JAVA_BIN = process.env.JAVA_BIN || 'java'
export const GENERATED_TTL_MS = Number(process.env.GENERATED_TTL_MS) || 24 * 60 * 60 * 1000
export const GENERATED_MAX_BYTES = Number(process.env.GENERATED_MAX_BYTES) || 500 * 1024 * 1024
export const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info')
export const POLARIS_DVC_CLI = process.env.POLARIS_DVC_CLI || ''
export const MAX_WORKER_SPAWNS = Number(process.env.MAX_WORKER_SPAWNS) || Math.max(2, (os.cpus()?.length || 4) - 2)
