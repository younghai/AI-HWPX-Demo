import pino from 'pino'
import { IS_PRODUCTION } from './config.js'

// Structured JSON logging (review BE-18). Level via LOG_LEVEL env (default info,
// silent under test). Redacts obvious secret-bearing fields defensively.
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: undefined, // omit pid/hostname noise for a single-process local server
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', '*.access_token'],
    censor: '[redacted]'
  },
  ...(IS_PRODUCTION ? {} : { transport: undefined }) // plain JSON in all envs; pipe to pino-pretty if desired
})
