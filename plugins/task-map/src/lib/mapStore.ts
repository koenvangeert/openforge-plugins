import type { JsonValue, PluginStorage } from '@openforge-app/plugin-sdk'
import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import type { CardPosition, CardPositions } from './cards'
import { seedBands, type Band } from './bands'

const BANDS_KEY = 'bands'
const CARD_POSITIONS_KEY = 'cardPositions'

// Storage offers no atomic update, so two overlapping read-modify-write cycles
// would read the same snapshot and the later `set` would erase the earlier card.
// Reads share the chain so a re-read never misses a placement already written.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLabel(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isBand(value: unknown): value is Band {
  return (
    isRecord(value) &&
    isLabel(value.label) &&
    ['x', 'y', 'width', 'height'].every((side) => Number.isFinite(value[side]))
  )
}

function isCardPosition(value: unknown): value is CardPosition {
  return (
    isRecord(value) &&
    isLabel(value.band) &&
    typeof value.taskId === 'string' &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  )
}

// A stored value of the wrong shape is a map the user cannot open, so an
// unreadable entry is dropped rather than allowed to reach the layout.
function readArray<T>(value: unknown, isEntry: (entry: unknown) => entry is T): T[] | null {
  if (!Array.isArray(value)) return null
  return value.filter(isEntry)
}

export function readBands(storage: PluginStorage, projectId: string): Promise<Band[] | null> {
  return serializePerProject(projectId, async () => {
    const stored = await storage.project(projectId).get<JsonValue>(BANDS_KEY)
    return readArray(stored, isBand)
  })
}

export function writeBands(
  storage: PluginStorage,
  projectId: string,
  bands: readonly Band[],
): Promise<void> {
  return serializePerProject(projectId, () =>
    storage.project(projectId).set<Band[]>(BANDS_KEY, [...bands]),
  )
}

export function readCardPositions(
  storage: PluginStorage,
  projectId: string,
): Promise<CardPositions> {
  return serializePerProject(projectId, async () => {
    const stored = await storage.project(projectId).get<JsonValue>(CARD_POSITIONS_KEY)
    return readArray(stored, isCardPosition) ?? []
  })
}

export function writeCardPosition(
  storage: PluginStorage,
  projectId: string,
  position: CardPosition,
): Promise<void> {
  return serializePerProject(projectId, async () => {
    const stored = await storage.project(projectId).get<JsonValue>(CARD_POSITIONS_KEY)
    const kept = (readArray(stored, isCardPosition) ?? []).filter(
      (entry) => entry.taskId !== position.taskId || entry.band !== position.band,
    )
    await storage.project(projectId).set<CardPositions>(CARD_POSITIONS_KEY, [...kept, position])
  })
}

export async function resolveBands(
  storage: PluginStorage,
  projectId: string,
  tasks: readonly TaskDetail[],
): Promise<Band[]> {
  const stored = await readBands(storage, projectId)
  if (stored !== null && stored.length > 0) return stored

  const seeded = seedBands(tasks)
  await writeBands(storage, projectId, seeded)
  return seeded
}
