import path from 'path'
import { existsSync } from 'fs'
import express from 'express'
import { repoRoot } from './paths.js'
import { logger } from './logger.js'

// Production: serve the built SPA from this same process so a single container
// serves both the API and the client (review A3). No-op in dev, where vite
// serves the client and proxies /api here. Mounted after all API/auth routers so
// the catch-all only handles unmatched, non-API GET routes.
export function mountSpa(app) {
  const clientDist = path.join(repoRoot, 'client', 'dist')
  if (!existsSync(path.join(clientDist, 'index.html'))) return
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/generated') || req.path.startsWith('/auth')) {
      return next()
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
  logger.info({ clientDist }, 'serving built SPA')
}
