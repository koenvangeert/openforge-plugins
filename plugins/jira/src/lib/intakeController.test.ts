// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import type { SearchResult } from './jiraTypes'
import {
  createAndStartIntakeTask,
  createIntakeTask,
  deriveIssueLinkStates,
  issueLinkState,
  searchIntakeIssues,
  upsertLinkedTask,
} from './intakeController'
import { saveIntakeTemplate } from './intakeTemplate'
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
    source_ticket_url: null,
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

const INTAKE_ISSUE = {
  key: 'PROJ-7',
  summary: 'Fix Issue Intake',
  descriptionHtml: '<p>Keep the <strong>Jira description</strong>.</p>',
}

function makeIntakeApi(tasks: Task[] = []) {
  const storage = createMemoryPluginStorage()
  const listSpy = vi.fn(async ({ projectId }: { projectId?: string | null } = {}) => (
    tasks.filter((task) => projectId == null || task.project_id === projectId)
  ))
  const createSpy = vi.fn(async ({ initialPrompt, projectId }: { initialPrompt: string; projectId: string }) => (
    makeTaskWithProject(`T-${tasks.length + 1}`, projectId, initialPrompt)
  ))
  const startSpy = vi.fn(async ({ taskId }: { taskId: string }) => ({
    taskId,
    sessionId: 'S-1',
    workspacePath: '/worktrees/T-1',
  }))
  const api: Api = {
    storage,
    backend: {
      state: 'ready',
      whenReady: async () => undefined,
      onReady: () => ({ dispose: () => undefined }),
      invoke: vi.fn() as FrontendOpenForgeAPI['backend']['invoke'],
    },
    tasks: {
      list: listSpy,
      create: createSpy,
      startImplementation: startSpy,
    } as unknown as FrontendOpenForgeAPI['tasks'],
  }
  return { api, listSpy, createSpy, startSpy }
}

function makeTaskWithProject(id: string, projectId: string, initialPrompt = ''): Task {
  return { ...makeTask(id), project_id: projectId, initial_prompt: initialPrompt }
}

describe('deriveIssueLinkStates', () => {
  it('summarizes task-scoped Issue Links from the active Project without storing a sync model', async () => {
    const tasks = [makeTask('T-1'), makeTask('T-2'), makeTask('T-3'), makeTask('T-4')]
    const { api, listSpy } = makeApi(async () => undefined, tasks)
    await api.storage.task('T-1').set(TASK_KEY.link, { key: 'PROJ-1' })
    await api.storage.task('T-2').set(TASK_KEY.link, { key: 'PROJ-1' })
    await api.storage.task('T-3').set(TASK_KEY.link, { key: 'PROJ-2' })

    const result = await deriveIssueLinkStates(api, 'P-1', ['PROJ-1', 'PROJ-2', 'PROJ-3'])

    expect(listSpy).toHaveBeenCalledWith({ projectId: 'P-1', includeDone: true })
    expect(result).toEqual({
      'PROJ-1': {
        issueKey: 'PROJ-1',
        tasks: [
          { id: 'T-1', title: 'T-1', status: 'backlog', updatedAt: 0 },
          { id: 'T-2', title: 'T-2', status: 'backlog', updatedAt: 0 },
        ],
      },
      'PROJ-2': {
        issueKey: 'PROJ-2',
        tasks: [{ id: 'T-3', title: 'T-3', status: 'backlog', updatedAt: 0 }],
      },
      'PROJ-3': { issueKey: 'PROJ-3', tasks: [] },
    })
    await expect(api.storage.project('P-1').get('issueLinkStates')).resolves.toBeNull()
  })

  it('orders linked Tasks most recently updated first and resolves each display title', async () => {
    const older: Task = { ...makeTask('T-old'), updated_at: 100, title: 'Explicit title' }
    const newer: Task = { ...makeTask('T-new'), updated_at: 200, initial_prompt: 'PROJ-1: Prompt heading\n\nBody' }
    const { api } = makeApi(async () => undefined, [older, newer])
    await api.storage.task('T-old').set(TASK_KEY.link, { key: 'PROJ-1' })
    await api.storage.task('T-new').set(TASK_KEY.link, { key: 'PROJ-1' })

    const result = await deriveIssueLinkStates(api, 'P-1', ['PROJ-1'])

    expect(result['PROJ-1'].tasks).toEqual([
      { id: 'T-new', title: 'PROJ-1: Prompt heading', status: 'backlog', updatedAt: 200 },
      { id: 'T-old', title: 'Explicit title', status: 'backlog', updatedAt: 100 },
    ])
  })

  it('includes done Tasks but ranks them after active ones even when more recently updated', async () => {
    const active: Task = { ...makeTask('T-active'), status: 'doing', updated_at: 100 }
    const done: Task = { ...makeTask('T-done'), status: 'done', updated_at: 300 }
    const { api } = makeApi(async () => undefined, [done, active])
    await api.storage.task('T-active').set(TASK_KEY.link, { key: 'PROJ-1' })
    await api.storage.task('T-done').set(TASK_KEY.link, { key: 'PROJ-1' })

    const result = await deriveIssueLinkStates(api, 'P-1', ['PROJ-1'])

    expect(result['PROJ-1'].tasks).toEqual([
      { id: 'T-active', title: 'T-active', status: 'doing', updatedAt: 100 },
      { id: 'T-done', title: 'T-done', status: 'done', updatedAt: 300 },
    ])
  })

  it('keys the map by normalized Issue Key regardless of requested key casing', async () => {
    const { api } = makeApi(async () => undefined, [makeTask('T-1')])
    await api.storage.task('T-1').set(TASK_KEY.link, { key: 'PROJ-1' })

    const result = await deriveIssueLinkStates(api, 'P-1', [' proj-1 '])

    expect(Object.keys(result)).toEqual(['PROJ-1'])
    expect(result['PROJ-1'].tasks).toEqual([{ id: 'T-1', title: 'T-1', status: 'backlog', updatedAt: 0 }])
  })
})

describe('issueLinkState', () => {
  it('resolves a linked Issue when the lookup key differs in casing or whitespace', () => {
    const states = { 'PROJ-1': { issueKey: 'PROJ-1', tasks: [] } }

    expect(issueLinkState(states, ' proj-1 ')).toBe(states['PROJ-1'])
    expect(issueLinkState(states, 'PROJ-2')).toBeUndefined()
  })
})

describe('upsertLinkedTask', () => {
  it('inserts a new linked Task and keeps most-recently-updated ordering', () => {
    const state = { issueKey: 'PROJ-1', tasks: [{ id: 'T-old', title: 'Old', status: 'backlog' as const, updatedAt: 100 }] }
    const task: Task = { ...makeTask('T-new'), updated_at: 200, title: 'New' }

    expect(upsertLinkedTask(state, 'PROJ-1', task)).toEqual({
      issueKey: 'PROJ-1',
      tasks: [
        { id: 'T-new', title: 'New', status: 'backlog', updatedAt: 200 },
        { id: 'T-old', title: 'Old', status: 'backlog', updatedAt: 100 },
      ],
    })
  })

  it('ranks a new active Task ahead of an existing done one regardless of update time', () => {
    const state = { issueKey: 'PROJ-1', tasks: [{ id: 'T-done', title: 'Done', status: 'done' as const, updatedAt: 500 }] }
    const task: Task = { ...makeTask('T-active'), status: 'doing', updated_at: 100, title: 'Active' }

    expect(upsertLinkedTask(state, 'PROJ-1', task).tasks).toEqual([
      { id: 'T-active', title: 'Active', status: 'doing', updatedAt: 100 },
      { id: 'T-done', title: 'Done', status: 'done', updatedAt: 500 },
    ])
  })

  it('replaces an already-present Task instead of duplicating it', () => {
    const state = { issueKey: 'PROJ-1', tasks: [{ id: 'T-1', title: 'Stale', status: 'backlog' as const, updatedAt: 100 }] }
    const task: Task = { ...makeTask('T-1'), updated_at: 300, title: 'Fresh' }

    expect(upsertLinkedTask(state, 'PROJ-1', task).tasks).toEqual([
      { id: 'T-1', title: 'Fresh', status: 'backlog', updatedAt: 300 },
    ])
  })

  it('starts a new state when the Issue had no linked Tasks', () => {
    const task: Task = { ...makeTask('T-1'), title: 'First' }

    expect(upsertLinkedTask(undefined, 'PROJ-1', task)).toEqual({
      issueKey: 'PROJ-1',
      tasks: [{ id: 'T-1', title: 'First', status: 'backlog', updatedAt: 0 }],
    })
  })
})

describe('Issue Intake orchestration', () => {
  it('creates a linked backlog Task in the active Project without starting it', async () => {
    const { api, listSpy, createSpy, startSpy } = makeIntakeApi()

    const result = await createIntakeTask(api, { projectId: 'P-active', issue: INTAKE_ISSUE })

    expect(result).toMatchObject({
      outcome: 'task-created',
      projectId: 'P-active',
      issueKey: 'PROJ-7',
      task: { id: 'T-1', status: 'backlog', project_id: 'P-active' },
    })
    expect(listSpy).toHaveBeenCalledWith({ projectId: 'P-active', includeDone: true })
    expect(createSpy).toHaveBeenCalledWith({
      projectId: 'P-active',
      initialPrompt: 'PROJ-7: Fix Issue Intake\n\n<p>Keep the <strong>Jira description</strong>.</p>',
    })
    expect(startSpy).not.toHaveBeenCalled()
    await expect(api.storage.task('T-1').get(TASK_KEY.link)).resolves.toEqual({ key: 'PROJ-7' })
  })

  it('renders the initial prompt with the active Project\'s saved Intake Template', async () => {
    const { api, createSpy } = makeIntakeApi()
    await saveIntakeTemplate(api, 'P-active', '{{summary}} [{{key}}]\n\n{{description}}')

    await createIntakeTask(api, { projectId: 'P-active', issue: INTAKE_ISSUE })

    expect(createSpy).toHaveBeenCalledWith({
      projectId: 'P-active',
      initialPrompt: 'Fix Issue Intake [PROJ-7]\n\n<p>Keep the <strong>Jira description</strong>.</p>',
    })
  })

  it('ignores linked Tasks outside the active Project', async () => {
    const otherProjectTask = makeTaskWithProject('T-other', 'P-other')
    const { api, createSpy } = makeIntakeApi([otherProjectTask])
    await api.storage.task('T-other').set(TASK_KEY.link, { key: 'PROJ-7' })

    const result = await createIntakeTask(api, { projectId: 'P-active', issue: INTAKE_ISSUE })

    expect(result.outcome).toBe('task-created')
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'P-active' }))
  })

  it('requires confirmation before creating another Task for the same Issue in the active Project', async () => {
    const linkedTask = makeTaskWithProject('T-existing', 'P-active')
    const { api, createSpy } = makeIntakeApi([linkedTask])
    await api.storage.task('T-existing').set(TASK_KEY.link, { key: 'PROJ-7' })

    const result = await createIntakeTask(api, { projectId: 'P-active', issue: INTAKE_ISSUE })

    expect(result).toEqual({
      outcome: 'confirmation-required',
      projectId: 'P-active',
      issueKey: 'PROJ-7',
      linkedTaskCount: 1,
      linkedTaskIds: ['T-existing'],
      message: 'PROJ-7 already has 1 linked Task in the active Project. Confirm to create another Task.',
    })
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('allows another linked Task after duplicate confirmation', async () => {
    const linkedTask = makeTaskWithProject('T-existing', 'P-active')
    const { api, createSpy } = makeIntakeApi([linkedTask])
    await api.storage.task('T-existing').set(TASK_KEY.link, { key: 'PROJ-7' })

    const result = await createIntakeTask(api, {
      projectId: 'P-active',
      issue: INTAKE_ISSUE,
      duplicateConfirmed: true,
    })

    expect(result.outcome).toBe('task-created')
    expect(createSpy).toHaveBeenCalledOnce()
    await expect(api.storage.task('T-2').get(TASK_KEY.link)).resolves.toEqual({ key: 'PROJ-7' })
  })

  it('starts implementation only after creating and linking the Task', async () => {
    const { api, startSpy } = makeIntakeApi()
    startSpy.mockImplementation(async ({ taskId }) => {
      await expect(api.storage.task(taskId).get(TASK_KEY.link)).resolves.toEqual({ key: 'PROJ-7' })
      return { taskId, sessionId: 'S-1', workspacePath: '/worktrees/T-1' }
    })

    const result = await createAndStartIntakeTask(api, { projectId: 'P-active', issue: INTAKE_ISSUE })

    expect(startSpy).toHaveBeenCalledWith({ taskId: 'T-1' })
    expect(result).toMatchObject({
      outcome: 'implementation-started',
      task: { id: 'T-1' },
      run: { taskId: 'T-1', sessionId: 'S-1', workspacePath: '/worktrees/T-1' },
    })
  })

  it('does not create or start from the Create and Start operation until a duplicate is confirmed', async () => {
    const linkedTask = makeTaskWithProject('T-existing', 'P-active')
    const { api, createSpy, startSpy } = makeIntakeApi([linkedTask])
    await api.storage.task('T-existing').set(TASK_KEY.link, { key: 'PROJ-7' })

    const result = await createAndStartIntakeTask(api, { projectId: 'P-active', issue: INTAKE_ISSUE })

    expect(result.outcome).toBe('confirmation-required')
    expect(createSpy).not.toHaveBeenCalled()
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('returns partial success and keeps the linked backlog Task when starting fails', async () => {
    const { api, startSpy } = makeIntakeApi()
    startSpy.mockRejectedValueOnce(new Error('No provider is configured.'))

    const result = await createAndStartIntakeTask(api, { projectId: 'P-active', issue: INTAKE_ISSUE })

    expect(result).toMatchObject({
      outcome: 'partial-success',
      task: { id: 'T-1', status: 'backlog' },
      startError: { stage: 'start-implementation', message: 'No provider is configured.' },
    })
    await expect(api.storage.task('T-1').get(TASK_KEY.link)).resolves.toEqual({ key: 'PROJ-7' })
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
