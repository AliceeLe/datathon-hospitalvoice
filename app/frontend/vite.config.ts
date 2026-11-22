import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Builds into ../static so Flask serves it at "/" (index.html) and "/static/assets/*".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/static/',
  build: { outDir: '../static', emptyOutDir: false, assetsDir: 'assets' },
  server: { proxy: { '/api': 'http://127.0.0.1:8000', '/legacy': 'http://127.0.0.1:8000' } },
});
