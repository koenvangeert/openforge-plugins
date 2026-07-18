import { describe, it, expect, vi } from 'vitest'
import type { CommandInfo } from '@openforge-app/plugin-sdk'
import type { Snippet } from './injectableDomain'
import { METHOD } from './protocol'
import { loadInjectableCatalog, type CatalogApi } from './injectableCatalog'

function makeApi(catalog: CommandInfo[], snippets: Snippet[] = []) {
  const listCatalog = vi.fn(async () => catalog)
  const invoke = vi.fn(async (method: string) => {
    if (method === METHOD.listSnippets) return snippets
    throw new Error(`Unexpected method invoked: ${method}`)
  })
  const whenReady = vi.fn(async () => undefined)
  const api = { commands: { listCatalog }, backend: { whenReady, invoke } } as unknown as CatalogApi
  return { api, listCatalog, invoke, whenReady }
}

const skill = (name: string): CommandInfo => ({
  name, description: null, source: 'skill', agent: null, origin: 'project', triggerMode: 'auto+manual', sourceDir: '.claude', sourcePath: name, content: null,
})

const snippet = (over: Partial<Snippet> = {}): Snippet => ({
  id: 'snip-1', name: 'PR', body: '## Summary', allProjects: true, projectIds: [], ...over,
})

describe('loadInjectableCatalog', () => {
  it('merges the host catalog with backend snippets into injectables', async () => {
    const { api, listCatalog, invoke } = makeApi([skill('refactor')], [snippet()])

    const { injectables, snippets } = await loadInjectableCatalog(api, 'P-1')

    expect(listCatalog).toHaveBeenCalledWith({ projectId: 'P-1' })
    expect(invoke).toHaveBeenCalledWith(METHOD.listSnippets, null)
    expect(injectables.map((i) => i.kind).sort()).toEqual(['skill', 'snippet'])
    expect(injectables.find((i) => i.kind === 'snippet')?.name).toBe('PR')
    expect(snippets).toHaveLength(1)
  })

  it('still loads all-projects snippets when there is no active project (empty catalog)', async () => {
    const { api, listCatalog } = makeApi([], [snippet({ id: 'snip-2', name: 'everywhere', body: 'x' })])

    const { injectables } = await loadInjectableCatalog(api, null)

    expect(listCatalog).toHaveBeenCalledWith({ projectId: null })
    expect(injectables.map((i) => i.name)).toEqual(['everywhere'])
  })

  it('hides project-scoped snippets outside their target project', async () => {
    const { api } = makeApi([], [snippet({ id: 'snip-3', name: 'scoped', body: 'x', allProjects: false, projectIds: ['P-1'] })])

    expect((await loadInjectableCatalog(api, 'P-2')).injectables).toHaveLength(0)
    expect((await loadInjectableCatalog(api, 'P-1')).injectables.map((i) => i.name)).toEqual(['scoped'])
  })

  it('awaits backend.whenReady before invoking listSnippets', async () => {
    const calls: string[] = []
    const listCatalog = vi.fn(async () => [])
    const whenReady = vi.fn(async () => {
      calls.push('whenReady')
    })
    const invoke = vi.fn(async () => {
      calls.push('invoke')
      return []
    })
    const api = { commands: { listCatalog }, backend: { whenReady, invoke } } as unknown as CatalogApi

    await loadInjectableCatalog(api, null)

    expect(calls).toEqual(['whenReady', 'invoke'])
  })
})
