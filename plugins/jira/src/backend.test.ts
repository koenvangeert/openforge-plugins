import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import type { TestingOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import backendPlugin from './backend'
import type { IssueResult, SearchResult } from './lib/jiraTypes'
import { GLOBAL_KEY, METHOD } from './lib/protocol'

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  } as unknown as Response
}

async function setup(withCreds: boolean): Promise<TestingOpenForgeRegistryFake> {
  const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
  if (withCreds) {
    await registry.storage.global.set(GLOBAL_KEY.credentials, {
      site: 'https://acme.atlassian.net',
      email: 'me@acme.com',
      apiToken: 'tok',
    } as never)
  }
  await registry.activateBackend(backendPlugin)
  return registry
}

const invoke = <T>(registry: TestingOpenForgeRegistryFake, method: string, payload?: unknown) =>
  registry.frontendApi.backend.invoke<T>(method, payload)

afterEach(() => vi.unstubAllGlobals())

describe('backend method registration', () => {
  it('registers getIssue, search and testConnection', async () => {
    const registry = await setup(false)
    expect(registry.snapshot.backendMethods.map((m) => m.id).sort()).toEqual(['getIssue', 'search', 'testConnection'])
  })
})

describe('getIssue', () => {
  it('returns no-credentials when the plugin is unconfigured', async () => {
    const registry = await setup(false)
    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: 'PROJ-1' })
    expect(result).toMatchObject({ ok: false, error: 'no-credentials' })
  })

  it('rejects an empty key without a request', async () => {
    const registry = await setup(true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: '  ' })
    expect(result).toMatchObject({ ok: false, error: 'not-found' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns invalid-credentials on 401', async () => {
    const registry = await setup(true)
    vi.stubGlobal('fetch', vi.fn(async () => response(401, {})))
    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: 'PROJ-1' })
    expect(result).toMatchObject({ ok: false, error: 'invalid-credentials' })
  })

  it('returns not-found on 404', async () => {
    const registry = await setup(true)
    vi.stubGlobal('fetch', vi.fn(async () => response(404, {})))
    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: 'NOPE-9' })
    expect(result).toMatchObject({ ok: false, error: 'not-found' })
  })

  it('returns network when the request throws', async () => {
    const registry = await setup(true)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: 'PROJ-1' })
    expect(result).toMatchObject({ ok: false, error: 'network' })
  })

  it('returns a normalized issue on success', async () => {
    const registry = await setup(true)
    vi.stubGlobal('fetch', vi.fn(async () => response(200, {
      key: 'PROJ-1',
      fields: { summary: 'S', status: { name: 'Open' }, issuetype: { name: 'Task' }, assignee: null, updated: null },
      renderedFields: { description: '<p>hi</p>' },
    })))
    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: 'PROJ-1' })
    expect(result).toMatchObject({ ok: true, issue: { key: 'PROJ-1', descriptionHtml: '<p>hi</p>' } })
  })
})

describe('search', () => {
  it('returns no-credentials when unconfigured', async () => {
    const registry = await setup(false)
    const result = await invoke<SearchResult>(registry, METHOD.search, { jql: 'project = X' })
    expect(result).toMatchObject({ ok: false, error: 'no-credentials' })
  })

  it('rejects an empty JQL without a request', async () => {
    const registry = await setup(true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await invoke<SearchResult>(registry, METHOD.search, { jql: '   ' })
    expect(result).toMatchObject({ ok: false, error: 'invalid-jql' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns invalid-jql on 400', async () => {
    const registry = await setup(true)
    vi.stubGlobal('fetch', vi.fn(async () => response(400, { errorMessages: ['bad jql'] })))
    const result = await invoke<SearchResult>(registry, METHOD.search, { jql: 'nonsense' })
    expect(result).toEqual({ ok: false, error: 'invalid-jql', message: 'bad jql' })
  })

  it('returns empty rows for no matches', async () => {
    const registry = await setup(true)
    vi.stubGlobal('fetch', vi.fn(async () => response(200, { issues: [] })))
    const result = await invoke<SearchResult>(registry, METHOD.search, { jql: 'project = EMPTY' })
    expect(result).toEqual({ ok: true, rows: [] })
  })
})
