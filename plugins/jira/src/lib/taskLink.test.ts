// @vitest-environment jsdom
// jsdom is required: loadIssue sanitizes the description with DOMPurify, which
// needs a browser DOM.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import type { IssueResult } from './jiraTypes'
import { clearLink, loadIssue, readCachedIssue, readLinkedKey, saveLinkedKey, suggestIssueKey } from './taskLink'
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
    summary: null,
    agent: null,
    permission_mode: null,
    worktree_source: null,
    worktree_branch: null,
    handoff_notes_enabled: true,
    depends_on: [],
    project_id: 'P-1',
    created_at: 0,
    updated_at: 0,
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
    await api.storage.task(TASK_ID).set(TASK_KEY.cachedIssue, { key: 'PROJ-9' } as never)
    await clearLink(api, TASK_ID)
    expect(await readLinkedKey(api, TASK_ID)).toBeNull()
    expect(await readCachedIssue(api, TASK_ID)).toBeNull()
  })
})

describe('suggestIssueKey', () => {
  it('scans the task text for a non-authoritative hint', async () => {
    const api = makeApi({ task: makeTask({ initial_prompt: 'Fix the login bug tracked in PROJ-77' }) })
    expect(await suggestIssueKey(api, TASK_ID)).toBe('PROJ-77')
  })

  it('falls back to the summary when the prompt has no key', async () => {
    const api = makeApi({ task: makeTask({ initial_prompt: 'no key', summary: 'linked to ABC-3' }) })
    expect(await suggestIssueKey(api, TASK_ID)).toBe('ABC-3')
  })

  it('returns null when the task cannot be read', async () => {
    const api = makeApi({ task: new Error('not found') })
    expect(await suggestIssueKey(api, TASK_ID)).toBeNull()
  })

  it('returns null when no key is present', async () => {
    const api = makeApi({ task: makeTask({ initial_prompt: 'nothing to see', summary: 'still nothing' }) })
    expect(await suggestIssueKey(api, TASK_ID)).toBeNull()
  })
})

describe('loadIssue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sanitizes the description HTML and caches the sanitized issue', async () => {
    const dirty: IssueResult = {
      ok: true,
      issue: {
        key: 'PROJ-1',
        summary: 'S',
        status: 'Open',
        issueType: 'Task',
        assignee: null,
        updated: null,
        descriptionHtml: '<p>safe</p><script>alert(1)</script><img src=x onerror="alert(2)">',
        url: 'https://acme.atlassian.net/browse/PROJ-1',
      },
    }
    const api = makeApi({ invoke: async () => dirty })

    const result = await loadIssue(api, TASK_ID, 'PROJ-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.issue.descriptionHtml).toContain('<p>safe</p>')
      expect(result.issue.descriptionHtml).not.toContain('<script>')
      expect(result.issue.descriptionHtml).not.toContain('onerror')
    }
    const cached = await readCachedIssue(api, TASK_ID)
    expect(cached?.descriptionHtml).not.toContain('<script>')
  })

  it('passes a backend not-found error through unchanged', async () => {
    const api = makeApi({ invoke: async () => ({ ok: false, error: 'not-found', message: 'gone' }) })
    expect(await loadIssue(api, TASK_ID, 'NOPE-1')).toEqual({ ok: false, error: 'not-found', message: 'gone' })
  })

  it('passes a backend network error through unchanged', async () => {
    const api = makeApi({ invoke: async () => ({ ok: false, error: 'network', message: 'offline' }) })
    expect(await loadIssue(api, TASK_ID, 'PROJ-1')).toEqual({ ok: false, error: 'network', message: 'offline' })
  })
})
