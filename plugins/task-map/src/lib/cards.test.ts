import { describe, expect, it } from 'vitest'
import { buildTaskDetail, type TaskDetailOverrides } from '../__fixtures__/tasks'
import {
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  CANVAS_PADDING,
  CARDS_PER_ROW,
  cardTitle,
  isOpen,
  layoutCards,
  type OpenTask,
} from './cards'

function openTask(overrides: TaskDetailOverrides = {}): OpenTask {
  const task = buildTaskDetail(overrides)
  if (!isOpen(task)) throw new Error(`${task.id} is Completed, so it is not a map card`)
  return task
}

describe('isOpen', () => {
  it('keeps a backlog and a doing Task, and drops a Completed one', () => {
    expect(isOpen(buildTaskDetail({ status: 'backlog' }))).toBe(true)
    expect(isOpen(buildTaskDetail({ status: 'doing' }))).toBe(true)
    expect(isOpen(buildTaskDetail({ status: 'done' }))).toBe(false)
  })
})

describe('layoutCards', () => {
  it('lays out one card per Task', () => {
    const tasks = Array.from({ length: 12 }, (_, index) =>
      openTask({ id: `T-${String(index).padStart(2, '0')}` }),
    )

    expect(new Set(layoutCards(tasks, 0).map((card) => card.taskId)).size).toBe(12)
  })

  it('orders doing before backlog, then by Task id', () => {
    const cards = layoutCards(
      [
        openTask({ id: 'T-3' }),
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-4', status: 'doing' }),
        openTask({ id: 'T-2', status: 'doing' }),
      ],
      0,
    )

    expect(cards.map((card) => card.taskId)).toEqual(['T-2', 'T-4', 'T-1', 'T-3'])
  })

  it('wraps the grid after a full row, starting from the given origin', () => {
    const tasks = Array.from({ length: CARDS_PER_ROW + 1 }, (_, index) =>
      openTask({ id: `T-${index}` }),
    )

    const cards = layoutCards(tasks, 500)

    expect(cards[0]).toMatchObject({ x: CANVAS_PADDING, y: 500 })
    expect(cards[1]).toMatchObject({ x: CANVAS_PADDING + CARD_WIDTH + CARD_GAP, y: 500 })
    expect(cards[CARDS_PER_ROW]).toMatchObject({
      x: CANVAS_PADDING,
      y: 500 + CARD_HEIGHT + CARD_GAP,
    })
  })

  it('keeps every card status', () => {
    const cards = layoutCards([openTask({ id: 'T-1', status: 'doing' }), openTask({ id: 'T-2' })], 0)

    expect(cards.map((card) => card.status)).toEqual(['doing', 'backlog'])
  })

  it('leaves the caller list untouched', () => {
    const tasks = [openTask({ id: 'T-2' }), openTask({ id: 'T-1' })]

    layoutCards(tasks, 0)

    expect(tasks.map((task) => task.id)).toEqual(['T-2', 'T-1'])
  })
})

describe('cardTitle', () => {
  it('uses the Task title', () => {
    expect(cardTitle(buildTaskDetail({ title: 'Rotate the tokens' }))).toBe('Rotate the tokens')
  })

  it('falls back to the Task id for an empty title', () => {
    expect(cardTitle(buildTaskDetail({ id: 'T-9', title: '' }))).toBe('T-9')
  })

  it('falls back to the Task id for a whitespace-only title', () => {
    expect(cardTitle(buildTaskDetail({ id: 'T-9', title: '   ' }))).toBe('T-9')
  })
})
