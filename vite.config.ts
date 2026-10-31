import { defineConfig } from 'vite';

// Relative base so the build works from any path (GitHub Pages, itch.io, a plain folder).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
});
