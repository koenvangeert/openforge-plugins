import { describe, expect, it } from 'vitest'
import { buildTaskDetail } from '../__fixtures__/tasks'
import { CANVAS_PADDING, CARD_GAP, CARD_HEIGHT, CARD_WIDTH, CARDS_PER_ROW } from './cards'
import {
  assembleRegions,
  BAND_CONTENT_WIDTH,
  dragCardTo,
  mapExtent,
  OTHER_REGION_TITLE,
  primaryRegionLabel,
  REGION_HEADING_HEIGHT,
  regionTitle,
  seedRegionLabels,
  stalePositionIds,
  withDraggedCard,
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

  it('layers a band without the dependencies that sit in another band', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['api'] }),
        buildTaskDetail({ id: 'T-2', labels: ['auth'], dependsOn: ['T-1'] }),
      ],
      ['auth', 'api'],
    )

    const auth = regionNamed(regions, 'auth')

    expect(auth.cards.map((card) => card.y)).toEqual([auth.y + REGION_HEADING_HEIGHT])
  })

  it('grows a band to hold every dependency row it lays out', () => {
    const chain = [
      buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
      buildTaskDetail({ id: 'T-2', labels: ['auth'], dependsOn: ['T-1'] }),
      buildTaskDetail({ id: 'T-3', labels: ['auth'], dependsOn: ['T-2'] }),
    ]

    const [chained] = assembleRegions(chain, ['auth'])
    const [unchained] = assembleRegions(labelledTasks(3, 'auth'), ['auth'])

    for (const card of chained.cards) {
      expect(card.y + CARD_HEIGHT).toBeLessThanOrEqual(chained.y + chained.height)
    }
    expect(chained.height - unchained.height).toBe((CARD_HEIGHT + CARD_GAP) * 2)
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

describe('assembleRegions stored positions', () => {
  const stored = (region: string | null, x: number, y: number) => ({ region, x, y })

  it('places a card at its stored offset from its own band origin', () => {
    const [auth] = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], ['auth'], {
      'T-1': stored('auth', 140, 30),
    })

    expect(auth.cards[0]).toMatchObject({
      x: CANVAS_PADDING + 140,
      y: auth.y + REGION_HEADING_HEIGHT + 30,
    })
  })

  it('prefers a stored position to the layered placement', () => {
    const chain = [
      buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
      buildTaskDetail({ id: 'T-2', labels: ['auth'], dependsOn: ['T-1'] }),
    ]

    const [laidOut] = assembleRegions(chain, ['auth'])
    const [placed] = assembleRegions(chain, ['auth'], { 'T-2': stored('auth', 0, 0) })

    expect(laidOut.cards[1].y).toBeGreaterThan(laidOut.y + REGION_HEADING_HEIGHT)
    expect(placed.cards[1].y).toBe(placed.y + REGION_HEADING_HEIGHT)
  })

  it('lays out a card again once its band changes, ignoring where it sat before', () => {
    const regions = assembleRegions(
      [buildTaskDetail({ id: 'T-1', labels: ['api'] })],
      ['auth', 'api'],
      { 'T-1': stored('auth', 140, 30) },
    )
    const api = regionNamed(regions, 'api')

    expect(api.cards[0]).toMatchObject({ x: CANVAS_PADDING, y: api.y + REGION_HEADING_HEIGHT })
  })

  it('leaves every card alone for a position stored for a Task off the map', () => {
    const tasks = [buildTaskDetail({ id: 'T-1', labels: ['auth'] })]

    const [untouched] = assembleRegions(tasks, ['auth'])
    const [alongside] = assembleRegions(tasks, ['auth'], { 'T-gone': stored('auth', 140, 300) })

    expect(alongside.cards).toEqual(untouched.cards)
    expect(alongside.height).toBe(untouched.height)
  })

  it('keeps a card at the same offset inside its band when the band above grows', () => {
    const placed = { 'T-x': stored('api', 140, 30) }
    const apiTask = buildTaskDetail({ id: 'T-x', labels: ['api'] })
    const offsetOf = (authTaskCount: number) => {
      const regions = assembleRegions(
        [...labelledTasks(authTaskCount, 'auth'), apiTask],
        ['auth', 'api'],
        placed,
      )
      const api = regionNamed(regions, 'api')
      return { band: api.y, card: api.cards[0].y - api.y }
    }

    const short = offsetOf(1)
    const tall = offsetOf(CARDS_PER_ROW + 1)

    expect(tall.band).toBeGreaterThan(short.band)
    expect(tall.card).toBe(short.card)
    expect(tall.card).toBe(REGION_HEADING_HEIGHT + 30)
  })

  it('clamps a stored position back under its own band heading', () => {
    const [auth] = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], ['auth'], {
      'T-1': stored('auth', 0, -500),
    })

    expect(auth.cards[0].y).toBe(auth.y + REGION_HEADING_HEIGHT)
  })

  it('clamps a stored position back inside the left and right edges', () => {
    const [left] = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], ['auth'], {
      'T-1': stored('auth', -500, 0),
    })
    const [right] = assembleRegions([buildTaskDetail({ id: 'T-1', labels: ['auth'] })], ['auth'], {
      'T-1': stored('auth', 5000, 0),
    })

    expect(left.cards[0].x).toBe(CANVAS_PADDING)
    expect(right.cards[0].x).toBe(CANVAS_PADDING + BAND_CONTENT_WIDTH - CARD_WIDTH)
  })

  it('grows the band to hold a card stored below its laid-out rows', () => {
    const task = [buildTaskDetail({ id: 'T-1', labels: ['auth'] })]

    const [laidOut] = assembleRegions(task, ['auth'])
    const [dropped] = assembleRegions(task, ['auth'], { 'T-1': stored('auth', 0, 400) })

    expect(dropped.height).toBe(laidOut.height + 400)
    expect(dropped.cards[0].y + CARD_HEIGHT).toBeLessThanOrEqual(dropped.y + dropped.height)
  })
})

describe('dragCardTo', () => {
  const regions = assembleRegions(
    [
      buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
      buildTaskDetail({ id: 'T-2' }),
    ],
    ['auth'],
  )
  const auth = regionNamed(regions, 'auth')

  it('gives the band-relative position a drag comes to rest at', () => {
    const rested = dragCardTo(regions, 'T-1', {
      x: CANVAS_PADDING + 140,
      y: auth.y + REGION_HEADING_HEIGHT + 30,
    })

    expect(rested).toEqual({ region: 'auth', x: 140, y: 30 })
  })

  it('returns a drag above its own band heading to just under it', () => {
    expect(dragCardTo(regions, 'T-1', { x: CANVAS_PADDING, y: -800 })).toEqual({
      region: 'auth',
      x: 0,
      y: 0,
    })
  })

  it('returns a drag past the left or right edge to inside the band', () => {
    const origin = { y: auth.y + REGION_HEADING_HEIGHT }

    expect(dragCardTo(regions, 'T-1', { x: -800, ...origin })?.x).toBe(0)
    expect(dragCardTo(regions, 'T-1', { x: 8000, ...origin })?.x).toBe(
      BAND_CONTENT_WIDTH - CARD_WIDTH,
    )
  })

  it('names the band a card with no curated label sits in', () => {
    const other = regionNamed(regions, OTHER_REGION_TITLE)

    expect(
      dragCardTo(regions, 'T-2', { x: CANVAS_PADDING, y: other.y + REGION_HEADING_HEIGHT })?.region,
    ).toBeNull()
  })

  it('has no position for a Task that is not on the map', () => {
    expect(dragCardTo(regions, 'T-gone', { x: 0, y: 0 })).toBeNull()
  })
})

describe('stalePositionIds', () => {
  const positions = {
    'T-1': { region: 'auth', x: 10, y: 10 },
    'T-2': { region: 'api', x: 20, y: 20 },
  }

  it('names a Task on the map whose band no longer matches its stored one', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['api'] }),
        buildTaskDetail({ id: 'T-2', labels: ['api'] }),
      ],
      ['auth', 'api'],
      positions,
    )

    expect(stalePositionIds(regions, positions)).toEqual(['T-1'])
  })

  it('keeps the position of a Task that left the map', () => {
    const regions = assembleRegions(
      [buildTaskDetail({ id: 'T-1', labels: ['auth'] })],
      ['auth', 'api'],
      positions,
    )

    expect(stalePositionIds(regions, positions)).toEqual([])
  })

  it('names nothing when every stored band still holds its Task', () => {
    const regions = assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-2', labels: ['api'] }),
      ],
      ['auth', 'api'],
      positions,
    )

    expect(stalePositionIds(regions, positions)).toEqual([])
  })
})

describe('withDraggedCard', () => {
  const twoBands = () =>
    assembleRegions(
      [
        buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
        buildTaskDetail({ id: 'T-2', labels: ['api'] }),
      ],
      ['auth', 'api'],
    )

  it('moves the dragged card to the position it holds', () => {
    const dragged = withDraggedCard(twoBands(), 'T-1', { region: 'auth', x: 40, y: 300 })
    const auth = regionNamed(dragged, 'auth')

    expect(auth.cards[0]).toMatchObject({
      taskId: 'T-1',
      x: CANVAS_PADDING + 40,
      y: auth.y + REGION_HEADING_HEIGHT + 300,
    })
  })

  it('grows the band around a card dragged below its rows', () => {
    const before = twoBands()
    const dragged = withDraggedCard(before, 'T-1', { region: 'auth', x: 0, y: 300 })

    expect(regionNamed(dragged, 'auth').height - regionNamed(before, 'auth').height).toBe(300)
  })

  it('pushes the bands below the grown band down by what it grew', () => {
    const before = twoBands()
    const dragged = withDraggedCard(before, 'T-1', { region: 'auth', x: 0, y: 300 })

    expect(regionNamed(dragged, 'api').y - regionNamed(before, 'api').y).toBe(300)
    expect(regionNamed(dragged, 'api').cards[0].y - regionNamed(before, 'api').cards[0].y).toBe(300)
  })

  it('leaves a band above the dragged card where it was', () => {
    const before = twoBands()
    const dragged = withDraggedCard(before, 'T-2', { region: 'api', x: 0, y: 300 })

    expect(regionNamed(dragged, 'auth')).toEqual(regionNamed(before, 'auth'))
  })

  it('changes no height for a card dragged within the rows its band already holds', () => {
    const before = twoBands()
    const dragged = withDraggedCard(before, 'T-1', { region: 'auth', x: 60, y: 0 })

    expect(dragged.map((region) => [region.y, region.height])).toEqual(
      before.map((region) => [region.y, region.height]),
    )
  })

  it('leaves the map alone for a position belonging to another band', () => {
    const before = twoBands()

    expect(withDraggedCard(before, 'T-1', { region: 'api', x: 0, y: 300 })).toEqual(before)
  })

  it('leaves the map alone for a Task it does not hold', () => {
    const before = twoBands()

    expect(withDraggedCard(before, 'T-9', { region: 'auth', x: 0, y: 300 })).toEqual(before)
  })
})
