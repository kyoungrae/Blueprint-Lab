import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/erd/' : '/',
  server: {
    proxy: {
      // 로컬 개발 시 API/이미지 요청을 백엔드로 전달
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/erd-api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
}))
