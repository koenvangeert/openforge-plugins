import { describe, expect, it, vi } from 'vitest'
import type { JsonValue, PluginStorage } from '@openforge-app/plugin-sdk'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import { createMemoryPluginStorage, createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { emptyHierarchy, type BoardCard, type IssueTaskLink } from './board'
import {
  buildIssueTaskPrompt,
  findIssueTaskLinkForTask,
  keepLiveIssueTaskLinks,
  loadIssueTaskLinkForTask,
  loadIssueTaskLinks,
  loadVisibleIssueTaskLinks,
  startIssueAction,
} from './issueActions'

const card: BoardCard = {
  issueNumber: 42,
  title: 'Add repository docs',
  body: 'Users need a GitHub issue board inside OpenForge.',
  labels: ['enhancement', 'github'],
  value: 8,
  taskLink: null,
  ...emptyHierarchy(),
}

function withFailingNextIssueTaskLinksGet(storage: PluginStorage): PluginStorage {
  let shouldFail = true
  return {
    global: storage.global,
    project(projectId) {
      const scope = storage.project(projectId)
      return {
        async get<T extends JsonValue = JsonValue>(key: string): Promise<T | null> {
          if (key === 'issueTaskLinks' && shouldFail) {
            shouldFail = false
            throw new Error('transient project storage read failure')
          }
          return scope.get<T>(key)
        },
        async set<T extends JsonValue = JsonValue>(key: string, value: T): Promise<void> {
          await scope.set(key, value)
        },
        async delete(key: string): Promise<void> {
          await scope.delete(key)
        },
      }
    },
    task: (taskId) => storage.task(taskId),
  }
}

function withIssueTaskLinksGetFailures(storage: PluginStorage, failureCount: number): PluginStorage {
  let remainingFailures = failureCount
  return {
    global: storage.global,
    project(projectId) {
      const scope = storage.project(projectId)
      return {
        async get<T extends JsonValue = JsonValue>(key: string): Promise<T | null> {
          if (key === 'issueTaskLinks' && remainingFailures > 0) {
            remainingFailures -= 1
            throw new Error('transient project storage read failure')
          }
          return scope.get<T>(key)
        },
        async set<T extends JsonValue = JsonValue>(key: string, value: T): Promise<void> {
          await scope.set(key, value)
        },
        async delete(key: string): Promise<void> {
          await scope.delete(key)
        },
      }
    },
    task: (taskId) => storage.task(taskId),
  }
}

describe('issue actions', () => {
  it('builds a reference to the GitHub issue rather than a copy of it', () => {
    const prompt = buildIssueTaskPrompt({
      card,
      repo: 'octo/cat',
    })

    expect(prompt).toBe(
      'Implement GitHub issue #42: Add repository docs\n\nhttps://github.com/octo/cat/issues/42',
    )
    // The agent reads the issue itself, so it sees the current body rather than
    // a snapshot taken when the menu was clicked.
    expect(prompt).not.toContain('Users need a GitHub issue board inside OpenForge.')
    expect(prompt).not.toContain('Labels:')
    expect(prompt).not.toContain('Repository:')
  })

  it('composes a task for the issue and stores the issue task link, without starting or navigating itself', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.issues', projectId: 'P-1' })

    const result = await startIssueAction(registry.frontendApi, {
      projectId: 'P-1',
      repo: 'octo/cat',
      card,
    })

    expect(result?.task.id).toBe('mock-task-1')
    expect(registry.calls.taskComposes).toEqual([
      {
        projectId: 'P-1',
        initialPrompt: 'Implement GitHub issue #42: Add repository docs\n\nhttps://github.com/octo/cat/issues/42',
        sourceTicketUrl: 'https://github.com/octo/cat/issues/42',
        title: 'Add repository docs',
      },
    ])
    // The dialog owns starting; the host navigates when the user starts there.
    expect(registry.calls.taskImplementationStarts).toEqual([])
    await expect(registry.frontendApi.storage.task('mock-task-1').get('issueTaskLink')).resolves.toEqual({
      issueNumber: 42,
      link: {
        taskId: 'mock-task-1',
        sessionId: '',
        workspacePath: '',
        repo: 'octo/cat',
        title: 'Add repository docs',
      },
    })
    expect(registry.calls.storageSets).toContainEqual(
      expect.objectContaining({
        scope: 'project',
        scopeId: 'P-1',
        key: 'issueTaskLinks',
      }),
    )
    await expect(loadIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({
      42: {
        taskId: 'mock-task-1',
        sessionId: '',
        workspacePath: '',
        repo: 'octo/cat',
        title: 'Add repository docs',
      },
    })
    expect(registry.calls.navigationRequests).toEqual([])
  })

  it('records nothing when the compose dialog is dismissed', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.issues', projectId: 'P-1' })
    registry.frontendApi.tasks.compose = async () => null

    const result = await startIssueAction(registry.frontendApi, {
      projectId: 'P-1',
      repo: 'octo/cat',
      card,
    })

    expect(result).toBeNull()
    await expect(loadIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({})
  })

  it('keeps both issue links available for IssuesView hydration after concurrent starts', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.issues', projectId: 'P-1' })
    const secondCard: BoardCard = { ...card, issueNumber: 43, title: 'Fix concurrent starts' }

    await Promise.all([
      startIssueAction(registry.frontendApi, {
        projectId: 'P-1',
        repo: 'octo/cat',
        card,
      }),
      startIssueAction(registry.frontendApi, {
        projectId: 'P-1',
        repo: 'octo/cat',
        card: secondCard,
      }),
    ])

    await expect(loadIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toMatchObject({
      42: { taskId: 'mock-task-1', title: 'Add repository docs' },
      43: { taskId: 'mock-task-2', title: 'Fix concurrent starts' },
    })
  })

  it('preserves stored links when one queued read fails and continues the next update', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set('issueTaskLinks', {
      41: {
        taskId: 'KVG-41',
        sessionId: 'session-41',
        workspacePath: '/tmp/kvg-41',
        repo: 'octo/cat',
        title: 'Existing linked task',
      },
    })
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.issues',
      projectId: 'P-1',
      storage: withFailingNextIssueTaskLinksGet(storage),
    })
    const secondCard: BoardCard = { ...card, issueNumber: 43, title: 'Continue after storage failure' }

    const [failedStart, successfulStart] = await Promise.allSettled([
      startIssueAction(registry.frontendApi, {
        projectId: 'P-1',
        repo: 'octo/cat',
        card,
      }),
      startIssueAction(registry.frontendApi, {
        projectId: 'P-1',
        repo: 'octo/cat',
        card: secondCard,
      }),
    ])

    expect(failedStart).toMatchObject({ status: 'rejected' })
    expect(successfulStart).toMatchObject({ status: 'fulfilled' })
    await expect(loadIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toMatchObject({
      41: { taskId: 'KVG-41', title: 'Existing linked task' },
      43: { taskId: 'mock-task-2', title: 'Continue after storage failure' },
    })
  })

  it('loads only valid stored issue task links', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.issues', projectId: 'P-1' })
    await registry.frontendApi.storage.project('P-1').set('issueTaskLinks', {
      '42': {
        taskId: 'KVG-42',
        sessionId: 'session-42',
        workspacePath: '/tmp/kvg-42',
        repo: 'octo/cat',
        title: 'Linked ticket',
      },
      nope: { taskId: 'KVG-nope', sessionId: 'session-nope', workspacePath: '/tmp/nope' },
      '43': { taskId: 43, sessionId: 'session-43', workspacePath: '/tmp/kvg-43' },
    })

    await expect(loadIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({
      42: {
        taskId: 'KVG-42',
        sessionId: 'session-42',
        workspacePath: '/tmp/kvg-42',
        repo: 'octo/cat',
        title: 'Linked ticket',
      },
    })
  })

  it('keeps task-side ticket links for multiple tasks started from the same issue', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.issues', projectId: 'P-1' })
    await startIssueAction(registry.frontendApi, {
      projectId: 'P-1',
      repo: 'octo/cat',
      card,
    })
    await startIssueAction(registry.frontendApi, {
      projectId: 'P-1',
      repo: 'octo/cat',
      card,
    })

    await expect(loadIssueTaskLinkForTask(registry.frontendApi, 'P-1', 'mock-task-1')).resolves.toMatchObject({
      issueNumber: 42,
      link: { taskId: 'mock-task-1', repo: 'octo/cat', title: 'Add repository docs' },
    })
    await expect(loadIssueTaskLinkForTask(registry.frontendApi, 'P-1', 'mock-task-2')).resolves.toMatchObject({
      issueNumber: 42,
      link: { taskId: 'mock-task-2', repo: 'octo/cat', title: 'Add repository docs' },
    })
  })

  it('rides out a single transient read failure and still returns the stored links, e.g. right after a plugin reload', async () => {
    const storage = createMemoryPluginStorage()
    const storedLink = {
      taskId: 'KVG-42',
      sessionId: 'session-42',
      workspacePath: '/tmp/kvg-42',
      repo: 'octo/cat',
      title: 'Linked ticket',
    }
    await storage.project('P-1').set('issueTaskLinks', { 42: storedLink })
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.issues',
      projectId: 'P-1',
      storage: withIssueTaskLinksGetFailures(storage, 1),
    })

    await expect(loadIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({ 42: storedLink })
  })

  it('reports a read failure that survives the retry instead of silently looking like every link is gone', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set('issueTaskLinks', {
      42: {
        taskId: 'KVG-42',
        sessionId: 'session-42',
        workspacePath: '/tmp/kvg-42',
        repo: 'octo/cat',
        title: 'Linked ticket',
      },
    })
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.issues',
      projectId: 'P-1',
      storage: withIssueTaskLinksGetFailures(storage, 2),
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Still resolves -- an unscored board is a normal state the caller already renders --
    // but the failure is not left indistinguishable from "there was never any data".
    await expect(loadIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({})
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load issue-task links'),
      expect.any(Error),
    )

    consoleError.mockRestore()
  })

  it('reverse-lookups the issue linked to a task', () => {
    expect(
      findIssueTaskLinkForTask(
        {
          41: { taskId: 'KVG-41', sessionId: 'session-41', workspacePath: '/tmp/kvg-41', repo: null, title: null },
          42: { taskId: 'KVG-42', sessionId: 'session-42', workspacePath: '/tmp/kvg-42', repo: 'octo/cat', title: 'Linked ticket' },
        },
        'KVG-42',
      ),
    ).toEqual({
      issueNumber: 42,
      link: { taskId: 'KVG-42', sessionId: 'session-42', workspacePath: '/tmp/kvg-42', repo: 'octo/cat', title: 'Linked ticket' },
    })

    expect(findIssueTaskLinkForTask({}, 'KVG-42')).toBeNull()
  })

  it('drops stored links whose Task is no longer on any board surface', () => {
    const live: IssueTaskLink = {
      taskId: 'KVG-live',
      sessionId: 'session-live',
      workspacePath: '/tmp/live',
      repo: 'octo/cat',
      title: 'Still open',
    }
    const completed: IssueTaskLink = {
      taskId: 'KVG-done',
      sessionId: 'session-done',
      workspacePath: '/tmp/done',
      repo: 'octo/cat',
      title: 'Completed away',
    }

    expect(
      keepLiveIssueTaskLinks(
        { 10: live, 11: completed },
        ['KVG-live'],
      ),
    ).toEqual({ 10: live })
  })

  it('hides the chip after Complete, when the Task is gone from the live project list', async () => {
    const storage = createMemoryPluginStorage()
    const liveLink = {
      taskId: 'KVG-live',
      sessionId: 'session-live',
      workspacePath: '/tmp/live',
      repo: 'octo/cat',
      title: 'Still open',
    }
    const completedLink = {
      taskId: 'KVG-done',
      sessionId: 'session-done',
      workspacePath: '/tmp/done',
      repo: 'octo/cat',
      title: 'Completed away',
    }
    await storage.project('P-1').set('issueTaskLinks', { 10: liveLink, 11: completedLink })
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.issues',
      projectId: 'P-1',
      storage,
      tasks: [makeTask('KVG-live')],
    })

    await expect(loadVisibleIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({ 10: liveLink })
  })

  it('hides a stored link when Complete has set the Task status to done', async () => {
    const storage = createMemoryPluginStorage()
    const completedLink = {
      taskId: 'KVG-done',
      sessionId: 'session-done',
      workspacePath: '/tmp/done',
      repo: 'octo/cat',
      title: 'Completed away',
    }
    await storage.project('P-1').set('issueTaskLinks', { 11: completedLink })
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.issues',
      projectId: 'P-1',
      storage,
      tasks: [{ ...makeTask('KVG-done'), status: 'done' }],
    })

    await expect(loadVisibleIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({})
  })

  it('keeps stored chips when the live Task list cannot be read', async () => {
    const storage = createMemoryPluginStorage()
    const storedLink = {
      taskId: 'KVG-42',
      sessionId: 'session-42',
      workspacePath: '/tmp/kvg-42',
      repo: 'octo/cat',
      title: 'Linked ticket',
    }
    await storage.project('P-1').set('issueTaskLinks', { 42: storedLink })
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.issues',
      projectId: 'P-1',
      storage,
    })
    registry.frontendApi.tasks.list = async () => {
      throw new Error('task list unavailable')
    }

    await expect(loadVisibleIssueTaskLinks(registry.frontendApi, 'P-1')).resolves.toEqual({ 42: storedLink })
  })
})

function makeTask(id: string): Task {
  return {
    id,
    initial_prompt: '',
    status: 'backlog',
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
  }
}
