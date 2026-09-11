import type { Disposable, FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import { selectArrows, type DependencyArrow } from '../lib/arrows'
import type { CardPosition, CardPositions } from '../lib/cards'
import {
  forgetCardPositions,
  readCardPositions,
  resolveRegionLabels,
  writeCardPosition,
} from '../lib/mapStore'
import {
  assembleRegions,
  regionCards,
  stalePositionIds,
  type MapRegion,
} from '../lib/regions'

interface TaskMapSnapshot {
  tasks: TaskDetail[]
  regionLabels: string[]
  positions: CardPositions
}

function errorMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
}

function reportStorageFailure(cause: unknown): void {
  console.warn('[task-map] a card position could not be stored', cause)
}

export function useTaskMap(api: FrontendOpenForgeAPI) {
  let activeProjectId = $state<string | null | undefined>(undefined)
  let projectActivation = 0
  let snapshot = $state<TaskMapSnapshot | null>(null)
  let isLoading = $state(false)
  let error = $state<string | null>(null)
  let taskChanges: Disposable | null = null
  let readInFlight = false
  let rereadRequested = false
  // Every drop of this activation. A read that was already in flight when the
  // user let go resolves from the snapshot before it, so a card would spring
  // back to where the map laid it out unless the drops win over what it read.
  let drops = new Map<string, CardPosition>()

  const regions = $derived(
    snapshot ? assembleRegions(snapshot.tasks, snapshot.regionLabels, snapshot.positions) : [],
  )
  const arrows = $derived(snapshot ? selectArrows(snapshot.tasks) : [])

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
      snapshot = null
      return
    }

    try {
      const active = await api.tasks.active(projectId)
      if (!isCurrentActivation(projectId, activation)) return

      const [regionLabels, stored] = await Promise.all([
        resolveRegionLabels(api.storage, projectId, active.tasks),
        readCardPositions(api.storage, projectId),
      ])
      if (!isCurrentActivation(projectId, activation)) return

      const positions = { ...stored, ...Object.fromEntries(drops) }
      snapshot = { tasks: active.tasks, regionLabels, positions }
      error = null
      forgetPositions(projectId, stalePositionIds(regions, positions))
    } catch (cause) {
      // A failed background read leaves the map it could not replace on screen.
      if (background || !isCurrentActivation(projectId, activation)) return
      snapshot = null
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
    drops = new Map()
    snapshot = null
    error = null
    isLoading = false
    readInFlight = false
    rereadRequested = false
    watchTaskChanges(projectId)
    void reload()
  }

  function forgetPositions(projectId: string, taskIds: readonly string[]): void {
    if (!snapshot || taskIds.length === 0) return

    for (const taskId of taskIds) drops.delete(taskId)
    snapshot = {
      ...snapshot,
      positions: Object.fromEntries(
        Object.entries(snapshot.positions).filter(([taskId]) => !taskIds.includes(taskId)),
      ),
    }
    void forgetCardPositions(api.storage, projectId, taskIds).catch(reportStorageFailure)
  }

  function dropCard(taskId: string, position: CardPosition): void {
    const projectId = activeProjectId
    if (!snapshot || !projectId) return

    // A reactive proxy cannot cross the clone the host writes it through.
    const dropped = $state.snapshot(position)
    snapshot = { ...snapshot, positions: { ...snapshot.positions, [taskId]: dropped } }
    drops.set(taskId, dropped)
    // A refused write raises no error state: that would take the map away from
    // the user over a card that is already where they dropped it.
    void writeCardPosition(api.storage, projectId, taskId, dropped).catch(reportStorageFailure)
  }

  function dispose(): void {
    taskChanges?.dispose()
    taskChanges = null
    projectActivation += 1
  }

  return {
    get regions(): MapRegion[] {
      return regions
    },
    get arrows(): DependencyArrow[] {
      return arrows
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
      return snapshot !== null && regionCards(regions).length === 0
    },
    activateProject,
    dispose,
    dropCard,
    reload,
  }
}
