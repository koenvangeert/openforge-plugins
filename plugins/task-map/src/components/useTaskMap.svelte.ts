import type { Disposable, FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import { selectArrows, type DependencyArrow } from '../lib/arrows'
import { cardKey, type CardPosition, type CardPositions } from '../lib/cards'
import { readCardPositions, resolveBands, writeBands, writeCardPosition } from '../lib/mapStore'
import {
  assembleBands,
  bandCards,
  curatedLabels,
  labelsInUse,
  moveBand,
  resizeBand,
  withCuratedLabels,
  type Band,
  type MapBand,
  type MapSize,
} from '../lib/bands'
import type { CanvasPoint } from '../lib/viewport'

interface TaskMapSnapshot {
  tasks: TaskDetail[]
  bands: Band[]
  positions: CardPositions
}

function errorMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
}

function reportStorageFailure(cause: unknown): void {
  console.warn('[task-map] a placement could not be stored', cause)
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
  // Every placement this activation. A read that was already in flight when the
  // user let go resolves from the snapshot before it, so a card or a Band would
  // spring back unless what the user did wins over what the read found.
  let placedCards = new Map<string, CardPosition>()
  let placedBands: Band[] | null = null

  const bands = $derived(
    snapshot ? assembleBands(snapshot.tasks, snapshot.bands, snapshot.positions) : [],
  )
  const arrows = $derived(snapshot ? selectArrows(snapshot.tasks) : [])

  function isCurrentActivation(
    projectId: string | null | undefined,
    activation: number,
  ): boolean {
    return activeProjectId === projectId && projectActivation === activation
  }

  function mergePositions(stored: CardPositions): CardPositions {
    const kept = stored.filter((entry) => !placedCards.has(cardKey(entry.band, entry.taskId)))
    return [...kept, ...placedCards.values()]
  }

  async function readActiveTasks(background: boolean): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) {
      snapshot = null
      isLoading = false
      return
    }

    try {
      const active = await api.tasks.active(projectId)
      if (!isCurrentActivation(projectId, activation)) return

      const [storedBands, storedPositions] = await Promise.all([
        resolveBands(api.storage, projectId, active.tasks),
        readCardPositions(api.storage, projectId),
      ])
      if (!isCurrentActivation(projectId, activation)) return

      snapshot = {
        tasks: active.tasks,
        bands: placedBands ?? storedBands,
        positions: mergePositions(storedPositions),
      }
      error = null
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
    placedCards = new Map()
    placedBands = null
    snapshot = null
    error = null
    isLoading = false
    readInFlight = false
    rereadRequested = false
    watchTaskChanges(projectId)
    void reload()
  }

  function placeBands(next: Band[]): void {
    const projectId = activeProjectId
    if (!snapshot || !projectId) return

    // A reactive proxy cannot cross the clone the host writes a value through.
    placedBands = $state.snapshot(next)
    snapshot = { ...snapshot, bands: next }
    // A refused write raises no error state: that would take the map away from
    // the user over a Band that is already where they put it.
    void writeBands(api.storage, projectId, placedBands).catch(reportStorageFailure)
  }

  function dropBand(label: string | null, point: CanvasPoint): void {
    if (!snapshot) return
    placeBands(moveBand(snapshot.bands, label, point))
  }

  function sizeBand(label: string | null, size: MapSize): void {
    if (!snapshot) return
    placeBands(resizeBand(snapshot.bands, label, size))
  }

  // Written before it is shown, unlike a drag: the user cannot see that a Band
  // set they typed into a dialog never reached storage.
  async function saveCuratedLabels(labels: readonly string[]): Promise<void> {
    const projectId = activeProjectId
    if (!snapshot || !projectId) return

    const next = $state.snapshot(withCuratedLabels(snapshot.bands, snapshot.tasks, [...labels]))
    await writeBands(api.storage, projectId, next)
    if (!snapshot || activeProjectId !== projectId) return

    placedBands = next
    snapshot = { ...snapshot, bands: next }
  }

  function dropCard(position: CardPosition): void {
    const projectId = activeProjectId
    if (!snapshot || !projectId) return

    const dropped = $state.snapshot(position)
    placedCards.set(cardKey(dropped.band, dropped.taskId), dropped)
    snapshot = { ...snapshot, positions: mergePositions(snapshot.positions) }
    void writeCardPosition(api.storage, projectId, dropped).catch(reportStorageFailure)
  }

  function dispose(): void {
    taskChanges?.dispose()
    taskChanges = null
    activeProjectId = null
    projectActivation += 1
  }

  return {
    get bands(): MapBand[] {
      return bands
    },
    get arrows(): DependencyArrow[] {
      return arrows
    },
    get curatedLabels(): string[] {
      return snapshot ? curatedLabels(snapshot.bands) : []
    },
    get availableLabels(): string[] {
      return snapshot ? labelsInUse(snapshot.tasks) : []
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
      return snapshot !== null && bandCards(bands).length === 0
    },
    activateProject,
    dispose,
    dropBand,
    dropCard,
    reload,
    saveCuratedLabels,
    sizeBand,
  }
}
