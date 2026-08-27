import { buildAttributionMap, type AttributionMap } from './attribution'
import { buildDashboard, buildTaskSpend, type SpendDashboardData, type TaskSpendData } from './dashboard'
import { emptySpendIndex, parseSpendIndex, serializeSpendIndex, type SpendIndex } from './spendIndex'
import { scanTranscripts, type ScanResult, type TranscriptFileSystem } from './scanner'

export const SPEND_INDEX_PATH = 'spend-index.json'
const ATTRIBUTION_TTL_MS = 30_000

export interface SpendServiceDependencies {
  userData: {
    readTextFile(request: { path: string }): Promise<string>
    writeTextFile(request: { path: string; content: string }): Promise<void>
  }
  external: TranscriptFileSystem
  projects: { list(): Promise<Array<{ id: string; name: string; path: string }>> }
  tasks: {
    list(request?: { projectId?: string | null; includeDone?: boolean }): Promise<
      Array<{ id: string; title: string | null; initial_prompt: string; project_id: string | null }>
    >
    getWorkspace(taskId: string): Promise<{ workspace_path: string; project_id: string } | null>
  }
  root: string
  now(): number
  onError?(message: string, error: unknown): void
}

export interface SpendService {
  refresh(signal?: AbortSignal): Promise<ScanResult>
  getDashboard(): Promise<SpendDashboardData>
  getTaskSpend(taskId: string): Promise<TaskSpendData>
}

function taskTitle(task: { title: string | null; initial_prompt: string }): string {
  const explicit = task.title?.trim()
  if (explicit) return explicit
  const firstLine = task.initial_prompt.split('\n', 1)[0]!.trim()
  if (firstLine.length === 0) return 'Untitled task'
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
}

export function createSpendService(dependencies: SpendServiceDependencies): SpendService {
  let index: SpendIndex | null = null
  let loading: Promise<SpendIndex> | null = null
  let attributionMap: AttributionMap | null = null
  let attributionLoadedAt = 0

  async function load(): Promise<SpendIndex> {
    if (index) return index
    loading ??= (async () => {
      try {
        index = parseSpendIndex(await dependencies.userData.readTextFile({ path: SPEND_INDEX_PATH }))
      } catch {
        // No index yet, or an unreadable one. Either way the next scan rebuilds it.
        index = emptySpendIndex()
      }
      return index
    })()
    return loading
  }

  async function persist(current: SpendIndex): Promise<void> {
    try {
      await dependencies.userData.writeTextFile({
        path: SPEND_INDEX_PATH,
        content: serializeSpendIndex(current),
      })
    } catch (error) {
      dependencies.onError?.('failed to persist the spend index', error)
    }
  }

  async function loadAttributionMap(): Promise<AttributionMap> {
    const projects = await dependencies.projects.list()
    const tasks = await dependencies.tasks.list()
    const resolved = await Promise.all(
      tasks.map(async (task) => {
        try {
          const workspace = await dependencies.tasks.getWorkspace(task.id)
          if (!workspace?.workspace_path) return null
          return {
            id: task.id,
            title: taskTitle(task),
            projectId: task.project_id ?? workspace.project_id,
            workspacePath: workspace.workspace_path,
          }
        } catch {
          return null
        }
      }),
    )
    return buildAttributionMap({
      projects,
      tasks: resolved.filter((task): task is NonNullable<typeof task> => task !== null),
    })
  }

  async function currentAttributionMap(): Promise<AttributionMap> {
    const now = dependencies.now()
    if (attributionMap && now - attributionLoadedAt < ATTRIBUTION_TTL_MS) return attributionMap
    try {
      attributionMap = await loadAttributionMap()
      attributionLoadedAt = now
    } catch (error) {
      dependencies.onError?.('failed to resolve spend attribution', error)
      attributionMap ??= buildAttributionMap({ projects: [], tasks: [] })
    }
    return attributionMap
  }

  return {
    async refresh(signal) {
      const current = await load()
      const result = await scanTranscripts({
        fs: dependencies.external,
        root: dependencies.root,
        index: current,
        signal,
      })
      if (result.transcriptsRead > 0) await persist(current)
      return result
    },
    async getDashboard() {
      const current = await load()
      return buildDashboard(current, await currentAttributionMap(), dependencies.now())
    },
    async getTaskSpend(taskId) {
      const current = await load()
      return buildTaskSpend(current, await currentAttributionMap(), taskId)
    },
  }
}
