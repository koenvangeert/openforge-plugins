import type { PluginStorage } from '@openforge-app/plugin-sdk'
import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import type { CardPosition, CardPositions } from './cards'
import { seedRegionLabels } from './regions'

const REGION_LABELS_KEY = 'regionLabels'
const CARD_POSITIONS_KEY = 'cardPositions'

// Storage offers no atomic update, so two overlapping read-modify-write cycles
// would read the same snapshot and the later `set` would erase the earlier card.
// Reads share the chain so a re-read never misses a position already dropped.
const projectAccess = new Map<string, Promise<unknown>>()

function serializePerProject<T>(projectId: string, work: () => Promise<T>): Promise<T> {
  const previous = projectAccess.get(projectId) ?? Promise.resolve()
  // Runs whether the one before it settled or failed: one caller's failure must
  // not strand every later access for that Project.
  const next = previous.catch(() => undefined).then(work)
  projectAccess.set(
    projectId,
    next.catch(() => undefined),
  )
  return next
}

export function readCardPositions(
  storage: PluginStorage,
  projectId: string,
): Promise<CardPositions> {
  return serializePerProject(projectId, async () => {
    const stored = await storage.project(projectId).get<CardPositions>(CARD_POSITIONS_KEY)
    return stored ?? {}
  })
}

export function writeCardPosition(
  storage: PluginStorage,
  projectId: string,
  taskId: string,
  position: CardPosition,
): Promise<void> {
  return serializePerProject(projectId, async () => {
    const stored = await storage.project(projectId).get<CardPositions>(CARD_POSITIONS_KEY)
    await storage
      .project(projectId)
      .set<CardPositions>(CARD_POSITIONS_KEY, { ...stored, [taskId]: position })
  })
}

export function forgetCardPositions(
  storage: PluginStorage,
  projectId: string,
  taskIds: readonly string[],
): Promise<void> {
  return serializePerProject(projectId, async () => {
    const stored = await storage.project(projectId).get<CardPositions>(CARD_POSITIONS_KEY)
    const kept = Object.fromEntries(
      Object.entries(stored ?? {}).filter(([taskId]) => !taskIds.includes(taskId)),
    )
    await storage.project(projectId).set<CardPositions>(CARD_POSITIONS_KEY, kept)
  })
}

export function readRegionLabels(
  storage: PluginStorage,
  projectId: string,
): Promise<string[] | null> {
  return serializePerProject(projectId, () =>
    storage.project(projectId).get<string[]>(REGION_LABELS_KEY),
  )
}

export function writeRegionLabels(
  storage: PluginStorage,
  projectId: string,
  labels: readonly string[],
): Promise<void> {
  return serializePerProject(projectId, () =>
    storage.project(projectId).set<string[]>(REGION_LABELS_KEY, [...labels]),
  )
}

export async function resolveRegionLabels(
  storage: PluginStorage,
  projectId: string,
  tasks: readonly TaskDetail[],
): Promise<string[]> {
  const stored = await readRegionLabels(storage, projectId)
  if (stored !== null) return stored

  const seeded = seedRegionLabels(tasks)
  // A stored empty list is the order the user cleared, so an empty seed must stay
  // unwritten rather than lock the Project out of ever seeding.
  if (seeded.length > 0) await writeRegionLabels(storage, projectId, seeded)
  return seeded
}
