import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/invoice-service/' : '/',
  build: {
    outDir: 'dist',
  },
}));
