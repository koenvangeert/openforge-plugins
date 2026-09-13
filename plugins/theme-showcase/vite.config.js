import { defineConfig } from 'vite'
import { openforgePluginViteExternals } from '@openforge-app/plugin-sdk/vite'

// The renderer import map only resolves the host-shared runtimes (svelte,
// terminal). Everything else, including the SDK's frontend entry, must be
// bundled into dist/frontend.js. openforgePluginViteExternals keeps only the
// host-shared runtimes external.
export default defineConfig({
  build: {
    lib: {
      entry: 'frontend.js',
      formats: ['es'],
      fileName: () => 'frontend.js',
    },
    rollupOptions: { external: openforgePluginViteExternals },
    emptyOutDir: true,
    target: 'esnext',
  },
})
