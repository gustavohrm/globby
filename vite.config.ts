import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: './apps/frontend',
  publicDir: './_public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './apps/frontend/index.html',
        settings: './apps/frontend/settings/index.html',
      },
    },
  },
  plugins: [tailwindcss()],
});
