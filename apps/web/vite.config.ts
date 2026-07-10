import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SECURITY: the app is served exclusively by the local bridge (loopback,
// CSP-enforced). This config produces a fully self-contained bundle:
// no CDN, no remote fonts, no analytics, no service worker.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  server: {
    // The Vite dev server is never used to serve the app (see
    // scripts/start-local.mjs) — dev mode is `vite build --watch` behind the
    // hardened bridge. Bind loopback anyway, defense in depth.
    host: '127.0.0.1',
  },
});
