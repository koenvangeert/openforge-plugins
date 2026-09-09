import type {
  Disposable,
  OpenForgeContextChangeHandler,
  OpenForgeContextSnapshot,
  TasksAPI,
} from '@openforge-app/plugin-sdk'
import { latestAgentSessionId } from './prLensSession'

export interface TabVisibilityDeps {
  tasks: Pick<TasksAPI, 'listSessions' | 'onDidChange'>
  getSnapshot: () => OpenForgeContextSnapshot
  onContextChange: (handler: OpenForgeContextChangeHandler) => Disposable
  registerTab: () => Disposable
}

export function startTabVisibility(deps: TabVisibilityDeps): Disposable {
  let tab: Disposable | null = null
  let taskWatch: Disposable | null = null
  let watchedProjectId: string | null = null
  let generation = 0
  let disposed = false

  function show(visible: boolean): void {
    if (visible && !tab) tab = deps.registerTab()
    if (!visible && tab) {
      tab.dispose()
      tab = null
    }
  }

  function watchTasks(projectId: string | null): void {
    if (projectId === watchedProjectId) return
    taskWatch?.dispose()
    taskWatch = null
    watchedProjectId = projectId
    if (!projectId) return
    taskWatch = deps.tasks.onDidChange(projectId, (event) => {
      const taskId = deps.getSnapshot().taskId ?? null
      if (event.taskId === null || event.taskId === taskId) void sync()
    })
  }

  async function sync(): Promise<void> {
    const snapshot = deps.getSnapshot()
    watchTasks(snapshot.projectId)

    const taskId = snapshot.taskId ?? null
    if (!taskId) {
      show(false)
      return
    }

    generation += 1
    const attempt = generation
    let sessionId: string | null = null
    try {
      sessionId = await latestAgentSessionId(deps.tasks, taskId)
    } catch {
      sessionId = null
    }
    if (disposed || attempt !== generation) return
    show(sessionId !== null)
  }

  const contextWatch = deps.onContextChange(() => sync())
  void sync()

  return {
    dispose() {
      disposed = true
      contextWatch.dispose()
      taskWatch?.dispose()
      taskWatch = null
      show(false)
    },
  }
}
