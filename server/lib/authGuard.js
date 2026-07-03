import { getSession } from './session.js'

// AUTH_MODE=local (default) keeps the localhost single-user experience friction-
// less: routes pass through without a session. AUTH_MODE=protected enforces a
// valid session cookie on state-changing / cost-incurring routes, which is what
// an external deployment must run with (review BE-01/BE-02).
export const AUTH_MODE = process.env.AUTH_MODE === 'protected' ? 'protected' : 'local'
export const SESSION_COOKIE = 'v2_session'

export function currentUser(req) {
  return getSession(req.cookies?.[SESSION_COOKIE])
}

// Gate for protected routes. No-op in local mode; 401 in protected mode without
// a valid session. Always attaches req.user when a session exists.
export function requireSession(req, res, next) {
  const user = currentUser(req)
  if (user) req.user = user
  if (AUTH_MODE === 'local') return next()
  if (!user) {
    return res.status(401).json({ ok: false, code: 'UNAUTHENTICATED', error: '로그인이 필요합니다.' })
  }
  return next()
}
