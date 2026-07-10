import crypto from 'crypto'
import { createTtlStore } from './ttlStore.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const sessions = createTtlStore(SESSION_TTL_MS)

export function createSession(user) {
  const sid = crypto.randomBytes(32).toString('hex')
  sessions.set(sid, user)
  return sid
}

export function getSession(sid) {
  return sid ? sessions.get(sid) : null
}

export function destroySession(sid) {
  if (sid) sessions.delete(sid)
}
