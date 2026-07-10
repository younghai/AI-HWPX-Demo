import pino from 'pino'
import { IS_PRODUCTION, LOG_LEVEL } from './config.js'

// Structured JSON logging (review BE-18). Level via LOG_LEVEL env (default info,
// silent under test). Redacts obvious secret-bearing fields defensively.
export const logger = pino({
  level: LOG_LEVEL,
  base: undefined, // omit pid/hostname noise for a single-process local server
  redact: {
    // pino 의 `*` 는 한 레벨만 매칭하므로 req.body.apiKey 는 명시적으로 지정한다 (SEC-2).
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', 'req.body.apiKey', '*.access_token'],
    censor: '[redacted]'
  },
  ...(IS_PRODUCTION ? {} : { transport: undefined }) // plain JSON in all envs; pipe to pino-pretty if desired
})
