import { describe, expect, it } from 'vitest'
import { buildTaskDetail, type TaskDetailOverrides } from '../__fixtures__/tasks'
import {
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  cardKey,
  cardTitle,
  isOpen,
  layoutCards,
  type CardSlot,
  type OpenTask,
} from './cards'

const PER_ROW = 4

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

describe('cardKey', () => {
  it('tells the two cards of a Task drawn in two Bands apart', () => {
    expect(cardKey('auth', 'T-1')).not.toBe(cardKey('api', 'T-1'))
  })

  it('tells a Band from the Other Band of the same name', () => {
    expect(cardKey(null, 'T-1')).not.toBe(cardKey('null', 'T-1'))
  })

  it('survives a separator character inside a label name', () => {
    expect(cardKey('a"b', 'T-1')).not.toBe(cardKey('a', '"b","T-1'))
  })
})

describe('layoutCards', () => {
  it('lays out one card per Task', () => {
    const tasks = Array.from({ length: 12 }, (_, index) =>
      openTask({ id: `T-${String(index).padStart(2, '0')}` }),
    )

    expect(new Set(layoutCards(tasks, PER_ROW).map((slot) => slot.taskId)).size).toBe(12)
  })

  it('orders doing before backlog, then by Task id', () => {
    const slots = layoutCards(
      [
        openTask({ id: 'T-3' }),
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-4', status: 'doing' }),
        openTask({ id: 'T-2', status: 'doing' }),
      ],
      PER_ROW,
    )

    expect(slots.map((slot) => slot.taskId)).toEqual(['T-2', 'T-4', 'T-1', 'T-3'])
  })

  it('wraps the grid after a full row, from the Band content origin', () => {
    const tasks = Array.from({ length: PER_ROW + 1 }, (_, index) => openTask({ id: `T-${index}` }))

    const slots = layoutCards(tasks, PER_ROW)

    expect(slots[0]).toMatchObject({ x: 0, y: 0 })
    expect(slots[1]).toMatchObject({ x: CARD_WIDTH + CARD_GAP, y: 0 })
    expect(slots[PER_ROW]).toMatchObject({ x: 0, y: CARD_HEIGHT + CARD_GAP })
  })

  it('reflows into more rows when the Band holds fewer cards per row', () => {
    const tasks = Array.from({ length: 4 }, (_, index) => openTask({ id: `T-${index}` }))

    const narrow = layoutCards(tasks, 2)

    expect(narrow.map((slot) => slot.y)).toEqual([0, 0, CARD_HEIGHT + CARD_GAP, CARD_HEIGHT + CARD_GAP])
  })

  it('keeps one card per row rather than dividing by zero', () => {
    const tasks = [openTask({ id: 'T-1' }), openTask({ id: 'T-2' })]

    expect(layoutCards(tasks, 0).map((slot) => slot.x)).toEqual([0, 0])
  })

  it('keeps every card status', () => {
    const slots = layoutCards(
      [openTask({ id: 'T-1', status: 'doing' }), openTask({ id: 'T-2' })],
      PER_ROW,
    )

    expect(slots.map((slot) => slot.status)).toEqual(['doing', 'backlog'])
  })

  it('leaves the caller list untouched', () => {
    const tasks = [openTask({ id: 'T-2' }), openTask({ id: 'T-1' })]

    layoutCards(tasks, PER_ROW)

    expect(tasks.map((task) => task.id)).toEqual(['T-2', 'T-1'])
  })
})

describe('layoutCards layering', () => {
  function rowOf(slots: CardSlot[], taskId: string): number {
    const slot = slots.find((candidate) => candidate.taskId === taskId)
    if (!slot) throw new Error(`no card for ${taskId}`)
    return Math.round(slot.y / (CARD_HEIGHT + CARD_GAP))
  }

  it('puts a Task on a later row than the Task it depends on', () => {
    const slots = layoutCards(
      [
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-2'] }),
      ],
      PER_ROW,
    )

    expect(rowOf(slots, 'T-1')).toBe(0)
    expect(rowOf(slots, 'T-2')).toBe(1)
    expect(rowOf(slots, 'T-3')).toBe(2)
  })

  it('layers a diamond so the joining Task sits below both branches', () => {
    const slots = layoutCards(
      [
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-1'] }),
        openTask({ id: 'T-4', dependsOn: ['T-2', 'T-3'] }),
      ],
      PER_ROW,
    )

    expect(rowOf(slots, 'T-1')).toBe(0)
    expect(rowOf(slots, 'T-2')).toBe(1)
    expect(rowOf(slots, 'T-3')).toBe(1)
    expect(rowOf(slots, 'T-4')).toBe(2)
  })

  it('puts both Tasks of a two-Task cycle on the first row', () => {
    const slots = layoutCards(
      [openTask({ id: 'T-1', dependsOn: ['T-2'] }), openTask({ id: 'T-2', dependsOn: ['T-1'] })],
      PER_ROW,
    )

    expect(rowOf(slots, 'T-1')).toBe(0)
    expect(rowOf(slots, 'T-2')).toBe(0)
  })

  it('puts every Task of a three-Task cycle on the first row', () => {
    const slots = layoutCards(
      [
        openTask({ id: 'T-1', dependsOn: ['T-3'] }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-2'] }),
      ],
      PER_ROW,
    )

    expect(slots.map((slot) => rowOf(slots, slot.taskId))).toEqual([0, 0, 0])
  })

  it('keeps layering a Task that waits on a cycle', () => {
    const slots = layoutCards(
      [
        openTask({ id: 'T-1', dependsOn: ['T-2'] }),
        openTask({ id: 'T-2', dependsOn: ['T-1'] }),
        openTask({ id: 'T-3', dependsOn: ['T-1'] }),
      ],
      PER_ROW,
    )

    expect(rowOf(slots, 'T-3')).toBe(1)
  })

  it('ignores a Task that depends on itself', () => {
    const slots = layoutCards(
      [openTask({ id: 'T-1' }), openTask({ id: 'T-2', dependsOn: ['T-2', 'T-1'] })],
      PER_ROW,
    )

    expect(rowOf(slots, 'T-2')).toBe(1)
  })

  it('ignores a dependency on a Task that is not in the list', () => {
    const slots = layoutCards([openTask({ id: 'T-1', dependsOn: ['T-99'] })], PER_ROW)

    expect(rowOf(slots, 'T-1')).toBe(0)
  })

  it('wraps a full row and starts the next dependency row below the wrap', () => {
    const blockers = Array.from({ length: PER_ROW + 1 }, (_, index) => openTask({ id: `T-${index}` }))
    const slots = layoutCards([...blockers, openTask({ id: 'T-last', dependsOn: ['T-0'] })], PER_ROW)

    expect(rowOf(slots, `T-${PER_ROW}`)).toBe(1)
    expect(rowOf(slots, 'T-last')).toBe(2)
    expect(slots.find((slot) => slot.taskId === 'T-last')?.x).toBe(0)
  })

  it('lays out the same rows however the Tasks arrive', () => {
    const tasks = [
      openTask({ id: 'T-1' }),
      openTask({ id: 'T-2', dependsOn: ['T-1'] }),
      openTask({ id: 'T-3', status: 'doing', dependsOn: ['T-1'] }),
      openTask({ id: 'T-4', dependsOn: ['T-2', 'T-3'] }),
    ]

    expect(layoutCards([...tasks].reverse(), PER_ROW)).toEqual(layoutCards(tasks, PER_ROW))
  })

  it('keeps a cycle member below the blocker it waits on outside the cycle', () => {
    const slots = layoutCards(
      [
        openTask({ id: 'T-1' }),
        openTask({ id: 'T-2', dependsOn: ['T-1', 'T-3'] }),
        openTask({ id: 'T-3', dependsOn: ['T-2'] }),
        openTask({ id: 'T-4', dependsOn: ['T-2'] }),
      ],
      PER_ROW,
    )

    expect(rowOf(slots, 'T-1')).toBe(0)
    expect(rowOf(slots, 'T-2')).toBe(1)
    expect(rowOf(slots, 'T-4')).toBe(2)
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
