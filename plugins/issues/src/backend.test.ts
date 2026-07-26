import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import type { TestingOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import backendPlugin from './backend'
import type { IssuesBoard, IssuesConfig } from './lib/types'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Route each GitHub call by URL so tests do not depend on request ordering. */
function stubGitHub(routes: Record<string, unknown>) {
  const spy = vi.fn(async (url: string) => {
    const match = Object.keys(routes).find((fragment) => url.includes(fragment))
    if (!match) throw new Error(`unstubbed GitHub call: ${url}`)
    return jsonResponse(200, routes[match])
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const OPEN_ISSUES = [
  { number: 1, title: 'A bug', body: null, state: 'open', html_url: 'u/1', labels: [{ name: 'bug', color: 'ff0000' }] },
  { number: 2, title: 'A PR', body: null, state: 'open', html_url: 'u/2', labels: [], pull_request: { url: 'x' } },
]
const REPO_LABELS = [
  { name: 'bug', color: 'ff0000' },
  { name: 'stale', color: 'cccccc' },
]

async function setup(options: { token?: string | null } = {}): Promise<TestingOpenForgeRegistryFake> {
  const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.issues', projectId: 'P-1' })
  if (options.token !== null) {
    await registry.backendApi.config.set('github_token', options.token ?? 'ghp_test')
  }
  // A repo hint short-circuits remote detection, so tests never shell out to git.
  await registry.backendApi.projectConfig.set('custom_repo_hint', 'acme/repo', 'P-1')
  await registry.activateBackend(backendPlugin)
  return registry
}

const invoke = <T>(registry: TestingOpenForgeRegistryFake, method: string, payload?: unknown) =>
  registry.frontendApi.backend.invoke<T>(method, payload)

afterEach(() => vi.unstubAllGlobals())

describe('backend method registration', () => {
  it('registers every board method', async () => {
    const registry = await setup()

    expect(registry.snapshot.backendMethods.map((m) => m.id).sort()).toEqual([
      'issues_create_issue',
      'issues_edit_issue',
      'issues_get_board',
      'issues_get_config',
      'issues_refine_ticket',
      'issues_set_column_labels',
      'issues_set_value',
      'issues_update_label_color',
    ])
  })

  it('reaches GitHub directly rather than invoking a host command', async () => {
    const registry = await setup()
    stubGitHub({ '/issues?state=open': OPEN_ISSUES, '/labels?per_page': REPO_LABELS })

    await invoke<IssuesBoard>(registry, 'issues_get_board', { projectId: 'P-1' })

    expect(registry.calls.commandInvocations).toEqual([])
  })
})

describe('issues_get_board', () => {
  it('assembles GitHub issues and labels with locally stored values and columns', async () => {
    const registry = await setup()
    stubGitHub({ '/issues?state=open': OPEN_ISSUES, '/labels?per_page': REPO_LABELS })
    await invoke(registry, 'issues_set_value', { projectId: 'P-1', issueNumber: 1, value: 8 })

    const board = await invoke<IssuesBoard>(registry, 'issues_get_board', { projectId: 'P-1' })

    expect(board.repo).toEqual({ owner: 'acme', name: 'repo' })
    expect(board.issues.map((issue) => issue.number)).toEqual([1])
    expect(board.labels).toEqual(REPO_LABELS)
    expect(board.values).toEqual({ '1': 8 })
  })

  it('seeds the columns from labels in use on first open', async () => {
    const registry = await setup()
    stubGitHub({ '/issues?state=open': OPEN_ISSUES, '/labels?per_page': REPO_LABELS })

    const board = await invoke<IssuesBoard>(registry, 'issues_get_board', { projectId: 'P-1' })

    expect(board.columnLabels).toEqual(['bug'])
  })

  it('fails with an actionable message when no GitHub token is configured', async () => {
    const registry = await setup({ token: null })
    stubGitHub({ '/issues?state=open': OPEN_ISSUES, '/labels?per_page': REPO_LABELS })

    await expect(invoke(registry, 'issues_get_board', { projectId: 'P-1' })).rejects.toThrow(/GitHub token/)
  })
})

describe('issues_get_config', () => {
  it('reports which repo labels are in use alongside the curated columns', async () => {
    const registry = await setup()
    stubGitHub({ '/issues?state=open': OPEN_ISSUES, '/labels?per_page': REPO_LABELS })
    await invoke(registry, 'issues_set_column_labels', { projectId: 'P-1', labels: ['bug'] })

    const config = await invoke<IssuesConfig>(registry, 'issues_get_config', { projectId: 'P-1' })

    expect(config.columnLabels).toEqual(['bug'])
    expect(config.labels).toEqual([
      { name: 'bug', color: 'ff0000', used: true },
      { name: 'stale', color: 'cccccc', used: false },
    ])
  })
})

describe('issues_update_label_color', () => {
  it('normalizes the colour before sending it to GitHub', async () => {
    const registry = await setup()
    const spy = stubGitHub({ '/labels/': { name: 'bug', color: '0e8a16' } })

    await invoke(registry, 'issues_update_label_color', { projectId: 'P-1', name: 'bug', color: '#0E8A16' })

    const init = (spy.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(init.body as string)).toEqual({ color: '0e8a16' })
  })

  it('rejects a colour that is not six hex digits', async () => {
    const registry = await setup()
    stubGitHub({ '/labels/': {} })

    await expect(
      invoke(registry, 'issues_update_label_color', { projectId: 'P-1', name: 'bug', color: 'nothex' }),
    ).rejects.toThrow(/six-digit hex/)
  })
})

describe('issues_create_issue', () => {
  it('returns the created issue', async () => {
    const registry = await setup()
    stubGitHub({ '/issues': { number: 9, title: 'New', body: '', state: 'open', html_url: 'u/9', labels: [] } })

    const result = await invoke<{ issue: { number: number } }>(registry, 'issues_create_issue', {
      projectId: 'P-1',
      title: 'New',
      body: '',
      labels: [],
    })

    expect(result.issue.number).toBe(9)
  })
})
