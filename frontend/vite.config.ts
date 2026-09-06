import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const buildTime = mode === 'test' ? '2026-08-07T00:00:00.000Z' : new Date().toISOString()
  // R-0141: VITE_APP_ID（.envまたはビルド引数）でAppIDを切り替え可能にする（未指定なら本番の'Beaver'のまま）
  const appId = loadEnv(mode, process.cwd(), 'VITE_').VITE_APP_ID || 'Beaver'
  const basePath = `/contents/${appId}/`

  return {
    plugins: [react(), tailwindcss()],
    base: basePath,
    define: {
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    server: {
      port: 5178,
      proxy: {
        [`${basePath}api`]: {
          target: 'http://localhost:8003',
          rewrite: (path) => path.replace(`${basePath}api`, ''),
        },
      },
    },
    test: {
      environment: 'happy-dom',
      globals: true,
    },
  }
})
