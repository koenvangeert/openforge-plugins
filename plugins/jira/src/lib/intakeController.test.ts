// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import type { IssueResult, SearchResult } from './jiraTypes'
import {
  lookupIntakeIssue,
  deriveIssueLinkStates,
  searchActiveIntakeFilter,
  searchIntakeIssues,
} from './intakeController'
import { activateIntakeFilter, saveIntakeFilter } from './intakeFilters'
import { METHOD, TASK_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'backend' | 'storage' | 'tasks'>

function makeTask(id: string): Task {
  return {
    id,
    initial_prompt: '',
    status: 'backlog',
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
  }
}

function makeApi(
  invoke: (method: string, payload?: unknown) => Promise<unknown>,
  tasks: Task[] = [],
): {
  api: Api
  invokeSpy: ReturnType<typeof vi.fn>
  listSpy: ReturnType<typeof vi.fn>
} {
  const invokeSpy = vi.fn(invoke)
  const listSpy = vi.fn(async () => tasks)
  return {
    api: {
      storage: createMemoryPluginStorage(),
      backend: {
        state: 'ready',
        whenReady: async () => undefined,
        onReady: () => ({ dispose: () => undefined }),
        invoke: invokeSpy as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: { list: listSpy } as unknown as FrontendOpenForgeAPI['tasks'],
    },
    invokeSpy,
    listSpy,
  }
}

describe('lookupIntakeIssue', () => {
  it('normalizes a direct Issue Key and sanitizes the detail description', async () => {
    const backendResult: IssueResult = {
      ok: true,
      issue: {
        key: 'PROJ-1',
        summary: 'Issue',
        status: 'Open',
        priority: 'High',
        assignee: null,
        issueType: 'Bug',
        updated: null,
        descriptionHtml: '<p>Safe</p><script>bad()</script>',
        url: 'https://acme.atlassian.net/browse/PROJ-1',
      },
    }
    const { api, invokeSpy } = makeApi(async () => backendResult)

    const result = await lookupIntakeIssue(api, ' proj-1 ')

    expect(invokeSpy).toHaveBeenCalledWith(METHOD.getIssue, { key: 'PROJ-1' })
    expect(result).toMatchObject({ ok: true, issue: { descriptionHtml: '<p>Safe</p>' } })
  })

  it('reports backend transport failures as a typed lookup result', async () => {
    const { api } = makeApi(async () => {
      throw new Error('Backend method not found for dev.kvg.jira.getIssue')
    })

    await expect(lookupIntakeIssue(api, 'PROJ-1')).resolves.toEqual({
      ok: false,
      error: 'unknown',
      message: 'Backend method not found for dev.kvg.jira.getIssue',
    })
  })
})

describe('deriveIssueLinkStates', () => {
  it('counts task-scoped Issue Links from the active Project without storing a sync model', async () => {
    const tasks = [makeTask('T-1'), makeTask('T-2'), makeTask('T-3'), makeTask('T-4')]
    const { api, listSpy } = makeApi(async () => undefined, tasks)
    await api.storage.task('T-1').set(TASK_KEY.link, { key: 'PROJ-1' })
    await api.storage.task('T-2').set(TASK_KEY.link, { key: 'PROJ-1' })
    await api.storage.task('T-3').set(TASK_KEY.link, { key: 'PROJ-2' })

    const result = await deriveIssueLinkStates(api, 'P-1', ['PROJ-1', 'PROJ-2', 'PROJ-3'])

    expect(listSpy).toHaveBeenCalledWith({ projectId: 'P-1' })
    expect(result).toEqual({
      'PROJ-1': { issueKey: 'PROJ-1', linkedTaskCount: 2, taskIds: ['T-1', 'T-2'] },
      'PROJ-2': { issueKey: 'PROJ-2', linkedTaskCount: 1, taskIds: ['T-3'] },
      'PROJ-3': { issueKey: 'PROJ-3', linkedTaskCount: 0, taskIds: [] },
    })
    await expect(api.storage.project('P-1').get('issueLinkStates')).resolves.toBeNull()
  })
})

describe('searchIntakeIssues', () => {
  it('supports raw JQL continuation requests and sanitizes every returned issue', async () => {
    const backendResult: SearchResult = {
      ok: true,
      issues: [{
        key: 'PROJ-2',
        summary: 'Issue',
        status: 'Triage',
        priority: null,
        assignee: 'Ada',
        issueType: 'Task',
        updated: null,
        descriptionHtml: '<p>Details</p><img src=x onerror="bad()">',
        url: 'https://acme.atlassian.net/browse/PROJ-2',
      }],
      page: { isLast: false, nextPageToken: 'page-3' },
    }
    const { api, invokeSpy } = makeApi(async () => backendResult)

    const result = await searchIntakeIssues(api, {
      jql: '  project = PROJ ORDER BY priority DESC  ',
      nextPageToken: 'page-2',
    })

    expect(invokeSpy).toHaveBeenCalledWith(METHOD.search, {
      jql: 'project = PROJ ORDER BY priority DESC',
      nextPageToken: 'page-2',
    })
    expect(result).toMatchObject({
      ok: true,
      issues: [{ descriptionHtml: '<p>Details</p><img src="x">' }],
      page: { isLast: false, nextPageToken: 'page-3' },
    })
  })

  it('queries the active named filter owned by the selected Project', async () => {
    const backendResult: SearchResult = {
      ok: true,
      issues: [],
      page: { isLast: true, nextPageToken: null },
    }
    const { api, invokeSpy } = makeApi(async () => backendResult)
    await saveIntakeFilter(api, 'P-1', { id: 'triage', name: 'Triage', jql: 'project = KVG' })
    await activateIntakeFilter(api, 'P-1', 'triage')

    await expect(searchActiveIntakeFilter(api, 'P-1')).resolves.toEqual(backendResult)
    expect(invokeSpy).toHaveBeenCalledWith(METHOD.search, { jql: 'project = KVG', nextPageToken: null })
  })

  it('propagates typed Jira errors without replacing their details', async () => {
    const failure: SearchResult = { ok: false, error: 'network', message: 'Jira is offline.' }
    const { api } = makeApi(async () => failure)

    await expect(searchIntakeIssues(api, { jql: 'project = KVG' })).resolves.toEqual(failure)
  })

  it('reports an incompatible successful backend response instead of throwing', async () => {
    const { api } = makeApi(async () => ({ ok: true, rows: [] }))

    await expect(searchIntakeIssues(api, { jql: 'project = KVG' })).resolves.toEqual({
      ok: false,
      error: 'unknown',
      message: 'The Jira backend returned an incompatible response. Reload the Jira plugin.',
    })
  })

  it('reports backend transport failures instead of leaving an unhandled rejection', async () => {
    const { api } = makeApi(async () => {
      throw new Error('Backend method not found for dev.kvg.jira.search')
    })

    await expect(searchIntakeIssues(api, { jql: 'project = KVG' })).resolves.toEqual({
      ok: false,
      error: 'unknown',
      message: 'Backend method not found for dev.kvg.jira.search',
    })
  })
})
