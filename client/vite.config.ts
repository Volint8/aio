import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/orgs': 'http://localhost:3000',
      '/tasks': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
