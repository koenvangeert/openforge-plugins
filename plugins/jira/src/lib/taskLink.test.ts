// @vitest-environment jsdom
// jsdom is required: loadIssue sanitizes the description with DOMPurify, which
// needs a browser DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonValue } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import type { IssueResult, JiraIssue } from './jiraTypes'
import {
  clearLink,
  ISSUE_SNAPSHOT_FRESH_FOR_MS,
  loadIssue,
  readIssueSnapshot,
  readLinkedKey,
  saveLinkedKey,
  suggestIssueKey,
} from './taskLink'
import { TASK_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage' | 'backend' | 'tasks'>

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'KVG-1444',
    initial_prompt: '',
    status: 'doing',
    prompt: null,
    title: null,
    title_source: null,
    title_generated_at: null,
    agent: null,
    permission_mode: null,
    worktree_source: null,
    worktree_branch: null,
    source_ticket_url: null,
    depends_on: [],
    project_id: 'P-1',
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

function makeIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    key: 'PROJ-1',
    summary: 'S',
    status: 'Open',
    priority: null,
    issueType: 'Task',
    assignee: null,
    updated: null,
    descriptionHtml: '',
    url: 'https://acme.atlassian.net/browse/PROJ-1',
    ...overrides,
  }
}

function makeApi(options: { invoke?: (method: string, payload?: unknown) => Promise<unknown>; task?: Task | Error } = {}): Api {
  const storage = createMemoryPluginStorage()
  return {
    storage,
    backend: {
      state: 'ready',
      whenReady: async () => undefined,
      onReady: () => ({ dispose: () => undefined }),
      invoke: (async (method: string, payload?: unknown) => options.invoke?.(method, payload)) as FrontendOpenForgeAPI['backend']['invoke'],
    },
    tasks: {
      get: async () => {
        if (options.task instanceof Error) throw options.task
        if (!options.task) throw new Error('no task configured')
        return options.task
      },
    } as unknown as FrontendOpenForgeAPI['tasks'],
  }
}

const TASK_ID = 'KVG-1444'

describe('link storage', () => {
  it('reports the unlinked state', async () => {
    const api = makeApi()
    expect(await readLinkedKey(api, TASK_ID)).toBeNull()
  })

  it('saves and reads back an explicit link', async () => {
    const api = makeApi()
    await saveLinkedKey(api, TASK_ID, 'PROJ-9')
    expect(await readLinkedKey(api, TASK_ID)).toBe('PROJ-9')
  })

  it('clears the link and the cached issue', async () => {
    const api = makeApi()
    await saveLinkedKey(api, TASK_ID, 'PROJ-9')
    await api.storage.task(TASK_ID).set(TASK_KEY.snapshot, { key: 'PROJ-9' } as never)
    await clearLink(api, TASK_ID)
    expect(await readLinkedKey(api, TASK_ID)).toBeNull()
    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-9')).resolves.toEqual({ snapshot: null, needsJiraRead: true })
  })

  it('reads the legacy direct-Issue cache until the next refresh migrates it', async () => {
    const api = makeApi()
    await api.storage.task(TASK_ID).set(
      TASK_KEY.snapshot,
      makeIssue({ key: 'PROJ-9', summary: 'Legacy cache', url: 'https://acme.atlassian.net/browse/PROJ-9' }) as never,
    )

    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-9')).resolves.toMatchObject({
      snapshot: { issue: { key: 'PROJ-9' }, refreshedAt: null },
      needsJiraRead: true,
    })
  })
})

describe('suggestIssueKey', () => {
  it('scans the task text for a non-authoritative hint', async () => {
    const api = makeApi({ task: makeTask({ initial_prompt: 'Fix the login bug tracked in PROJ-77' }) })
    expect(await suggestIssueKey(api, TASK_ID)).toBe('PROJ-77')
  })

  it('falls back to the title when the prompt has no key', async () => {
    const api = makeApi({ task: makeTask({ initial_prompt: 'no key', title: 'linked to ABC-3' }) })
    expect(await suggestIssueKey(api, TASK_ID)).toBe('ABC-3')
  })

  it('returns null when the task cannot be read', async () => {
    const api = makeApi({ task: new Error('not found') })
    expect(await suggestIssueKey(api, TASK_ID)).toBeNull()
  })

  it('returns null when no key is present', async () => {
    const api = makeApi({ task: makeTask({ initial_prompt: 'nothing to see', title: 'still nothing' }) })
    expect(await suggestIssueKey(api, TASK_ID)).toBeNull()
  })
})

describe('loadIssue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sanitizes the description HTML and caches the sanitized issue', async () => {
    const dirty: IssueResult = {
      ok: true,
      issue: makeIssue({ descriptionHtml: '<p>safe</p><script>alert(1)</script><img src=x onerror="alert(2)">' }),
    }
    const api = makeApi({ invoke: async () => dirty })

    const result = await loadIssue(api, TASK_ID, 'PROJ-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.issue.descriptionHtml).toContain('<p>safe</p>')
      expect(result.issue.descriptionHtml).not.toContain('<script>')
      expect(result.issue.descriptionHtml).not.toContain('onerror')
    }
    const { snapshot } = await readIssueSnapshot(api, TASK_ID, 'PROJ-1')
    expect(snapshot?.issue.descriptionHtml).not.toContain('<script>')
    expect(snapshot?.refreshedAt).toEqual(expect.any(String))
  })

  it('passes a backend not-found error through unchanged', async () => {
    const api = makeApi({ invoke: async () => ({ ok: false, error: 'not-found', message: 'gone' }) })
    expect(await loadIssue(api, TASK_ID, 'NOPE-1')).toEqual({ ok: false, error: 'not-found', message: 'gone' })
  })

  it('passes a backend network error through unchanged', async () => {
    const api = makeApi({ invoke: async () => ({ ok: false, error: 'network', message: 'offline' }) })
    expect(await loadIssue(api, TASK_ID, 'PROJ-1')).toEqual({ ok: false, error: 'network', message: 'offline' })
  })

  it('reads Jira even when a fresh snapshot is stored', async () => {
    const invoke = vi.fn(async () => ({ ok: true, issue: makeIssue({ summary: 'From Jira' }) }))
    const api = makeApi({ invoke })
    await api.storage.task(TASK_ID).set(
      TASK_KEY.snapshot,
      { issue: makeIssue({ summary: 'From the snapshot' }), refreshedAt: new Date().toISOString() } as unknown as JsonValue,
    )

    await expect(loadIssue(api, TASK_ID, 'PROJ-1')).resolves.toMatchObject({ ok: true, issue: { summary: 'From Jira' } })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('stamps the snapshot it stores, so the next read needs no Jira call', async () => {
    const api = makeApi({ invoke: async () => ({ ok: true, issue: makeIssue() }) })

    await loadIssue(api, TASK_ID, 'PROJ-1')

    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-1')).resolves.toMatchObject({ needsJiraRead: false })
  })
})

describe('readIssueSnapshot', () => {
  const NOW = Date.parse('2024-05-01T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function seedSnapshot(api: Api, issue: JiraIssue, refreshedAt: string | null): Promise<void> {
    await api.storage.task(TASK_ID).set(TASK_KEY.snapshot, { issue, refreshedAt } as unknown as JsonValue)
  }

  it('serves a snapshot inside the freshness window and asks for no Jira read', async () => {
    const api = makeApi()
    const refreshedAt = new Date(NOW - 60_000).toISOString()
    await seedSnapshot(api, makeIssue({ summary: 'From the snapshot' }), refreshedAt)

    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-1')).resolves.toEqual({
      snapshot: { issue: makeIssue({ summary: 'From the snapshot' }), refreshedAt },
      needsJiraRead: false,
    })
  })

  it('withholds a snapshot left behind by a previously linked Issue', async () => {
    const api = makeApi()
    await seedSnapshot(api, makeIssue({ key: 'PROJ-9', summary: 'The old link' }), new Date(NOW - 60_000).toISOString())

    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-1')).resolves.toEqual({ snapshot: null, needsJiraRead: true })
  })

  it('does not trust a snapshot stamped in the future', async () => {
    const api = makeApi()
    await seedSnapshot(api, makeIssue({ summary: 'Stamped by a skewed clock' }), new Date(NOW + 3_600_000).toISOString())

    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-1')).resolves.toMatchObject({
      snapshot: { issue: { summary: 'Stamped by a skewed clock' } },
      needsJiraRead: true,
    })
  })

  it('asks for a Jira read once the snapshot leaves the freshness window', async () => {
    const api = makeApi()
    await seedSnapshot(api, makeIssue(), new Date(NOW - ISSUE_SNAPSHOT_FRESH_FOR_MS).toISOString())

    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-1')).resolves.toMatchObject({ needsJiraRead: true })
  })

  it('asks for a Jira read when the snapshot has no timestamp, as legacy caches do', async () => {
    const api = makeApi()
    await seedSnapshot(api, makeIssue(), null)

    await expect(readIssueSnapshot(api, TASK_ID, 'PROJ-1')).resolves.toMatchObject({ needsJiraRead: true })
  })

  // Literal ages, so the window is pinned to five minutes and not merely to
  // whatever ISSUE_SNAPSHOT_FRESH_FOR_MS happens to say.
  it('serves a four-minute-old snapshot and re-reads a six-minute-old one', async () => {
    const fresh = makeApi()
    await seedSnapshot(fresh, makeIssue(), new Date(NOW - 240_000).toISOString())
    await expect(readIssueSnapshot(fresh, TASK_ID, 'PROJ-1')).resolves.toMatchObject({ needsJiraRead: false })

    const stale = makeApi()
    await seedSnapshot(stale, makeIssue(), new Date(NOW - 360_000).toISOString())
    await expect(readIssueSnapshot(stale, TASK_ID, 'PROJ-1')).resolves.toMatchObject({ needsJiraRead: true })
  })
})
