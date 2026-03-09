import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: './src/frontend',
  publicDir: './src/frontend/_public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './src/frontend/index.html',
      },
    },
  },
  plugins: [tailwindcss()],
});
