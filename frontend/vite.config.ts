import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
})
