import type { Disposable, FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { selectArrows, type DependencyArrow } from '../lib/arrows'
import { assembleRegions, regionCards, seedRegionLabels, type MapRegion } from '../lib/regions'

interface TaskMapModel {
  regions: MapRegion[]
  arrows: DependencyArrow[]
}

function errorMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
}

export function useTaskMap(api: FrontendOpenForgeAPI) {
  let activeProjectId = $state<string | null | undefined>(undefined)
  let projectActivation = 0
  let model = $state<TaskMapModel | null>(null)
  let isLoading = $state(false)
  let error = $state<string | null>(null)
  let taskChanges: Disposable | null = null
  let readInFlight = false
  let rereadRequested = false

  function isCurrentActivation(
    projectId: string | null | undefined,
    activation: number,
  ): boolean {
    return activeProjectId === projectId && projectActivation === activation
  }

  async function readActiveTasks(background: boolean): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) {
      model = null
      return
    }

    try {
      const active = await api.tasks.active(projectId)
      if (!isCurrentActivation(projectId, activation)) return
      model = {
        regions: assembleRegions(active.tasks, seedRegionLabels(active.tasks)),
        arrows: selectArrows(active.tasks),
      }
      error = null
    } catch (cause) {
      // A failed background read leaves the map it could not replace on screen.
      if (background || !isCurrentActivation(projectId, activation)) return
      model = null
      error = errorMessage(cause)
    } finally {
      if (isCurrentActivation(projectId, activation)) isLoading = false
    }
  }

  async function runReads(background: boolean): Promise<void> {
    const activation = projectActivation
    if (!background) isLoading = true
    if (readInFlight) {
      rereadRequested = true
      return
    }

    readInFlight = true
    try {
      let inBackground = background
      do {
        rereadRequested = false
        await readActiveTasks(inBackground)
        inBackground = true
      } while (rereadRequested && projectActivation === activation)
    } finally {
      if (projectActivation === activation) readInFlight = false
    }
  }

  function refresh(): Promise<void> {
    return runReads(true)
  }

  function reload(): Promise<void> {
    return runReads(false)
  }

  function watchTaskChanges(projectId: string | null): void {
    taskChanges?.dispose()
    taskChanges = projectId ? api.tasks.onDidChange(projectId, () => void refresh()) : null
  }

  function activateProject(projectId: string | null): void {
    if (projectId === activeProjectId) return

    activeProjectId = projectId
    projectActivation += 1
    model = null
    error = null
    isLoading = false
    readInFlight = false
    rereadRequested = false
    watchTaskChanges(projectId)
    void reload()
  }

  function dispose(): void {
    taskChanges?.dispose()
    taskChanges = null
    projectActivation += 1
  }

  return {
    get regions(): MapRegion[] {
      return model?.regions ?? []
    },
    get arrows(): DependencyArrow[] {
      return model?.arrows ?? []
    },
    get isLoading(): boolean {
      return isLoading
    },
    get error(): string | null {
      return error
    },
    get hasProject(): boolean {
      return Boolean(activeProjectId)
    },
    get isEmpty(): boolean {
      return model !== null && regionCards(model.regions).length === 0
    },
    activateProject,
    dispose,
    reload,
  }
}
