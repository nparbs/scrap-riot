import { defineConfig } from 'vite';
import { adminPlugin } from './scripts/admin-plugin';

// Relative base so the build works from any path (GitHub Pages, itch.io, a plain folder).
// The parts editor at /admin.html is for the dev server only, and the build leaves it out.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [adminPlugin()],
});
