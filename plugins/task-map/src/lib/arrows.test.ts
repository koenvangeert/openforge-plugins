import { describe, expect, it } from 'vitest'
import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import { buildTaskDetail } from '../__fixtures__/tasks'
import {
  cardKey,
  CARD_GAP,
  CARD_HEIGHT,
  CARD_WIDTH,
  isOpen,
  layoutCards,
  type MapCard,
} from './cards'
import { arrowPathData, routeArrows, selectArrows } from './arrows'
import { assembleBands, bandCards, seedBands } from './bands'

function drawnCardIds(tasks: readonly TaskDetail[]): string[] {
  return layoutCards(tasks.filter(isOpen), 4).map((slot) => slot.taskId)
}

function card(taskId: string, x: number, y: number, band: string | null = null): MapCard {
  return { key: cardKey(band, taskId), band, taskId, title: taskId, status: 'backlog', x, y }
}

function taskEdges(routed: readonly { dependencyTaskId: string; dependentTaskId: string }[]): string[] {
  return routed.map((one) => `${one.dependencyTaskId}->${one.dependentTaskId}`)
}

describe('selectArrows', () => {
  it('points an arrow from the blocker to the waiter', () => {
    const arrows = selectArrows([
      buildTaskDetail({ id: 'T-1', dependsOn: ['T-2'] }),
      buildTaskDetail({ id: 'T-2' }),
    ])

    expect(arrows).toEqual([{ dependencyTaskId: 'T-2', dependentTaskId: 'T-1' }])
  })

  it('draws one arrow per dependsOn entry', () => {
    const arrows = selectArrows([
      buildTaskDetail({ id: 'T-1', dependsOn: ['T-2', 'T-3'] }),
      buildTaskDetail({ id: 'T-2' }),
      buildTaskDetail({ id: 'T-3' }),
    ])

    expect(arrows).toEqual([
      { dependencyTaskId: 'T-2', dependentTaskId: 'T-1' },
      { dependencyTaskId: 'T-3', dependentTaskId: 'T-1' },
    ])
  })

  it('draws no arrow for a dependency on a Completed Task', () => {
    const tasks = [
      buildTaskDetail({ id: 'T-1', dependsOn: ['T-2'] }),
      buildTaskDetail({ id: 'T-2', status: 'done' }),
    ]

    expect(selectArrows(tasks)).toEqual([])
    expect(drawnCardIds(tasks)).toEqual(['T-1'])
  })

  it('draws no arrow for a dependency on a Task that no longer exists', () => {
    const tasks = [buildTaskDetail({ id: 'T-1', dependsOn: ['T-gone'] })]

    expect(selectArrows(tasks)).toEqual([])
    expect(drawnCardIds(tasks)).toEqual(['T-1'])
  })

  it('draws no arrow out of a Completed Task', () => {
    const arrows = selectArrows([
      buildTaskDetail({ id: 'T-1', status: 'done', dependsOn: ['T-2'] }),
      buildTaskDetail({ id: 'T-2' }),
    ])

    expect(arrows).toEqual([])
  })

  it('drops a dependsOn entry on the Task itself', () => {
    const arrows = selectArrows([buildTaskDetail({ id: 'T-1', dependsOn: ['T-1'] })])

    expect(arrows).toEqual([])
  })

  it('collapses a repeated dependsOn entry into one arrow', () => {
    const arrows = selectArrows([
      buildTaskDetail({ id: 'T-1', dependsOn: ['T-2', 'T-2'] }),
      buildTaskDetail({ id: 'T-2' }),
    ])

    expect(arrows).toEqual([{ dependencyTaskId: 'T-2', dependentTaskId: 'T-1' }])
  })

  it('draws both arrows of a two-Task cycle', () => {
    const arrows = selectArrows([
      buildTaskDetail({ id: 'T-1', dependsOn: ['T-2'] }),
      buildTaskDetail({ id: 'T-2', dependsOn: ['T-1'] }),
    ])

    expect(arrows).toEqual([
      { dependencyTaskId: 'T-2', dependentTaskId: 'T-1' },
      { dependencyTaskId: 'T-1', dependentTaskId: 'T-2' },
    ])
  })

  it('draws every arrow of a three-Task cycle', () => {
    const tasks = [
      buildTaskDetail({ id: 'T-1', dependsOn: ['T-3'] }),
      buildTaskDetail({ id: 'T-2', dependsOn: ['T-1'] }),
      buildTaskDetail({ id: 'T-3', dependsOn: ['T-2'] }),
    ]

    expect(selectArrows(tasks)).toHaveLength(3)
    expect(drawnCardIds(tasks)).toHaveLength(3)
  })

  it('orders arrows by waiter, then by blocker', () => {
    const arrows = selectArrows([
      buildTaskDetail({ id: 'T-2', dependsOn: ['T-3', 'T-1'] }),
      buildTaskDetail({ id: 'T-1', dependsOn: ['T-3'] }),
      buildTaskDetail({ id: 'T-3' }),
    ])

    expect(arrows).toEqual([
      { dependencyTaskId: 'T-3', dependentTaskId: 'T-1' },
      { dependencyTaskId: 'T-1', dependentTaskId: 'T-2' },
      { dependencyTaskId: 'T-3', dependentTaskId: 'T-2' },
    ])
  })

  it('leaves the caller list untouched', () => {
    const tasks = [
      buildTaskDetail({ id: 'T-2', dependsOn: ['T-1'] }),
      buildTaskDetail({ id: 'T-1' }),
    ]

    selectArrows(tasks)

    expect(tasks.map((task) => task.id)).toEqual(['T-2', 'T-1'])
  })
})

describe('routeArrows', () => {
  const arrow = { dependencyTaskId: 'T-1', dependentTaskId: 'T-2' }
  const HALF_CARD = CARD_WIDTH / 2
  const LANE = CARD_GAP / 2

  it('leaves the blocker bottom edge and enters the waiter top edge', () => {
    const [routed] = routeArrows([arrow], [card('T-1', 0, 0), card('T-2', 300, 200)])

    expect(routed.path).toBe(
      arrowPathData([
        { x: HALF_CARD, y: CARD_HEIGHT },
        { x: HALF_CARD, y: CARD_HEIGHT + LANE },
        { x: 300 + HALF_CARD, y: CARD_HEIGHT + LANE },
        { x: 300 + HALF_CARD, y: 200 },
      ]),
    )
  })

  it('draws a straight run when the cards share a centre line', () => {
    const [routed] = routeArrows([arrow], [card('T-1', 0, 0), card('T-2', 0, 200)])

    expect(routed.path).toBe(
      arrowPathData([
        { x: HALF_CARD, y: CARD_HEIGHT },
        { x: HALF_CARD, y: 200 },
      ]),
    )
  })

  it('leaves the blocker top edge and enters the waiter bottom edge when the waiter sits above', () => {
    const [routed] = routeArrows([arrow], [card('T-1', 0, 200), card('T-2', 300, 0)])

    expect(routed.path).toBe(
      arrowPathData([
        { x: HALF_CARD, y: 200 },
        { x: HALF_CARD, y: 200 - LANE },
        { x: 300 + HALF_CARD, y: 200 - LANE },
        { x: 300 + HALF_CARD, y: CARD_HEIGHT },
      ]),
    )
  })

  it('crosses a shared row through the gap under the cards, not over them', () => {
    const [routed] = routeArrows([arrow], [card('T-1', 0, 0), card('T-2', 900, 0)])

    expect(routed.path).toBe(
      arrowPathData([
        { x: HALF_CARD, y: CARD_HEIGHT },
        { x: HALF_CARD, y: CARD_HEIGHT + LANE },
        { x: 900 + HALF_CARD, y: CARD_HEIGHT + LANE },
        { x: 900 + HALF_CARD, y: CARD_HEIGHT },
      ]),
    )
  })

  it('gives two arrows out of one card their own path', () => {
    const routed = routeArrows(
      [arrow, { dependencyTaskId: 'T-1', dependentTaskId: 'T-3' }],
      [card('T-1', 0, 0), card('T-2', 300, 0), card('T-3', 600, 0)],
    )

    expect(routed[0].path).not.toBe(routed[1].path)
  })

  it('routes both arrows of a cycle', () => {
    const routed = routeArrows(
      [arrow, { dependencyTaskId: 'T-2', dependentTaskId: 'T-1' }],
      [card('T-1', 0, 0), card('T-2', 0, 200)],
    )

    expect(taskEdges(routed)).toEqual(['T-1->T-2', 'T-2->T-1'])
    expect(routed[0].path).not.toBe(routed[1].path)
  })

  it('spans the gap between two bands when the cards sit in different ones', () => {
    const tasks = [
      buildTaskDetail({ id: 'T-1', labels: ['api'] }),
      buildTaskDetail({ id: 'T-2', labels: ['auth'], dependsOn: ['T-1'] }),
    ]
    const cards = bandCards(assembleBands(tasks, seedBands(tasks)))
    const blocker = cards.find((one) => one.taskId === 'T-1')!
    const waiter = cards.find((one) => one.taskId === 'T-2')!

    const [routed] = routeArrows(selectArrows(tasks), [blocker, waiter])

    expect(waiter.y).toBeGreaterThan(blocker.y + CARD_HEIGHT)
    expect(routed.path).toBe(
      arrowPathData([
        { x: blocker.x + HALF_CARD, y: blocker.y + CARD_HEIGHT },
        { x: waiter.x + HALF_CARD, y: waiter.y },
      ]),
    )
  })

  it('skips an arrow whose card is not on the map', () => {
    expect(routeArrows([arrow], [card('T-1', 0, 0)])).toEqual([])
  })

  it('draws the edge from each copy of a blocker drawn in two Bands', () => {
    const routed = routeArrows(
      [arrow],
      [card('T-1', 0, 0, 'auth'), card('T-1', 0, 400, 'api'), card('T-2', 300, 800)],
    )

    expect(routed).toHaveLength(2)
    expect(taskEdges(routed)).toEqual(['T-1->T-2', 'T-1->T-2'])
    expect(routed[0].path).not.toBe(routed[1].path)
  })

  it('draws the edge into each copy of a waiter drawn in two Bands', () => {
    const routed = routeArrows(
      [arrow],
      [card('T-1', 0, 0), card('T-2', 0, 400, 'auth'), card('T-2', 300, 800, 'api')],
    )

    expect(routed).toHaveLength(2)
  })

  it('gives every copy pair its own key', () => {
    const routed = routeArrows(
      [arrow],
      [
        card('T-1', 0, 0, 'auth'),
        card('T-1', 0, 200, 'api'),
        card('T-2', 300, 400, 'auth'),
        card('T-2', 300, 600, 'api'),
      ],
    )

    expect(new Set(routed.map((one) => one.key)).size).toBe(4)
  })

  it('joins no two cards standing for the same Task', () => {
    const routed = routeArrows(
      selectArrows([buildTaskDetail({ id: 'T-1', labels: ['auth', 'api'], dependsOn: ['T-1'] })]),
      [card('T-1', 0, 0, 'auth'), card('T-1', 0, 400, 'api')],
    )

    expect(routed).toEqual([])
  })
})

describe('arrowPathData', () => {
  it('writes one move and one line per turn', () => {
    expect(
      arrowPathData([
        { x: 110, y: 92 },
        { x: 110, y: 146 },
        { x: 410, y: 146 },
      ]),
    ).toBe('M110 92 L110 146 L410 146')
  })
})
