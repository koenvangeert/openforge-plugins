import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import type { TestingOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import backendPlugin from './backend'
import type { IssueResult, SearchResult } from './lib/jiraTypes'
import { GLOBAL_KEY, METHOD } from './lib/protocol'
import type { JiraSettingsSnapshot, SaveSettingsResult } from './lib/settingsForm'

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  } as unknown as Response
}

function nonJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => { throw new SyntaxError('Unexpected end of JSON input') },
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
  it('registers settings, issue, search and connection methods', async () => {
    const registry = await setup(false)
    expect(registry.snapshot.backendMethods.map((m) => m.id).sort()).toEqual([
      'getIssue',
      'getSettings',
      'saveSettings',
      'search',
      'testConnection',
    ])
  })
})

describe('getSettings', () => {
  it('returns only redacted settings metadata', async () => {
    const registry = await setup(true)

    const result = await invoke<JiraSettingsSnapshot>(registry, METHOD.getSettings)

    expect(result).toEqual({
      site: 'https://acme.atlassian.net',
      email: 'me@acme.com',
      hasStoredToken: true,
    })
    expect(result).not.toHaveProperty('apiToken')
  })
})

describe('saveSettings', () => {
  it('keeps the stored token when the submitted token is blank', async () => {
    const registry = await setup(true)

    const result = await invoke<SaveSettingsResult>(registry, METHOD.saveSettings, {
      site: 'new-acme.atlassian.net',
      email: 'new@acme.com',
      apiToken: '   ',
    })

    expect(result).toEqual({
      ok: true,
      settings: {
        site: 'https://new-acme.atlassian.net',
        email: 'new@acme.com',
        hasStoredToken: true,
      },
    })
    expect(result).not.toHaveProperty('settings.apiToken')
    await expect(registry.storage.global.get(GLOBAL_KEY.credentials)).resolves.toEqual({
      site: 'https://new-acme.atlassian.net',
      email: 'new@acme.com',
      apiToken: 'tok',
    })
  })
})

describe('getIssue', () => {
  it('returns a typed invalid-key failure for a null RPC payload', async () => {
    const registry = await setup(true)

    const result = await invoke<IssueResult>(registry, METHOD.getIssue, null)

    expect(result).toMatchObject({ ok: false, error: 'invalid-key' })
  })

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
    expect(result).toMatchObject({ ok: false, error: 'invalid-key' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a malformed direct lookup key without a request', async () => {
    const registry = await setup(true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: 'not a key' })

    expect(result).toMatchObject({ ok: false, error: 'invalid-key' })
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

  it('returns an unknown failure instead of rejecting on a non-JSON success response', async () => {
    const registry = await setup(true)
    vi.stubGlobal('fetch', vi.fn(async () => nonJsonResponse(200)))

    const result = await invoke<IssueResult>(registry, METHOD.getIssue, { key: 'PROJ-1' })

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })
})

describe('search', () => {
  it('returns a typed invalid-jql failure for a null RPC payload', async () => {
    const registry = await setup(true)

    const result = await invoke<SearchResult>(registry, METHOD.search, null)

    expect(result).toMatchObject({ ok: false, error: 'invalid-jql' })
  })

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
    vi.stubGlobal('fetch', vi.fn(async () => response(200, { issues: [], isLast: true })))
    const result = await invoke<SearchResult>(registry, METHOD.search, { jql: 'project = EMPTY' })
    expect(result).toEqual({ ok: true, issues: [], page: { isLast: true, nextPageToken: null } })
  })

  it('forwards Jira pagination tokens and returns the next page token', async () => {
    const registry = await setup(true)
    const fetchSpy = vi.fn(async () => response(200, {
      issues: [],
      isLast: false,
      nextPageToken: 'next-token',
    }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await invoke<SearchResult>(registry, METHOD.search, {
      jql: 'project = KVG',
      nextPageToken: 'current-token',
    })

    const [, request] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(request.body as string)).toMatchObject({
      jql: 'project = KVG',
      nextPageToken: 'current-token',
    })
    expect(result).toMatchObject({
      ok: true,
      page: { isLast: false, nextPageToken: 'next-token' },
    })
  })
})
