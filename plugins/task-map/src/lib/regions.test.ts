import { describe, expect, it } from 'vitest'
import { buildTaskDetail } from '../__fixtures__/tasks'
import { CANVAS_PADDING, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, CARDS_PER_ROW } from './cards'
import {
  assembleRegions,
  mapExtent,
  OTHER_REGION_TITLE,
  primaryRegionLabel,
  REGION_HEADING_HEIGHT,
  regionTitle,
  seedRegionLabels,
  type MapRegion,
} from './regions'

function titles(regions: readonly MapRegion[]): string[] {
  return regions.map(regionTitle)
}

function regionNamed(regions: readonly MapRegion[], title: string): MapRegion {
  const found = regions.find((region) => regionTitle(region) === title)
  if (!found) throw new Error(`no region titled ${title}, only ${titles(regions).join(', ')}`)
  return found
}

function cardIdsIn(regions: readonly MapRegion[], title: string): string[] {
  return regionNamed(regions, title).cards.map((card) => card.taskId)
}

function labelledTasks(count: number, label: string) {
  return Array.from({ length: count }, (_, index) =>
    buildTaskDetail({ id: `T-${index}`, labels: [label] }),
  )
}

describe('seedRegionLabels', () => {
  it('seeds every Task Label the active Tasks carry', () => {
    const labels = seedRegionLabels([
      buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
      buildTaskDetail({ id: 'T-2', labels: ['api', 'auth'] }),
    ])

    expect(labels).toEqual(['api', 'auth'])
  })

  it('offers no label that only a Completed Task carries', () => {
    const labels = seedRegionLabels([
      buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
      buildTaskDetail({ id: 'T-2', status: 'done', labels: ['archived'] }),
    ])

    expect(labels).toEqual(['auth'])
  })

  it('seeds nothing when no active Task carries a label', () => {
    expect(seedRegionLabels([buildTaskDetail({ id: 'T-1' })])).toEqual([])
  })

  it('leaves the caller list untouched', () => {
    const tasks = [
      buildTaskDetail({ id: 'T-2', labels: ['auth'] }),
      buildTaskDetail({ id: 'T-1', labels: ['api'] }),
    ]

    seedRegionLabels(tasks)

    expect(tasks.map((task) => task.id)).toEqual(['T-2', 'T-1'])
  })
})

describe('primaryRegionLabel', () => {
  it('takes the first curated label the Task carries', () => {
    const task = buildTaskDetail({ labels: ['api', 'auth'] })

    expect(primaryRegionLabel(task, ['auth', 'api'])).toBe('auth')
    expect(primaryRegionLabel(task, ['api', 'auth'])).toBe('api')
  })

  it('ignores a label the Task carries that is not curated', () => {
    expect(primaryRegionLabel(buildTaskDetail({ labels: ['ops', 'api'] }), ['api'])).toBe('api')
  })

  it('has no label for a Task carrying none of the curated labels', () => {
    expect(primaryRegionLabel(buildTaskDetail({ labels: ['ops'] }), ['auth'])).toBeNull()
    expect(primaryRegionLabel(buildTaskDetail({}), ['auth'])).toBeNull()
  })
})

describe('assembleRegions bands', () => {
  it('draws one band per curated label in curated order, with Other last', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], [
      'auth',
      'api',
    ])

    expect(titles(regions)).toEqual(['auth', 'api', OTHER_REGION_TITLE])
  })

  it('gives the trailing Other band no Task Label of its own', () => {
    const regions = assembleRegions([], ['auth'])

    expect(regions.map((region) => region.label)).toEqual(['auth', null])
  })

  it('always draws the Other band, even with no Task and no curated label', () => {
    expect(titles(assembleRegions([], []))).toEqual([OTHER_REGION_TITLE])
  })

  it('draws the Other band even when every Task carries a curated label', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], ['auth'])

    expect(cardIdsIn(regions, OTHER_REGION_TITLE)).toEqual([])
  })

  it('draws only the Other band when no label is curated', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], [])

    expect(titles(regions)).toEqual([OTHER_REGION_TITLE])
    expect(cardIdsIn(regions, OTHER_REGION_TITLE)).toEqual(['T-1'])
  })

  it('keeps a repeated curated label to one band', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], [
      'auth',
      'auth',
    ])

    expect(titles(regions)).toEqual(['auth', OTHER_REGION_TITLE])
    expect(cardIdsIn(regions, 'auth')).toEqual(['T-1'])
  })

  it('leaves the caller lists untouched', () => {
    const tasks = [
      buildTaskDetail({ id: 'T-2', labels: ['auth'] }),
      buildTaskDetail({ id: 'T-1', labels: ['api'] }),
    ]
    const curated = ['auth', 'api']

    assembleRegions(tasks, curated)

    expect(tasks.map((task) => task.id)).toEqual(['T-2', 'T-1'])
    expect(curated).toEqual(['auth', 'api'])
  })
})

describe('assembleRegions primary label', () => {
  it('draws one card in the first curated label a Task carries, and none in the others', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth', 'api'] })], [
      'auth',
      'api',
    ])

    expect(cardIdsIn(regions, 'auth')).toEqual(['T-1'])
    expect(cardIdsIn(regions, 'api')).toEqual([])
  })

  it('moves that card when the curated order is reversed', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth', 'api'] })], [
      'api',
      'auth',
    ])

    expect(cardIdsIn(regions, 'api')).toEqual(['T-1'])
    expect(cardIdsIn(regions, 'auth')).toEqual([])
  })

  it('draws a Task carrying no curated label in the Other band', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['ops'] }),
        buildTaskDetail({ id: 'T-2' }),
        buildTaskDetail({ id: 'T-3', labels: ['auth'] }),
      ],
      ['auth'],
    )

    expect(cardIdsIn(regions, OTHER_REGION_TITLE)).toEqual(['T-1', 'T-2'])
    expect(cardIdsIn(regions, 'auth')).toEqual(['T-3'])
  })

  it('draws an empty band for a curated label no active Task carries', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-2', status: 'done', labels: ['api'] }),
      ],
      ['auth', 'api'],
    )

    expect(titles(regions)).toEqual(['auth', 'api', OTHER_REGION_TITLE])
    expect(cardIdsIn(regions, 'api')).toEqual([])
  })

  it('draws no card for a Completed Task', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-2', status: 'done', labels: ['auth'] }),
      ],
      ['auth'],
    )

    expect(cardIdsIn(regions, 'auth')).toEqual(['T-1'])
  })

  it('draws each active Task exactly once across every band', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['auth', 'api', 'ops'] }),
        buildTaskDetail({ id: 'T-2', labels: ['api'] }),
        buildTaskDetail({ id: 'T-3' }),
      ],
      ['auth', 'api'],
    )

    const drawn = regions.flatMap((region) => region.cards.map((card) => card.taskId))

    expect(drawn.sort()).toEqual(['T-1', 'T-2', 'T-3'])
  })
})

describe('assembleRegions band geometry', () => {
  it('stacks each band below the one before it', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], [
      'auth',
      'api',
    ])

    expect(regions[0].y).toBe(CANVAS_PADDING)
    for (const [index, region] of regions.slice(1).entries()) {
      const above = regions[index]
      expect(region.y).toBe(above.y + above.height + CARD_GAP)
    }
  })

  it('keeps an empty band as tall as a band holding one card', () => {
    const [empty] = assembleRegions([], ['auth'])
    const [filled] = assembleRegions(labelledTasks(1, 'auth'), ['auth'])

    expect(empty.height).toBe(filled.height)
  })

  it('grows a band by one card row once its cards wrap', () => {
    const [oneRow] = assembleRegions(labelledTasks(CARDS_PER_ROW, 'auth'), ['auth'])
    const [twoRows] = assembleRegions(labelledTasks(CARDS_PER_ROW + 1, 'auth'), ['auth'])

    expect(twoRows.height - oneRow.height).toBe(CARD_HEIGHT + CARD_GAP)
  })

  it('places every card below its own band heading and inside its own band', () => {
    const regions = assembleRegions(
      [...labelledTasks(CARDS_PER_ROW + 1, 'auth'), buildTaskDetail({ id: 'T-x', labels: ['api'] })],
      ['auth', 'api'],
    )

    for (const region of regions) {
      for (const card of region.cards) {
        expect(card.y).toBeGreaterThanOrEqual(region.y + REGION_HEADING_HEIGHT)
        expect(card.y + CARD_HEIGHT).toBeLessThanOrEqual(region.y + region.height)
      }
    }
  })

  it('wraps a band after a full row of cards', () => {
    const [auth] = assembleRegions(labelledTasks(CARDS_PER_ROW + 1, 'auth'), ['auth'])
    const top = auth.y + REGION_HEADING_HEIGHT

    expect(auth.cards[0]).toMatchObject({ x: CANVAS_PADDING, y: top })
    expect(auth.cards[1]).toMatchObject({ x: CANVAS_PADDING + CARD_WIDTH + CARD_GAP, y: top })
    expect(auth.cards[CARDS_PER_ROW]).toMatchObject({
      x: CANVAS_PADDING,
      y: top + CARD_HEIGHT + CARD_GAP,
    })
  })

  it('orders a band doing before backlog, then by Task id', () => {
    const [auth] = assembleRegions(
      [
        buildTaskDetail({ id: 'T-3', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-4', status: 'doing', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-2', status: 'doing', labels: ['auth'] }),
      ],
      ['auth'],
    )

    expect(auth.cards.map((card) => card.taskId)).toEqual(['T-2', 'T-4', 'T-1', 'T-3'])
  })
})

describe('mapExtent', () => {
  it('takes its width from the fullest band', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-2', labels: ['api'] }),
        buildTaskDetail({ id: 'T-3', labels: ['api'] }),
      ],
      ['auth', 'api'],
    )

    expect(mapExtent(regions).width).toBe(CANVAS_PADDING * 2 + CARD_WIDTH * 2 + CARD_GAP)
  })

  it('caps its width at a full row of cards', () => {
    expect(mapExtent(assembleRegions(labelledTasks(CARDS_PER_ROW + 2, 'auth'), ['auth'])).width).toBe(
      CANVAS_PADDING * 2 + CARD_WIDTH * CARDS_PER_ROW + CARD_GAP * (CARDS_PER_ROW - 1),
    )
  })

  it('reaches from the canvas edge to the bottom of the last band', () => {
    const regions = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], ['auth'])
    const last = regions[regions.length - 1]

    expect(mapExtent(regions).height).toBe(last.y + last.height + CANVAS_PADDING)
  })

  it('stays a usable size with no band at all', () => {
    expect(mapExtent([])).toEqual({
      width: CANVAS_PADDING * 2 + CARD_WIDTH,
      height: CANVAS_PADDING * 2,
    })
  })
})
