import type { BoardStatus, TaskDetail } from '@openforge-app/plugin-sdk/domain'

export type OpenTaskStatus = Exclude<BoardStatus, 'done'>

export type OpenTask = TaskDetail & { status: OpenTaskStatus }

export interface MapCard {
  taskId: string
  title: string
  status: OpenTaskStatus
  x: number
  y: number
}

/** Where a card the user dragged sits, as an offset from its band's own origin. */
export type CardPosition = { region: string | null; x: number; y: number }

export type CardPositions = Record<string, CardPosition>

export const CARD_WIDTH = 220
export const CARD_HEIGHT = 92
export const CARD_GAP = 24
export const CARDS_PER_ROW = 4
export const CANVAS_PADDING = 24

const STATUS_ORDER: Record<OpenTaskStatus, number> = { doing: 0, backlog: 1 }

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

function gridCards(tasks: readonly OpenTask[], originY: number): MapCard[] {
  return tasks.map((task, index) => ({
    taskId: task.id,
    title: cardTitle(task),
    status: task.status,
    x: CANVAS_PADDING + (index % CARDS_PER_ROW) * (CARD_WIDTH + CARD_GAP),
    y: originY + Math.floor(index / CARDS_PER_ROW) * (CARD_HEIGHT + CARD_GAP),
  }))
}

export function layoutCards(tasks: readonly OpenTask[], originY: number): MapCard[] {
  const ordered = [...tasks].sort(byStatusThenId)

  const cards: MapCard[] = []
  let top = originY
  for (const layer of groupByRow(ordered, dependencyRows(ordered))) {
    cards.push(...gridCards(layer, top))
    top += Math.ceil(layer.length / CARDS_PER_ROW) * (CARD_HEIGHT + CARD_GAP)
  }
  return cards
}
