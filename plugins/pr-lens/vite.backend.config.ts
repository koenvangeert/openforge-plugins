import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    ssr: 'src/backend.ts',
    outDir: 'dist',
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'backend.js', format: 'es' } },
  },
  // The host loads dist/backend.js without resolving this package's node_modules,
  // so every runtime dependency has to be inside the bundle.
  ssr: { noExternal: ['@openforge-app/plugin-sdk', '@coldtea/pr-lens-schema', 'zod'] },
})
