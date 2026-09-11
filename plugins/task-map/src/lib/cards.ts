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

export function layoutCards(tasks: readonly OpenTask[], originY: number): MapCard[] {
  return [...tasks].sort(byStatusThenId).map((task, index) => ({
    taskId: task.id,
    title: cardTitle(task),
    status: task.status,
    x: CANVAS_PADDING + (index % CARDS_PER_ROW) * (CARD_WIDTH + CARD_GAP),
    y: originY + Math.floor(index / CARDS_PER_ROW) * (CARD_HEIGHT + CARD_GAP),
  }))
}
