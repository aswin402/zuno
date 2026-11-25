import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'),
) as { version?: string }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __ZUNO_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:47620',
        changeOrigin: true,
      },
      '/mcp': {
        target: 'http://127.0.0.1:47620',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:47620',
        changeOrigin: true,
      },
    },
  },
})
