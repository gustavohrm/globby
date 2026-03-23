import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: './apps/frontend',
  publicDir: './apps/frontend/_public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './apps/frontend/index.html',
      },
    },
  },
  plugins: [tailwindcss()],
});
