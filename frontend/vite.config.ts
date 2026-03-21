import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/contents/Beaver/',
  server: {
    port: 5178,
    proxy: {
      '/contents/Beaver/api': {
        target: 'http://localhost:8003',
        rewrite: (path) => path.replace('/contents/Beaver/api', ''),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
