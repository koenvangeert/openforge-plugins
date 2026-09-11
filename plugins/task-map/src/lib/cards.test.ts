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
  type MapCard,
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

const ORIGIN = 500

describe('layoutCards layering', () => {
  function rowOf(cards: MapCard[], taskId: string): number {
    const card = cards.find((candidate) => candidate.taskId === taskId)
    if (!card) throw new Error(`no card for ${taskId}`)
    return Math.round((card.y - ORIGIN) / (CARD_HEIGHT + CARD_GAP))
  }

  it('puts a Task on a later row than the Task it depends on', () => {
    const cards = layoutCards(
      [
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-2'] }),
      ],
      ORIGIN,
    )

    expect(rowOf(cards, 'T-1')).toBe(0)
    expect(rowOf(cards, 'T-2')).toBe(1)
    expect(rowOf(cards, 'T-3')).toBe(2)
  })

  it('layers a diamond so the joining Task sits below both branches', () => {
    const cards = layoutCards(
      [
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-1'] }),
        openTask({ id: 'T-4', dependsOn: ['T-2', 'T-3'] }),
      ],
      ORIGIN,
    )

    expect(rowOf(cards, 'T-1')).toBe(0)
    expect(rowOf(cards, 'T-2')).toBe(1)
    expect(rowOf(cards, 'T-3')).toBe(1)
    expect(rowOf(cards, 'T-4')).toBe(2)
  })

  it('puts both Tasks of a two-Task cycle on the first row', () => {
    const cards = layoutCards(
      [openTask({ id: 'T-1', dependsOn: ['T-2'] }), openTask({ id: 'T-2', dependsOn: ['T-1'] })],
      ORIGIN,
    )

    expect(rowOf(cards, 'T-1')).toBe(0)
    expect(rowOf(cards, 'T-2')).toBe(0)
  })

  it('puts every Task of a three-Task cycle on the first row', () => {
    const cards = layoutCards(
      [
        openTask({ id: 'T-1', dependsOn: ['T-3'] }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-2'] }),
      ],
      ORIGIN,
    )

    expect(cards.map((card) => rowOf(cards, card.taskId))).toEqual([0, 0, 0])
  })

  it('keeps layering a Task that waits on a cycle', () => {
    const cards = layoutCards(
      [
        openTask({ id: 'T-1', dependsOn: ['T-2'] }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-1'] }),
      ],
      ORIGIN,
    )

    expect(rowOf(cards, 'T-3')).toBe(1)
  })

  it('ignores a Task that depends on itself', () => {
    const cards = layoutCards(
      [openTask({ id: 'T-1' }), openTask({ id: 'T-2', dependsOn: ['T-2', 'T-1'] })],
      ORIGIN,
    )

    expect(rowOf(cards, 'T-2')).toBe(1)
  })

  it('ignores a dependency on a Task that is not in the list', () => {
    const cards = layoutCards([openTask({ id: 'T-1', dependsOn: ['T-99'] })], ORIGIN)

    expect(rowOf(cards, 'T-1')).toBe(0)
  })

  it('wraps a full row and starts the next dependency row below the wrap', () => {
    const blockers = Array.from({ length: CARDS_PER_ROW + 1 }, (_, index) =>
      openTask({ id: `T-${index}` }),
    )
    const cards = layoutCards([...blockers, openTask({ id: 'T-last', dependsOn: ['T-0'] })], ORIGIN)

    expect(rowOf(cards, `T-${CARDS_PER_ROW}`)).toBe(1)
    expect(rowOf(cards, 'T-last')).toBe(2)
    expect(cards.find((card) => card.taskId === 'T-last')?.x).toBe(CANVAS_PADDING)
  })

  it('lays out the same rows however the Tasks arrive', () => {
    const tasks = [
      openTask({ id: 'T-1' }),
      openTask({ id: 'T-2', dependsOn: ['T-1'] }),
      openTask({ id: 'T-3', status: 'doing', dependsOn: ['T-1'] }),
      openTask({ id: 'T-4', dependsOn: ['T-2', 'T-3'] }),
    ]

    expect(layoutCards([...tasks].reverse(), ORIGIN)).toEqual(layoutCards(tasks, ORIGIN))
  })

  it('keeps a cycle member below the blocker it waits on outside the cycle', () => {
    const cards = layoutCards(
      [
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-2', dependsOn: ['T-1', 'T-3'] }),
        openTask({ id: 'T-3', dependsOn: ['T-2'] }),
        openTask({ id: 'T-4', dependsOn: ['T-2'] }),
      ],
      ORIGIN,
    )

    expect(rowOf(cards, 'T-1')).toBe(0)
    expect(rowOf(cards, 'T-2')).toBe(1)
    expect(rowOf(cards, 'T-4')).toBe(2)
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
