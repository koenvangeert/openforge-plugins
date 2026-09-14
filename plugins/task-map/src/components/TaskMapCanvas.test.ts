// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import TaskMapCanvas from './TaskMapCanvas.svelte'
import { useMapViewport } from './useMapViewport.svelte'
import {
  assembleBands,
  bandKey,
  bandWidthFor,
  BAND_HEADING_HEIGHT,
  BAND_PADDING,
  MIN_BAND_HEIGHT,
  OTHER_BAND_TITLE,
  seedBands,
  type Band,
  type MapBand,
} from '../lib/bands'
import { selectArrows, type DependencyArrow } from '../lib/arrows'
import { buildTaskDetail } from '../__fixtures__/tasks'
import { pointerEvent } from '../__fixtures__/pointer'

const tasks = [
  buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' }),
  buildTaskDetail({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
]
const arrows = selectArrows(tasks)

interface RenderOptions {
  drawn?: DependencyArrow[]
  bands?: MapBand[]
}

function renderCanvas({ drawn = arrows, bands = assembleBands(tasks, []) }: RenderOptions = {}) {
  const onOpenTask = vi.fn()
  const onDropCard = vi.fn()
  const onDropBand = vi.fn()
  const onSizeBand = vi.fn()
  const viewport = useMapViewport()
  render(TaskMapCanvas, {
    props: { bands, arrows: drawn, viewport, onOpenTask, onDropCard, onDropBand, onSizeBand },
  })
  return {
    viewport,
    onOpenTask,
    onDropCard,
    onDropBand,
    onSizeBand,
    surface: screen.getByTestId('task-map-surface'),
    layer: screen.getByTestId('task-map-layer'),
  }
}

function bandTitles(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((band) => band.textContent?.trim() ?? '')
}

function headingOf(label: string | null): HTMLElement {
  const heading = screen
    .getByTestId('task-map-layer')
    .querySelector<HTMLElement>(`[data-band-handle='${bandKey(label)}']`)
  if (!heading) throw new Error(`no heading for the ${label ?? OTHER_BAND_TITLE} band`)
  return heading
}

function boxOf(label: string | null): HTMLElement {
  const box = headingOf(label).closest<HTMLElement>('[data-testid="task-map-band"]')
  if (!box) throw new Error(`no box for the ${label ?? OTHER_BAND_TITLE} band`)
  return box
}

function handleOf(label: string | null): HTMLElement {
  const handle = boxOf(label).querySelector<HTMLElement>('[data-band-resize]')
  if (!handle) throw new Error(`no resize handle for the ${label ?? OTHER_BAND_TITLE} band`)
  return handle
}

describe('TaskMapCanvas', () => {
  it('draws one card per placed card', () => {
    renderCanvas()

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('draws one arrow per dependency, from blocker to waiter', () => {
    renderCanvas()

    expect(screen.getAllByTestId('task-map-arrow').map((arrow) => arrow.dataset.arrow)).toEqual([
      'T-1->T-2',
    ])
  })

  it('ends every arrow in an arrowhead', () => {
    renderCanvas()

    for (const arrow of screen.getAllByTestId('task-map-arrow')) {
      expect(arrow.getAttribute('marker-end')).toBe('url(#task-map-arrowhead)')
      expect(arrow.getAttribute('d')).toBeTruthy()
    }
  })

  it('draws no arrow for a dependency on a Task that is not on the map', () => {
    renderCanvas({ drawn: [{ dependencyTaskId: 'T-gone', dependentTaskId: 'T-2' }] })

    expect(screen.queryAllByTestId('task-map-arrow')).toHaveLength(0)
  })

  it('draws no arrow when no dependency is selected', () => {
    renderCanvas({ drawn: [] })

    expect(screen.queryAllByTestId('task-map-arrow')).toHaveLength(0)
  })

  it('starts unzoomed and unpanned', () => {
    const { layer } = renderCanvas()

    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('zooms the canvas on a wheel gesture', async () => {
    const { surface, layer, viewport } = renderCanvas()

    await fireEvent.wheel(surface, { deltaY: -240, clientX: 100, clientY: 60 })

    expect(viewport.zoomLabel).not.toBe('100%')
    expect(layer.style.transform).not.toBe('translate(0px, 0px) scale(1)')
  })

  it('pans the canvas on a drag over empty space', async () => {
    const { surface, layer } = renderCanvas()

    await fireEvent(surface, pointerEvent('pointerdown', 0, 0))
    await fireEvent(surface, pointerEvent('pointermove', 30, 20))
    await fireEvent(surface, pointerEvent('pointerup', 30, 20))

    expect(layer.style.transform).toBe('translate(30px, 20px) scale(1)')
  })

  it('stops panning once the pointer is released', async () => {
    const { surface, layer } = renderCanvas()

    await fireEvent(surface, pointerEvent('pointerdown', 0, 0))
    await fireEvent(surface, pointerEvent('pointermove', 10, 10))
    await fireEvent(surface, pointerEvent('pointerup', 10, 10))
    await fireEvent(surface, pointerEvent('pointermove', 90, 90))

    expect(layer.style.transform).toBe('translate(10px, 10px) scale(1)')
  })

  it('drags the card a press started on rather than panning the canvas', async () => {
    const { layer, onDropCard } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 40, 40))
    await fireEvent(card, pointerEvent('pointerup', 40, 40))

    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)')
    expect(onDropCard).toHaveBeenCalledExactlyOnceWith({
      band: null,
      taskId: 'T-1',
      x: 40,
      y: 40,
    })
  })

  it('draws the card under the pointer before the drop is stored', async () => {
    const { onDropCard } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    const before = Number.parseFloat(card.style.left)
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 40, 0))

    expect(Number.parseFloat(card.style.left)).toBe(before + 40)
    expect(onDropCard).not.toHaveBeenCalled()
  })

  it('lets a card rest outside its own band', async () => {
    const { onDropCard } = renderCanvas({ bands: assembleBands([tasks[0]], []), drawn: [] })

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    const box = boxOf(null)
    const beyond = Number.parseFloat(box.style.height) + 400
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 0, beyond))
    await fireEvent(card, pointerEvent('pointerup', 0, beyond))

    expect(onDropCard).toHaveBeenCalledExactlyOnceWith({
      band: null,
      taskId: 'T-1',
      x: 0,
      y: beyond,
    })
  })

  it('writes the drop once when the pointer leaves the canvas mid-drag', async () => {
    const { surface, onDropCard } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 40, 40))
    await fireEvent(surface, pointerEvent('pointerleave', 40, 40))
    await fireEvent(surface, pointerEvent('pointerup', 60, 60))

    expect(onDropCard).toHaveBeenCalledExactlyOnceWith({
      band: null,
      taskId: 'T-1',
      x: 40,
      y: 40,
    })
  })

  it('writes the drop once when the gesture is cancelled', async () => {
    const { surface, onDropCard } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 40, 40))
    await fireEvent(surface, pointerEvent('pointercancel', 40, 40))

    expect(onDropCard).toHaveBeenCalledExactlyOnceWith({
      band: null,
      taskId: 'T-1',
      x: 40,
      y: 40,
    })
  })

  it('drags a card by what the pointer travelled on a zoomed canvas', async () => {
    const { surface, onDropCard, viewport } = renderCanvas()
    viewport.zoomIn()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(surface, pointerEvent('pointermove', 50, 25))
    await fireEvent(surface, pointerEvent('pointerup', 50, 25))

    expect(onDropCard).toHaveBeenCalledExactlyOnceWith({
      band: null,
      taskId: 'T-1',
      x: 40,
      y: 20,
    })
  })

  it('reports no drop for a press that never moved', async () => {
    const { onDropCard } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 10, 10))
    await fireEvent(card, pointerEvent('pointermove', 11, 11))
    await fireEvent(card, pointerEvent('pointerup', 11, 11))

    expect(onDropCard).not.toHaveBeenCalled()
  })

  it('keeps the cards inside the transformed layer, so their hit targets follow it', async () => {
    const { surface, layer } = renderCanvas()

    await fireEvent(surface, pointerEvent('pointerdown', 0, 0))
    await fireEvent(surface, pointerEvent('pointermove', 25, 15))

    expect(layer.style.transform).toBe('translate(25px, 15px) scale(1)')
    for (const card of screen.getAllByRole('button')) {
      expect(layer.contains(card)).toBe(true)
    }
  })

  it('reports a clicked card', async () => {
    const { onOpenTask } = renderCanvas()

    await fireEvent.click(screen.getByRole('button', { name: /Split the reader/ }))

    expect(onOpenTask).toHaveBeenCalledWith('T-2')
  })
})

describe('TaskMapCanvas label bands', () => {
  const banded = [
    buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens', labels: ['auth', 'api'] }),
    buildTaskDetail({ id: 'T-2', title: 'Split the reader', labels: ['api'], dependsOn: ['T-1'] }),
    buildTaskDetail({ id: 'T-3', title: 'Archive the runs' }),
  ]

  function box(label: string | null, overrides: Partial<Band> = {}): Band {
    return { label, x: 0, y: 0, width: bandWidthFor(4), height: MIN_BAND_HEIGHT, ...overrides }
  }

  it('draws one band per curated label, plus Other', () => {
    renderCanvas({ bands: assembleBands(banded, [box('auth'), box('api')]) })

    expect(bandTitles()).toEqual(['auth', 'api', OTHER_BAND_TITLE])
  })

  it('draws a band for a curated label no Task carries', () => {
    renderCanvas({ bands: assembleBands(banded, [box('auth'), box('ops')]) })

    expect(bandTitles()).toEqual(['auth', 'ops', OTHER_BAND_TITLE])
  })

  it('draws a Task carrying two curated labels in both bands', () => {
    renderCanvas({ bands: assembleBands(banded, [box('auth'), box('api', { y: 400 })]) })

    expect(screen.getAllByRole('button', { name: /Rotate the tokens/ })).toHaveLength(2)
  })

  it('draws each band at its own rectangle', () => {
    renderCanvas({ bands: assembleBands(banded, [box('auth', { x: 300, y: 200, width: 500 })]) })

    expect(boxOf('auth').style.left).toBe('300px')
    expect(boxOf('auth').style.top).toBe('200px')
    expect(boxOf('auth').style.width).toBe('500px')
  })

  it('lets two bands overlap where the user put them', () => {
    renderCanvas({ bands: assembleBands(banded, [box('auth', { y: 0 }), box('api', { y: 10 })]) })

    expect(boxOf('api').style.top).toBe('10px')
    expect(Number.parseFloat(boxOf('auth').style.height)).toBeGreaterThan(10)
  })

  it('draws an arrow between two cards sitting in different bands', () => {
    renderCanvas({
      bands: assembleBands(banded, [box('auth'), box('api', { y: 400 })]),
      drawn: selectArrows(banded),
    })

    const [arrow] = screen.getAllByTestId('task-map-arrow')
    expect(arrow.dataset.arrow).toBe('T-1->T-2')
    expect(arrow.getAttribute('d')).toBeTruthy()
  })

  it('draws the edge from each copy of a Task drawn in two bands', () => {
    renderCanvas({
      bands: assembleBands(banded, [box('auth'), box('api', { y: 400 })]),
      drawn: selectArrows(banded),
    })

    expect(screen.getAllByTestId('task-map-arrow')).toHaveLength(2)
  })
})

describe('TaskMapCanvas band drag', () => {
  const banded = [buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens', labels: ['auth'] })]

  function placed() {
    return assembleBands(banded, seedBands(banded))
  }

  it('drags a band by its heading', async () => {
    const { onDropBand } = renderCanvas({ bands: placed(), drawn: [] })

    const heading = headingOf('auth')
    await fireEvent(heading, pointerEvent('pointerdown', 0, 0))
    await fireEvent(heading, pointerEvent('pointermove', 120, 90))
    await fireEvent(heading, pointerEvent('pointerup', 120, 90))

    const seeded = seedBands(banded)[0]
    expect(onDropBand).toHaveBeenCalledExactlyOnceWith('auth', {
      x: seeded.x + 120,
      y: seeded.y + 90,
    })
  })

  it('carries the band cards with it while the drag is under the pointer', async () => {
    renderCanvas({ bands: placed(), drawn: [] })

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    const before = Number.parseFloat(card.style.left)
    const heading = headingOf('auth')
    await fireEvent(heading, pointerEvent('pointerdown', 0, 0))
    await fireEvent(heading, pointerEvent('pointermove', 120, 0))

    expect(Number.parseFloat(card.style.left)).toBe(before + 120)
  })

  it('reports no band drop for a press that never moved', async () => {
    const { onDropBand } = renderCanvas({ bands: placed(), drawn: [] })

    const heading = headingOf('auth')
    await fireEvent(heading, pointerEvent('pointerdown', 10, 10))
    await fireEvent(heading, pointerEvent('pointermove', 11, 11))
    await fireEvent(heading, pointerEvent('pointerup', 11, 11))

    expect(onDropBand).not.toHaveBeenCalled()
  })

  it('does not pan the canvas while a band is being dragged', async () => {
    const { layer } = renderCanvas({ bands: placed(), drawn: [] })

    const heading = headingOf('auth')
    await fireEvent(heading, pointerEvent('pointerdown', 0, 0))
    await fireEvent(heading, pointerEvent('pointermove', 40, 40))

    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('resizes a band by its corner handle', async () => {
    const { onSizeBand } = renderCanvas({ bands: placed(), drawn: [] })

    const handle = handleOf('auth')
    await fireEvent(handle, pointerEvent('pointerdown', 0, 0))
    await fireEvent(handle, pointerEvent('pointermove', -200, 60))
    await fireEvent(handle, pointerEvent('pointerup', -200, 60))

    const seeded = seedBands(banded)[0]
    expect(onSizeBand).toHaveBeenCalledExactlyOnceWith('auth', {
      width: seeded.width - 200,
      height: seeded.height + 60,
    })
  })

  it('shows the band under the pointer while it is resized', async () => {
    renderCanvas({ bands: placed(), drawn: [] })

    const before = Number.parseFloat(boxOf('auth').style.width)
    const handle = handleOf('auth')
    await fireEvent(handle, pointerEvent('pointerdown', 0, 0))
    await fireEvent(handle, pointerEvent('pointermove', 150, 0))

    expect(Number.parseFloat(boxOf('auth').style.width)).toBe(before + 150)
  })

  it('offers no dependency control on a band', () => {
    renderCanvas({ bands: placed(), drawn: [] })

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
