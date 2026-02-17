import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // If backend routes don't start with /api, proxy directly:
      '/auth': 'http://localhost:3000',
      '/orgs': 'http://localhost:3000',
      '/tasks': 'http://localhost:3000',
    },
  },
});
