import { svelte } from '@sveltejs/vite-plugin-svelte'
import { openforgePluginViteExternals } from '@openforge-app/plugin-sdk/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: {
      entry: 'src/frontend.ts',
      formats: ['es'],
      fileName: () => 'frontend.js',
      cssFileName: 'openforge-claude-usage',
    },
    rollupOptions: { external: openforgePluginViteExternals },
  },
})
