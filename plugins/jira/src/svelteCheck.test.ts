import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))

describe('Svelte component type checking', () => {
  it('rejects an invalid PluginViewProps context field', () => {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'svelte-check',
        '--tsconfig',
        './test-fixtures/invalid-plugin-view-context/tsconfig.json',
        '--output',
        'machine',
      ],
      { cwd: packageDirectory, encoding: 'utf8' },
    )
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status).toBe(1)
    expect(output).toContain(
      "Property 'invalidContextField' does not exist on type 'OpenForgeContextSnapshot'",
    )
  })
})
