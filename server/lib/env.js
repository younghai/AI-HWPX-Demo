import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { AI_PROVIDERS } from './providers-config.js'

const __filename = fileURLToPath(import.meta.url)
const serverDir = path.resolve(path.dirname(__filename), '..')

export function parseEnvFile(text) {
  const map = new Map()
  if (!text) return map
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) map.set(key, value)
  }
  return map
}

export async function writeEnvFile(overrides = {}) {
  const envPath = path.join(serverDir, '.env')
  let existing = ''
  try {
    existing = await fs.readFile(envPath, 'utf-8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  const merged = parseEnvFile(existing)
  for (const [key, value] of Object.entries(overrides)) {
    merged.set(key, value ?? '')
  }
  const declaredKeys = new Set([
    ...Object.values(AI_PROVIDERS).map((p) => p.envKey),
    ...Object.values(AI_PROVIDERS).flatMap((p) => p.oauth ? [p.oauth.clientIdEnv, p.oauth.clientSecretEnv] : []),
    'OAUTH_REDIRECT_BASE'
  ])
  for (const key of declaredKeys) {
    if (!merged.has(key)) merged.set(key, process.env[key] || '')
  }
  const formatLine = (key) => `${key}=${merged.get(key) ?? ''}`
  const lines = [
    '# AI Provider API Keys',
    ...Object.values(AI_PROVIDERS).map((p) => formatLine(p.envKey)),
    '',
    '# OAuth Client Credentials',
    ...Object.values(AI_PROVIDERS).flatMap((p) =>
      p.oauth ? [formatLine(p.oauth.clientIdEnv), formatLine(p.oauth.clientSecretEnv)] : []
    ),
    formatLine('OAUTH_REDIRECT_BASE')
  ]
  const extras = [...merged.keys()].filter((k) => !declaredKeys.has(k))
  if (extras.length) {
    lines.push('', '# User-defined')
    extras.forEach((k) => lines.push(formatLine(k)))
  }
  lines.push('')
  await fs.writeFile(envPath, lines.join('\n'), 'utf-8')
}
