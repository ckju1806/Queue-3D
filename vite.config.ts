import { defineConfig } from 'vitest/config';

// Relative Basis, damit der Produktionsbuild auch aus einem Unterordner
// oder per `npm run preview` ohne Anpassung funktioniert.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
