import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { placeCards, type MapCard } from '../lib/cards'

function errorMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
}

export function useTaskMap(api: FrontendOpenForgeAPI) {
  let activeProjectId = $state<string | null | undefined>(undefined)
  let projectActivation = 0
  let cards = $state<MapCard[] | null>(null)
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
      cards = null
      return
    }

    isLoading = true
    error = null
    try {
      const active = await api.tasks.active(projectId)
      if (!isCurrentActivation(projectId, activation)) return
      cards = placeCards(active.tasks)
    } catch (cause) {
      if (!isCurrentActivation(projectId, activation)) return
      cards = null
      error = errorMessage(cause)
    } finally {
      if (isCurrentActivation(projectId, activation)) isLoading = false
    }
  }

  function activateProject(projectId: string | null): void {
    if (projectId === activeProjectId) return

    activeProjectId = projectId
    projectActivation += 1
    cards = null
    error = null
    isLoading = false
    void load()
  }

  return {
    get cards(): MapCard[] {
      return cards ?? []
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
      return cards !== null && cards.length === 0
    },
    activateProject,
    reload: load,
  }
}
