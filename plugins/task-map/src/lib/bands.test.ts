import { describe, expect, it } from 'vitest'
import { buildTaskDetail, type TaskDetailOverrides } from '../__fixtures__/tasks'
import {
  assembleBands,
  bandCards,
  bandTitle,
  bandWidthFor,
  BAND_HEADING_HEIGHT,
  BAND_PADDING,
  cardsPerRow,
  curatedLabels,
  dragCardTo,
  labelsInUse,
  mapExtent,
  MIN_BAND_HEIGHT,
  MIN_BAND_WIDTH,
  moveBand,
  OTHER_BAND_TITLE,
  resizeBand,
  seedBands,
  withCuratedLabels,
  withOtherBand,
  type Band,
  type MapBand,
} from './bands'
import { CARD_GAP, CARD_HEIGHT, CARD_WIDTH, type CardPosition, type MapCard } from './cards'

function task(overrides: TaskDetailOverrides = {}) {
  return buildTaskDetail(overrides)
}

function band(label: string | null, overrides: Partial<Band> = {}): Band {
  return { label, x: 0, y: 0, width: bandWidthFor(4), height: MIN_BAND_HEIGHT, ...overrides }
}

function titles(bands: readonly MapBand[]): string[] {
  return bands.map(bandTitle)
}

function bandOf(bands: readonly MapBand[], taskId: string): string[] {
  return bands.filter((entry) => entry.cards.some((card) => card.taskId === taskId)).map(bandTitle)
}

function cardIn(bands: readonly MapBand[], label: string | null, taskId: string): MapCard {
  const card = bands
    .find((entry) => entry.label === label)
    ?.cards.find((candidate) => candidate.taskId === taskId)
  if (!card) throw new Error(`no card for ${taskId} in ${label ?? OTHER_BAND_TITLE}`)
  return card
}

describe('labelsInUse', () => {
  it('offers the labels the active Tasks carry, sorted', () => {
    const tasks = [
      task({ id: 'T-1', labels: ['infra'] }),
      task({ id: 'T-2', labels: ['auth', 'api'] }),
    ]

    expect(labelsInUse(tasks)).toEqual(['api', 'auth', 'infra'])
  })

  it('does not offer a label only a Completed Task carries', () => {
    const tasks = [
      task({ id: 'T-1', labels: ['auth'] }),
      task({ id: 'T-2', labels: ['archived'], status: 'done' }),
    ]

    expect(labelsInUse(tasks)).toEqual(['auth'])
  })

  it('offers nothing for a Project whose Tasks carry no label', () => {
    expect(labelsInUse([task({ id: 'T-1' })])).toEqual([])
  })
})

describe('seedBands', () => {
  it('seeds one Band per label in use, plus the Other Band last', () => {
    const bands = seedBands([
      task({ id: 'T-1', labels: ['auth'] }),
      task({ id: 'T-2', labels: ['api'] }),
    ])

    expect(bands.map(bandTitle)).toEqual(['api', 'auth', OTHER_BAND_TITLE])
  })

  it('stacks the seeded Bands one under another', () => {
    const bands = seedBands([
      task({ id: 'T-1', labels: ['auth'] }),
      task({ id: 'T-2', labels: ['api'] }),
    ])

    for (const [index, entry] of bands.slice(1).entries()) {
      const above = bands[index]
      expect(entry.y).toBe(above.y + above.height + CARD_GAP)
    }
  })

  it('sizes a seeded Band to fit its own cards', () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      task({ id: `T-${index}`, labels: ['auth'] }),
    )

    const [auth] = seedBands(many)

    expect(auth.height).toBeGreaterThan(MIN_BAND_HEIGHT)
  })

  it('seeds only the Other Band for a Project with no labels in use', () => {
    expect(seedBands([task({ id: 'T-1' })]).map(bandTitle)).toEqual([OTHER_BAND_TITLE])
  })
})

describe('withOtherBand', () => {
  it('adds the Other Band when a stored set is missing it', () => {
    expect(withOtherBand([band('auth')]).map(bandTitle)).toEqual(['auth', OTHER_BAND_TITLE])
  })

  it('leaves a set that already has it alone', () => {
    const bands = [band('auth'), band(null)]

    expect(withOtherBand(bands)).toEqual(bands)
  })
})

describe('cardsPerRow', () => {
  it('fits the cards the Band was sized for', () => {
    expect(cardsPerRow(bandWidthFor(4))).toBe(4)
    expect(cardsPerRow(bandWidthFor(1))).toBe(1)
  })

  it('never drops below one card', () => {
    expect(cardsPerRow(0)).toBe(1)
  })
})

describe('assembleBands membership', () => {
  it('draws a Task in every Band whose label it carries', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth', 'api'] })],
      [band('auth'), band('api'), band(null)],
    )

    expect(bandOf(bands, 'T-1')).toEqual(['auth', 'api'])
  })

  it('gives each copy of a Task its own card key', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth', 'api'] })],
      [band('auth'), band('api')],
    )

    expect(new Set(bandCards(bands).map((card) => card.key)).size).toBe(2)
  })

  it('keeps a Task carrying a curated label out of the Other Band', () => {
    const bands = assembleBands([task({ id: 'T-1', labels: ['auth'] })], [band('auth'), band(null)])

    expect(bandOf(bands, 'T-1')).toEqual(['auth'])
  })

  it('draws a Task carrying no curated label in the Other Band', () => {
    const bands = assembleBands([task({ id: 'T-1', labels: ['infra'] })], [band('auth'), band(null)])

    expect(bandOf(bands, 'T-1')).toEqual([OTHER_BAND_TITLE])
  })

  it('draws an unlabelled Task in the Other Band', () => {
    const bands = assembleBands([task({ id: 'T-1' })], [band('auth'), band(null)])

    expect(bandOf(bands, 'T-1')).toEqual([OTHER_BAND_TITLE])
  })

  it('draws no Completed Task', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth'] }), task({ id: 'T-2', labels: ['auth'], status: 'done' })],
      [band('auth')],
    )

    expect(bandCards(bands).map((card) => card.taskId)).toEqual(['T-1'])
  })

  it('keeps a curated label no active Task carries, and draws its Band empty', () => {
    const bands = assembleBands([task({ id: 'T-1', labels: ['auth'] })], [band('auth'), band('infra')])

    const infra = bands.find((entry) => entry.label === 'infra')
    expect(infra?.cards).toEqual([])
    expect(titles(bands)).toContain('infra')
  })

  it('always draws the Other Band, even when nothing falls into it', () => {
    const bands = assembleBands([task({ id: 'T-1', labels: ['auth'] })], [band('auth')])

    expect(titles(bands)).toEqual(['auth', OTHER_BAND_TITLE])
  })

  it('puts every Task in the Other Band when nothing is curated', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth'] }), task({ id: 'T-2' })],
      [],
    )

    expect(titles(bands)).toEqual([OTHER_BAND_TITLE])
    expect(bandCards(bands).map((card) => card.taskId).sort()).toEqual(['T-1', 'T-2'])
  })

  it('drops a duplicate Band from a corrupt stored set', () => {
    const bands = assembleBands([task({ id: 'T-1', labels: ['auth'] })], [band('auth'), band('auth')])

    expect(titles(bands)).toEqual(['auth', OTHER_BAND_TITLE])
  })
})

describe('assembleBands placement', () => {
  it('places a card inside its own Band', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth'] })],
      [band('auth', { x: 300, y: 200 })],
    )

    expect(cardIn(bands, 'auth', 'T-1')).toMatchObject({
      x: 300 + BAND_PADDING,
      y: 200 + BAND_HEADING_HEIGHT,
    })
  })

  it('lets a stored position win over the layered placement', () => {
    const position: CardPosition = { band: 'auth', taskId: 'T-1', x: 40, y: 60 }

    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth'] })],
      [band('auth', { x: 300, y: 200 })],
      [position],
    )

    expect(cardIn(bands, 'auth', 'T-1')).toMatchObject({
      x: 300 + BAND_PADDING + 40,
      y: 200 + BAND_HEADING_HEIGHT + 60,
    })
  })

  it('moves a card with its Band, because a position is an offset inside it', () => {
    const tasks = [task({ id: 'T-1', labels: ['auth'] })]
    const positions: CardPosition[] = [{ band: 'auth', taskId: 'T-1', x: 40, y: 60 }]

    const before = cardIn(assembleBands(tasks, [band('auth', { x: 0, y: 0 })], positions), 'auth', 'T-1')
    const after = cardIn(assembleBands(tasks, [band('auth', { x: 100, y: 70 })], positions), 'auth', 'T-1')

    expect(after.x - before.x).toBe(100)
    expect(after.y - before.y).toBe(70)
  })

  it('moves only the copy that was placed', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth', 'api'] })],
      [band('auth'), band('api', { y: 400 })],
      [{ band: 'auth', taskId: 'T-1', x: 500, y: 0 }],
    )

    expect(cardIn(bands, 'auth', 'T-1').x).toBe(BAND_PADDING + 500)
    expect(cardIn(bands, 'api', 'T-1').x).toBe(BAND_PADDING)
  })

  it('ignores a stored position for a card that is not on the map', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth'] })],
      [band('auth')],
      [{ band: 'auth', taskId: 'T-gone', x: 900, y: 900 }],
    )

    expect(cardIn(bands, 'auth', 'T-1')).toMatchObject({ x: BAND_PADDING, y: BAND_HEADING_HEIGHT })
  })

  it('never draws a Band shorter than the rows it holds', () => {
    const many = Array.from({ length: 9 }, (_, index) => task({ id: `T-${index}`, labels: ['auth'] }))

    const [auth] = assembleBands(many, [band('auth', { height: MIN_BAND_HEIGHT })])

    expect(auth.height).toBe(BAND_HEADING_HEIGHT + CARD_HEIGHT * 3 + CARD_GAP * 2 + BAND_PADDING)
  })

  it('keeps a Band the user made taller than its rows', () => {
    const [auth] = assembleBands([task({ id: 'T-1', labels: ['auth'] })], [band('auth', { height: 900 })])

    expect(auth.height).toBe(900)
  })

  it('keeps a card on the canvas when its Band moves out from under it', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth'] })],
      [band('auth', { x: 0, y: 0 })],
      [{ band: 'auth', taskId: 'T-1', x: -900, y: -900 }],
    )

    expect(cardIn(bands, 'auth', 'T-1')).toMatchObject({ x: 0, y: 0 })
  })

  it('never draws a Band narrower than one card', () => {
    const [auth] = assembleBands([task({ id: 'T-1', labels: ['auth'] })], [band('auth', { width: 10 })])

    expect(auth.width).toBe(MIN_BAND_WIDTH)
    expect(auth.cards).toHaveLength(1)
  })

  it('reflows the rows when the Band is narrowed', () => {
    const tasks = Array.from({ length: 4 }, (_, index) => task({ id: `T-${index}`, labels: ['auth'] }))

    const [wide] = assembleBands(tasks, [band('auth', { width: bandWidthFor(4) })])
    const [narrow] = assembleBands(tasks, [band('auth', { width: bandWidthFor(2) })])

    expect(new Set(wide.cards.map((card) => card.y)).size).toBe(1)
    expect(new Set(narrow.cards.map((card) => card.y)).size).toBe(2)
  })
})

describe('curatedLabels', () => {
  it('reads the curated set off the Bands, without the Other Band', () => {
    expect(curatedLabels([band('auth'), band('api'), band(null)])).toEqual(['auth', 'api'])
  })
})

describe('withCuratedLabels', () => {
  const tasks = [
    task({ id: 'T-1', labels: ['auth'] }),
    task({ id: 'T-2', labels: ['api'] }),
    task({ id: 'T-3', labels: ['infra'] }),
  ]

  it('keeps a Band that stays in the set, with its placement', () => {
    const placed = band('auth', { x: 640, y: 480 })

    const next = withCuratedLabels([placed, band(null)], tasks, ['auth'])

    expect(next.find((entry) => entry.label === 'auth')).toMatchObject({ x: 640, y: 480 })
  })

  it('drops a Band the user removed', () => {
    const next = withCuratedLabels([band('auth'), band('api'), band(null)], tasks, ['api'])

    expect(curatedLabels(next)).toEqual(['api'])
  })

  it('moves a Task that carried only the removed label into the Other Band', () => {
    const next = withCuratedLabels([band('auth'), band(null)], tasks, [])

    expect(bandOf(assembleBands(tasks, next), 'T-1')).toEqual([OTHER_BAND_TITLE])
  })

  it('adds a Band for a newly curated label', () => {
    const next = withCuratedLabels([band('auth'), band(null)], tasks, ['auth', 'infra'])

    expect(curatedLabels(next)).toEqual(['auth', 'infra'])
  })

  it('places a newly added Band below the ones already there', () => {
    const next = withCuratedLabels([band('auth', { y: 500 }), band(null, { y: 900 })], tasks, [
      'auth',
      'infra',
    ])

    const added = next.find((entry) => entry.label === 'infra')
    expect(added?.y).toBeGreaterThan(900)
  })

  it('never drops the Other Band', () => {
    expect(withCuratedLabels([band('auth'), band(null)], tasks, []).map(bandTitle)).toEqual([
      OTHER_BAND_TITLE,
    ])
  })
})

describe('moveBand', () => {
  it('moves the named Band and leaves the others', () => {
    const next = moveBand([band('auth'), band('api')], 'auth', { x: 120, y: 240 })

    expect(next[0]).toMatchObject({ x: 120, y: 240 })
    expect(next[1]).toMatchObject({ x: 0, y: 0 })
  })

  it('moves the Other Band too', () => {
    expect(moveBand([band(null)], null, { x: 10, y: 20 })[0]).toMatchObject({ x: 10, y: 20 })
  })

  it('keeps a Band on the canvas', () => {
    expect(moveBand([band('auth')], 'auth', { x: -80, y: -90 })[0]).toMatchObject({ x: 0, y: 0 })
  })
})

describe('resizeBand', () => {
  it('resizes the named Band', () => {
    const next = resizeBand([band('auth')], 'auth', { width: 700, height: 500 })

    expect(next[0]).toMatchObject({ width: 700, height: 500 })
  })

  it('never lets a Band get narrower or shorter than one card', () => {
    const next = resizeBand([band('auth')], 'auth', { width: 10, height: 10 })

    expect(next[0]).toMatchObject({ width: MIN_BAND_WIDTH, height: MIN_BAND_HEIGHT })
  })
})

describe('dragCardTo', () => {
  const tasks = [task({ id: 'T-1', labels: ['auth', 'api'] })]
  const bands = assembleBands(tasks, [band('auth', { x: 100, y: 100 }), band('api', { y: 600 })])
  const authCard = cardIn(bands, 'auth', 'T-1')

  it('reads a drop back as an offset inside the card own Band', () => {
    const dropped = dragCardTo(bands, authCard.key, { x: 400, y: 500 })

    expect(dropped).toEqual({
      band: 'auth',
      taskId: 'T-1',
      x: 400 - (100 + BAND_PADDING),
      y: 500 - (100 + BAND_HEADING_HEIGHT),
    })
  })

  it('lets a card rest outside its own Band', () => {
    const dropped = dragCardTo(bands, authCard.key, { x: 4000, y: 4000 })

    expect(dropped?.band).toBe('auth')
    expect(dropped?.x).toBeGreaterThan(bands[0].width)
  })

  it('reads back a drop above the canvas as the offset it was, leaving the clamp to the layout', () => {
    const dropped = dragCardTo(bands, authCard.key, { x: -500, y: -500 })

    expect(dropped).toMatchObject({
      x: -500 - (100 + BAND_PADDING),
      y: -500 - (100 + BAND_HEADING_HEIGHT),
    })
  })

  it('names the Band of the copy that was dragged, not the other one', () => {
    const apiCard = cardIn(bands, 'api', 'T-1')

    expect(dragCardTo(bands, apiCard.key, { x: 0, y: 0 })?.band).toBe('api')
  })

  it('drops a drag of a card that is no longer on the map', () => {
    expect(dragCardTo(bands, 'no-such-card', { x: 0, y: 0 })).toBeNull()
  })
})

describe('mapExtent', () => {
  it('covers the lowest Band', () => {
    const bands = assembleBands([], [band('auth', { y: 800, height: 200 })])

    expect(mapExtent(bands).height).toBeGreaterThanOrEqual(1000)
  })

  it('covers a card dragged outside its Band', () => {
    const bands = assembleBands(
      [task({ id: 'T-1', labels: ['auth'] })],
      [band('auth')],
      [{ band: 'auth', taskId: 'T-1', x: 2000, y: 1500 }],
    )

    expect(mapExtent(bands).width).toBeGreaterThan(2000 + CARD_WIDTH)
    expect(mapExtent(bands).height).toBeGreaterThan(1500 + CARD_HEIGHT)
  })
})
