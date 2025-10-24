import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    target: 'esnext'
  },
  server: {
    port: 5000,
    strictPort: true,
    host: true
  },
  define: {
    // FIXED: Define all microservice URLs as environment variables
    'import.meta.env.VITE_AUTH_API_URL': JSON.stringify(process.env.VITE_AUTH_API_URL || 'http://localhost:4001'),
    'import.meta.env.VITE_SYNC_API_URL': JSON.stringify(process.env.VITE_SYNC_API_URL || 'http://localhost:4002'),
    'import.meta.env.VITE_PORTFOLIO_API_URL': JSON.stringify(process.env.VITE_PORTFOLIO_API_URL || 'http://localhost:4003'),
    'import.meta.env.VITE_MARKET_API_URL': JSON.stringify(process.env.VITE_MARKET_API_URL || 'http://localhost:4004'),
    // Legacy support
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:4003'),
    'import.meta.env.VITE_TWELVE_DATA_API_KEY': JSON.stringify(process.env.VITE_TWELVE_DATA_API_KEY || '00957c0f4d4444cc9c994f568a323fa7')
  }
});