import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11', 'chrome >= 61', 'safari >= 12', 'iOS >= 12'],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
  ],
  base: '/',
  build: {
    // Keep the bundle compatible with older mobile browsers that support ESM
    // but can still choke on newer syntax left in the default target.
    target: ['chrome61', 'edge79', 'firefox67', 'safari12'],
    cssTarget: ['chrome61', 'safari12'],
  },
})
