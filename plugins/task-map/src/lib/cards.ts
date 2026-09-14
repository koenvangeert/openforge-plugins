import type { BoardStatus, TaskDetail } from '@openforge-app/plugin-sdk/domain'

export type OpenTaskStatus = Exclude<BoardStatus, 'done'>

export type OpenTask = TaskDetail & { status: OpenTaskStatus }

export interface CardSlot {
  taskId: string
  title: string
  status: OpenTaskStatus
  x: number
  y: number
}

export interface MapCard extends CardSlot {
  key: string
  band: string | null
}

// An object literal type, not an interface: only the former satisfies the SDK's
// `JsonValue` constraint, and both this and `Band` are written straight to storage.
export type CardPosition = {
  band: string | null
  taskId: string
  x: number
  y: number
}

export type CardPositions = CardPosition[]

export const CARD_WIDTH = 220
export const CARD_HEIGHT = 92
export const CARD_GAP = 24
export const CANVAS_PADDING = 24

const STATUS_ORDER: Record<OpenTaskStatus, number> = { doing: 0, backlog: 1 }

// JSON rather than a separator: a Task Label name may hold any character.
export function cardKey(band: string | null, taskId: string): string {
  return JSON.stringify([band, taskId])
}

export function isOpen(task: TaskDetail): task is OpenTask {
  return task.status !== 'done'
}

function byStatusThenId(left: OpenTask, right: OpenTask): number {
  const statusOrder = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
  if (statusOrder !== 0) return statusOrder
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

export function cardTitle(task: TaskDetail): string {
  return task.title.trim() || task.id
}

export function dependenciesWithin(
  task: TaskDetail,
  taskIds: ReadonlySet<string>,
): readonly string[] {
  return task.dependsOn.filter((taskId) => taskId !== task.id && taskIds.has(taskId))
}

function bandDependencies(tasks: readonly OpenTask[]): Map<string, readonly string[]> {
  const inBand = new Set(tasks.map((task) => task.id))
  return new Map(tasks.map((task) => [task.id, dependenciesWithin(task, inBand)]))
}

function reaches(
  from: string,
  target: string,
  blockersOf: Map<string, readonly string[]>,
): boolean {
  const seen = new Set<string>()
  function walk(taskId: string): boolean {
    if (seen.has(taskId)) return false
    seen.add(taskId)
    return (blockersOf.get(taskId) ?? []).some(
      (blockerId) => blockerId === target || walk(blockerId),
    )
  }
  return walk(from)
}

function dependencyRows(tasks: readonly OpenTask[]): Map<string, number> {
  const blockersOf = bandDependencies(tasks)

  // Dropping the back edges leaves an acyclic graph, so the longest-path walk
  // terminates and a cycle with no outside blocker lands on the first row.
  const forwardOf = new Map<string, readonly string[]>()
  for (const [taskId, blockers] of blockersOf) {
    forwardOf.set(
      taskId,
      blockers.filter((blockerId) => !reaches(blockerId, taskId, blockersOf)),
    )
  }

  const rows = new Map<string, number>()
  function rowOf(taskId: string): number {
    const known = rows.get(taskId)
    if (known !== undefined) return known
    const row = (forwardOf.get(taskId) ?? []).reduce(
      (deepest, blockerId) => Math.max(deepest, rowOf(blockerId) + 1),
      0,
    )
    rows.set(taskId, row)
    return row
  }

  for (const task of tasks) rowOf(task.id)
  return rows
}

function groupByRow(tasks: readonly OpenTask[], rows: Map<string, number>): OpenTask[][] {
  const layers = new Map<number, OpenTask[]>()
  for (const task of tasks) {
    const row = rows.get(task.id) ?? 0
    const layer = layers.get(row)
    if (layer) layer.push(task)
    else layers.set(row, [task])
  }
  return [...layers.entries()].sort(([left], [right]) => left - right).map(([, layer]) => layer)
}

function gridSlots(tasks: readonly OpenTask[], perRow: number, top: number): CardSlot[] {
  return tasks.map((task, index) => ({
    taskId: task.id,
    title: cardTitle(task),
    status: task.status,
    x: (index % perRow) * (CARD_WIDTH + CARD_GAP),
    y: top + Math.floor(index / perRow) * (CARD_HEIGHT + CARD_GAP),
  }))
}

export function layoutCards(tasks: readonly OpenTask[], perRow: number): CardSlot[] {
  const ordered = [...tasks].sort(byStatusThenId)
  const columns = Math.max(1, Math.floor(perRow))

  const slots: CardSlot[] = []
  let top = 0
  for (const layer of groupByRow(ordered, dependencyRows(ordered))) {
    slots.push(...gridSlots(layer, columns, top))
    top += Math.ceil(layer.length / columns) * (CARD_HEIGHT + CARD_GAP)
  }
  return slots
}
