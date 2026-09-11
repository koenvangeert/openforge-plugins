import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
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

  function isCurrentActivation(
    projectId: string | null | undefined,
    activation: number,
  ): boolean {
    return activeProjectId === projectId && projectActivation === activation
  }

  async function load(): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) {
      model = null
      return
    }

    isLoading = true
    error = null
    try {
      const active = await api.tasks.active(projectId)
      if (!isCurrentActivation(projectId, activation)) return
      model = {
        regions: assembleRegions(active.tasks, seedRegionLabels(active.tasks)),
        arrows: selectArrows(active.tasks),
      }
    } catch (cause) {
      if (!isCurrentActivation(projectId, activation)) return
      model = null
      error = errorMessage(cause)
    } finally {
      if (isCurrentActivation(projectId, activation)) isLoading = false
    }
  }

  function activateProject(projectId: string | null): void {
    if (projectId === activeProjectId) return

    activeProjectId = projectId
    projectActivation += 1
    model = null
    error = null
    isLoading = false
    void load()
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
    reload: load,
  }
}
