import { describe, expect, it } from 'vitest'
import { buildTaskDetail } from '../__fixtures__/tasks'
import {
  CANVAS_PADDING,
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  CARDS_PER_ROW,
  cardLabel,
  mapExtent,
  placeCards,
} from './cards'

describe('placeCards', () => {
  it('draws one card per Task', () => {
    const tasks = Array.from({ length: 12 }, (_, index) =>
      buildTaskDetail({ id: `T-${String(index).padStart(2, '0')}` }),
    )

    expect(placeCards(tasks)).toHaveLength(12)
    expect(new Set(placeCards(tasks).map((card) => card.taskId)).size).toBe(12)
  })

  it('drops a Completed Task', () => {
    const cards = placeCards([
      buildTaskDetail({ id: 'T-1' }),
      buildTaskDetail({ id: 'T-2', status: 'done' }),
    ])

    expect(cards.map((card) => card.taskId)).toEqual(['T-1'])
  })

  it('orders doing before backlog, then by Task id', () => {
    const cards = placeCards([
      buildTaskDetail({ id: 'T-3' }),
      buildTaskDetail({ id: 'T-1' }),
      buildTaskDetail({ id: 'T-4', status: 'doing' }),
      buildTaskDetail({ id: 'T-2', status: 'doing' }),
    ])

    expect(cards.map((card) => card.taskId)).toEqual(['T-2', 'T-4', 'T-1', 'T-3'])
  })

  it('leaves the caller list untouched', () => {
    const tasks = [buildTaskDetail({ id: 'T-2' }), buildTaskDetail({ id: 'T-1' })]

    placeCards(tasks)

    expect(tasks.map((task) => task.id)).toEqual(['T-2', 'T-1'])
  })

  it('wraps the grid after a full row', () => {
    const tasks = Array.from({ length: CARDS_PER_ROW + 1 }, (_, index) =>
      buildTaskDetail({ id: `T-${index}` }),
    )

    const cards = placeCards(tasks)

    expect(cards[0]).toMatchObject({ x: CANVAS_PADDING, y: CANVAS_PADDING })
    expect(cards[1]).toMatchObject({ x: CANVAS_PADDING + CARD_WIDTH + CARD_GAP, y: CANVAS_PADDING })
    expect(cards[CARDS_PER_ROW]).toMatchObject({
      x: CANVAS_PADDING,
      y: CANVAS_PADDING + CARD_HEIGHT + CARD_GAP,
    })
  })

  it('keeps every card status', () => {
    const cards = placeCards([
      buildTaskDetail({ id: 'T-1', status: 'doing' }),
      buildTaskDetail({ id: 'T-2', status: 'backlog' }),
    ])

    expect(cards.map((card) => card.status)).toEqual(['doing', 'backlog'])
  })
})

describe('cardLabel', () => {
  it('uses the Task title', () => {
    expect(cardLabel(buildTaskDetail({ title: 'Rotate the tokens' }))).toBe('Rotate the tokens')
  })

  it('falls back to the Task id for an empty title', () => {
    expect(cardLabel(buildTaskDetail({ id: 'T-9', title: '' }))).toBe('T-9')
  })

  it('falls back to the Task id for a whitespace-only title', () => {
    expect(cardLabel(buildTaskDetail({ id: 'T-9', title: '   ' }))).toBe('T-9')
  })
})

describe('mapExtent', () => {
  it('fits one row to its cards', () => {
    const cards = placeCards([buildTaskDetail({ id: 'T-1' }), buildTaskDetail({ id: 'T-2' })])

    expect(mapExtent(cards)).toEqual({
      width: CANVAS_PADDING * 2 + CARD_WIDTH * 2 + CARD_GAP,
      height: CANVAS_PADDING * 2 + CARD_HEIGHT,
    })
  })

  it('grows by row once the grid wraps', () => {
    const cards = placeCards(
      Array.from({ length: CARDS_PER_ROW + 1 }, (_, index) => buildTaskDetail({ id: `T-${index}` })),
    )

    expect(mapExtent(cards)).toEqual({
      width: CANVAS_PADDING * 2 + CARD_WIDTH * CARDS_PER_ROW + CARD_GAP * (CARDS_PER_ROW - 1),
      height: CANVAS_PADDING * 2 + CARD_HEIGHT * 2 + CARD_GAP,
    })
  })

  it('stays a usable size with no cards', () => {
    expect(mapExtent([])).toEqual({
      width: CANVAS_PADDING * 2 + CARD_WIDTH,
      height: CANVAS_PADDING * 2 + CARD_HEIGHT,
    })
  })
})
