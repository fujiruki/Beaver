import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const buildTime = mode === 'test' ? '2026-08-07T00:00:00.000Z' : new Date().toISOString()

  return {
    plugins: [react(), tailwindcss()],
    base: '/contents/Beaver/',
    define: {
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
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
  }
})
