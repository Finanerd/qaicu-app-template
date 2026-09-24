/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { qaicuDev } from './dev/qaicu-dev-plugin.js';

// The build produces ONE self-contained dist/index.html (all JS + CSS inlined,
// no external/CDN requests) so it can be served straight from a blob: URL inside
// the sandboxed Qaicu artifact iframe. Vite/esbuild transpiles TS without type
// checking, so a minor type slip never blocks the build — run `npm run check`
// before deploying.
//
// `qaicuDev` only applies to `vite dev`: it stands in for the Qaicu host by
// injecting the same `window.QDB` bridge the real frame provides and running its
// operations against a local mock (or a real Qaicu when QAICU_URL +
// QAICU_API_KEY are set). It contributes nothing to the build.
export default defineConfig(({ mode }) => {
  // '' as the prefix loads every var in .env, not just VITE_*. Nothing here is
  // exposed to the client bundle — the values are used by the dev server only.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: './',
    plugins: [
      react(),
      viteSingleFile(),
      qaicuDev({
        url: env.QAICU_URL,
        apiKey: env.QAICU_API_KEY,
        companyId: env.QAICU_COMPANY_ID,
        latencyMs: env.QAICU_DEV_LATENCY_MS,
        chrome: env.QAICU_DEV_CHROME,
      }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 100000,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test-setup.ts',
    },
  };
});
