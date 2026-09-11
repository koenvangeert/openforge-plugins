import type { BoardStatus, TaskDetail } from '@openforge-app/plugin-sdk/domain'

export type OpenTaskStatus = Exclude<BoardStatus, 'done'>

export interface MapCard {
  taskId: string
  label: string
  status: OpenTaskStatus
  x: number
  y: number
}

export interface MapExtent {
  width: number
  height: number
}

export const CARD_WIDTH = 220
export const CARD_HEIGHT = 92
export const CARD_GAP = 24
export const CARDS_PER_ROW = 4
export const CANVAS_PADDING = 24

const STATUS_ORDER: Record<OpenTaskStatus, number> = { doing: 0, backlog: 1 }

type OpenTask = TaskDetail & { status: OpenTaskStatus }

export function isOpen(task: TaskDetail): task is OpenTask {
  return task.status !== 'done'
}

function byStatusThenId(left: OpenTask, right: OpenTask): number {
  const statusOrder = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
  if (statusOrder !== 0) return statusOrder
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

export function cardLabel(task: TaskDetail): string {
  return task.title.trim() || task.id
}

export function placeCards(tasks: readonly TaskDetail[]): MapCard[] {
  return tasks
    .filter(isOpen)
    .sort(byStatusThenId)
    .map((task, index) => ({
      taskId: task.id,
      label: cardLabel(task),
      status: task.status,
      x: CANVAS_PADDING + (index % CARDS_PER_ROW) * (CARD_WIDTH + CARD_GAP),
      y: CANVAS_PADDING + Math.floor(index / CARDS_PER_ROW) * (CARD_HEIGHT + CARD_GAP),
    }))
}

export function mapExtent(cards: readonly MapCard[]): MapExtent {
  const columns = Math.min(Math.max(cards.length, 1), CARDS_PER_ROW)
  const rows = Math.max(Math.ceil(cards.length / CARDS_PER_ROW), 1)
  return {
    width: CANVAS_PADDING * 2 + columns * CARD_WIDTH + (columns - 1) * CARD_GAP,
    height: CANVAS_PADDING * 2 + rows * CARD_HEIGHT + (rows - 1) * CARD_GAP,
  }
}
