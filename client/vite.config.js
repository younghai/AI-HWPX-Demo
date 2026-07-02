import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SERVER_PORT = process.env.VITE_SERVER_PORT || '8792'
const proxyTarget = `http://127.0.0.1:${SERVER_PORT}`

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@rhwp/core']
  },
  server: {
    host: '127.0.0.1',
    port: 5192,
    proxy: {
      '/api': proxyTarget,
      '/generated': proxyTarget,
      '/auth': proxyTarget
    },
    fs: {
      allow: ['..']
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js']
  }
})

