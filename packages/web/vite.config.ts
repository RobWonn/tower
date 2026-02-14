import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getDevPort } from '@agent-tower/shared/dev-port'

const monorepoRoot = path.resolve(__dirname, '../..')
const backendPort = getDevPort(monorepoRoot)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
