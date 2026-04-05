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
    cssTarget: ['chrome61', 'safari12'],
  },
})
