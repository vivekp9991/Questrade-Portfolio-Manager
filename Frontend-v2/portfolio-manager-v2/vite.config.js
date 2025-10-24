import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5500,
    proxy: {
      '/api-auth': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-auth/, '/api'),
      },
      '/api-sync': {
        target: 'http://localhost:4002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-sync/, '/api'),
      },
      '/api-market': {
        target: 'http://localhost:4004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-market/, '/api'),
      },
      '/api/persons': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:4003',
        changeOrigin: true,
      }
    }
  }
})
