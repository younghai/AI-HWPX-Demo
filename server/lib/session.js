import crypto from 'crypto'

const sessions = new Map()
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [sid, data] of sessions) {
    if (now - data.createdAt > SESSION_TTL_MS) {
      sessions.delete(sid)
    }
  }
}, 60 * 1000).unref()

export function createSession(user) {
  const sid = crypto.randomBytes(32).toString('hex')
  sessions.set(sid, { user, createdAt: Date.now() })
  return sid
}

export function getSession(sid) {
  if (!sid || !sessions.has(sid)) return null
  const data = sessions.get(sid)
  if (Date.now() - data.createdAt > SESSION_TTL_MS) {
    sessions.delete(sid)
    return null
  }
  return data.user
}

export function destroySession(sid) {
  if (sid) sessions.delete(sid)
}
