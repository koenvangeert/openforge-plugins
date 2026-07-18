import { describe, it, expect, vi } from 'vitest'
import type { CommandInfo } from '@openforge-app/plugin-sdk'
import type { Snippet } from './injectableDomain'
import { METHOD } from './protocol'
import type { CatalogApi } from './injectableCatalog'
import { useInjectableCatalog } from './useInjectableCatalog.svelte'

const skill = (name: string): CommandInfo => ({
  name,
  description: null,
  source: 'skill',
  agent: null,
  origin: 'project',
  triggerMode: 'auto+manual',
  sourceDir: '.claude',
  sourcePath: name,
  content: null,
})

function makeApi(catalog: CommandInfo[] = [], snippets: Snippet[] = []) {
  const listCatalog = vi.fn(async () => catalog)
  const invoke = vi.fn(async (method: string) => {
    if (method === METHOD.listSnippets) return snippets
    throw new Error(`Unexpected method invoked: ${method}`)
  })
  const api = { commands: { listCatalog }, backend: { invoke } } as unknown as CatalogApi
  return { api, listCatalog, invoke }
}

describe('useInjectableCatalog', () => {
  it('reads the api getter fresh on every reload instead of capturing the initial value', async () => {
    const { api: apiA, listCatalog: listCatalogA } = makeApi([skill('refactor')])
    const { api: apiB, listCatalog: listCatalogB } = makeApi([skill('review')])

    let current: CatalogApi = apiA
    const catalog = useInjectableCatalog(() => current, () => 'P-1')

    await catalog.reload()
    expect(listCatalogA).toHaveBeenCalledTimes(1)
    expect(listCatalogB).not.toHaveBeenCalled()
    expect(catalog.injectables.map((i) => i.name)).toEqual(['refactor'])
    expect(catalog.loading).toBe(false)
    expect(catalog.error).toBeNull()

    current = apiB
    await catalog.reload()

    // If `api` were still captured by value, this call would hit apiA again
    // and apiB.commands.listCatalog would never be invoked.
    expect(listCatalogB).toHaveBeenCalledTimes(1)
    expect(listCatalogA).toHaveBeenCalledTimes(1)
    expect(catalog.injectables.map((i) => i.name)).toEqual(['review'])
    expect(catalog.loading).toBe(false)
    expect(catalog.error).toBeNull()
  })

  it('maps snippets from the loaded catalog into state', async () => {
    const snippet: Snippet = { id: 'snip-1', name: 'PR', body: '## Summary', allProjects: true, projectIds: [] }
    const { api } = makeApi([], [snippet])

    const catalog = useInjectableCatalog(() => api, () => null)
    await catalog.reload()

    expect(catalog.snippets).toEqual([snippet])
    expect(catalog.injectables.find((i) => i.kind === 'snippet')?.name).toBe('PR')
  })
})
