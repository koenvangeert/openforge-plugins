import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// The SDK resolves through the node_modules `link:` to its built `dist/`
// (see docs/adr/0001), so no source aliases are needed here.
export default defineConfig({
  plugins: [svelte()],
  test: {
    // Every test here exercises plain logic or mocked components, so Node is
    // enough. A test that renders a real component would opt in with a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
