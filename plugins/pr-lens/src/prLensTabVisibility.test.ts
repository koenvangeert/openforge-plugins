import type {
  Disposable,
  OpenForgeContextChangeHandler,
  OpenForgeContextSnapshot,
  TaskChangeEvent,
  TasksAPI,
} from '@openforge-app/plugin-sdk'
import { describe, expect, it, vi } from 'vitest'
import { agentSession } from './__fixtures__/agentSession'
import { startTabVisibility } from './prLensTabVisibility'

const PLUGIN_ID = 'dev.kvg.pr-lens'
const PROJECT_ID = 'P-1'

function makeHarness(sessionsByTask: Record<string, string[]>, taskId: string | null) {
  const sessions = { ...sessionsByTask }
  let snapshot: OpenForgeContextSnapshot = { pluginId: PLUGIN_ID, projectId: PROJECT_ID, taskId }
  const contextHandlers: OpenForgeContextChangeHandler[] = []
  const taskHandlers: Array<(event: TaskChangeEvent) => void> = []
  const tabDispose = vi.fn()
  let registered = 0

  const tasks: Pick<TasksAPI, 'listSessions' | 'onDidChange'> = {
    listSessions: vi.fn(async ({ taskId: requested }) =>
      (sessions[requested] ?? []).map((id, index) => agentSession(id, requested, index)).reverse(),
    ),
    onDidChange: vi.fn((_projectId, handler) => {
      taskHandlers.push(handler)
      return { dispose: () => undefined }
    }),
  }

  const driver = startTabVisibility({
    tasks,
    getSnapshot: () => snapshot,
    onContextChange: (handler) => {
      contextHandlers.push(handler)
      return { dispose: () => undefined }
    },
    registerTab: (): Disposable => {
      registered += 1
      return { dispose: tabDispose }
    },
  })

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    driver,
    tabDispose,
    settle,
    tabIsVisible: () => registered - tabDispose.mock.calls.length > 0,
    async moveTo(next: string | null) {
      snapshot = { ...snapshot, taskId: next }
      await Promise.all(contextHandlers.map((handler) => handler(snapshot)))
      await settle()
    },
    async startSession(task: string, sessionId: string) {
      sessions[task] = [...(sessions[task] ?? []), sessionId]
      for (const handler of taskHandlers) {
        handler({ projectId: PROJECT_ID, taskId: task, reason: 'execution' })
      }
      await settle()
    },
  }
}

describe('PR Lens tab visibility', () => {
  it('leaves the tab unregistered for a task that never ran', async () => {
    const harness = makeHarness({}, 'T-1')

    await harness.settle()

    expect(harness.tabIsVisible()).toBe(false)
  })

  it('registers the tab for a task with an agent session', async () => {
    const harness = makeHarness({ 'T-1': ['S-1'] }, 'T-1')

    await harness.settle()

    expect(harness.tabIsVisible()).toBe(true)
  })

  it('follows the open task when switching between a run task and a backlog task', async () => {
    const harness = makeHarness({ 'T-1': ['S-1'] }, 'T-1')
    await harness.settle()

    await harness.moveTo('T-2')
    expect(harness.tabIsVisible()).toBe(false)

    await harness.moveTo('T-1')
    expect(harness.tabIsVisible()).toBe(true)

    await harness.moveTo(null)
    expect(harness.tabIsVisible()).toBe(false)
  })

  it('registers the tab when the open task starts its first session', async () => {
    const harness = makeHarness({}, 'T-1')
    await harness.settle()
    expect(harness.tabIsVisible()).toBe(false)

    await harness.startSession('T-1', 'S-1')

    expect(harness.tabIsVisible()).toBe(true)
  })

  it('ignores a session starting on a task that is not open', async () => {
    const harness = makeHarness({}, 'T-1')
    await harness.settle()

    await harness.startSession('T-2', 'S-9')

    expect(harness.tabIsVisible()).toBe(false)
  })

  it('drops the tab on disposal', async () => {
    const harness = makeHarness({ 'T-1': ['S-1'] }, 'T-1')
    await harness.settle()

    harness.driver.dispose()

    expect(harness.tabIsVisible()).toBe(false)
  })
})
