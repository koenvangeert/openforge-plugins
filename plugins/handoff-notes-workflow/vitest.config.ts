import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineConfig } from 'vitest/config'

// The SDK resolves through the node_modules `link:` to its built `dist/`
// (see docs/adr/0001), so no source aliases are needed here.
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    // Default to Node: most tests here exercise plain logic or mocked
    // components. Test files that render a real component opt in with a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
