import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React dev server runs on 5173 and proxies API and OAuth
// traffic to Express on 3001, so the browser sees a single origin and the
// session cookie behaves exactly as it does in the deployed single-service build.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
      '/auth': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
});
