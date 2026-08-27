import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineConfig } from 'vitest/config'

// The SDK resolves through the node_modules `link:` to its built `dist/`, so no
// source aliases are needed here, unlike the in-repo OpenForge plugins that alias
// `@openforge-app/plugin-sdk` to source.
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    // Default to Node so backend/GitHub-client tests run without a DOM. Test
    // files that render components opt in with a `// @vitest-environment jsdom`
    // docblock.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
