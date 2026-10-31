// Bundles the game server and its dependencies into one file for the Docker image.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // ws and pg load these optional native speedups only if present.
  external: ['bufferutil', 'utf-8-validate', 'pg-native'],
  // ws is CommonJS and calls require(), which ES modules do not have by default.
  banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
});
