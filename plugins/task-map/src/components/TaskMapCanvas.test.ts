// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import TaskMapCanvas from './TaskMapCanvas.svelte'
import { useMapViewport } from './useMapViewport.svelte'
import { assembleRegions, OTHER_REGION_TITLE, type MapRegion } from '../lib/regions'
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
  regions?: MapRegion[]
}

function renderCanvas({ drawn = arrows, regions = assembleRegions(tasks, []) }: RenderOptions = {}) {
  const onOpenTask = vi.fn()
  const onDropCard = vi.fn()
  const viewport = useMapViewport()
  render(TaskMapCanvas, { props: { regions, arrows: drawn, viewport, onOpenTask, onDropCard } })
  return {
    viewport,
    onOpenTask,
    onDropCard,
    surface: screen.getByTestId('task-map-surface'),
    layer: screen.getByTestId('task-map-layer'),
  }
}

function bandTitles(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((band) => band.textContent?.trim() ?? '')
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
    expect(onDropCard).toHaveBeenCalledExactlyOnceWith('T-1', { region: null, x: 40, y: 40 })
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

  it('grows the band under the pointer before the drop is stored', async () => {
    renderCanvas({ regions: assembleRegions([tasks[0]], []), drawn: [] })

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    const band = screen.getAllByTestId('task-map-region')[0]
    const before = Number.parseFloat(band.style.height)
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 0, 120))

    expect(Number.parseFloat(band.style.height)).toBe(before + 120)
  })

  it('writes the drop once when the pointer leaves the canvas mid-drag', async () => {
    const { surface, onDropCard } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 40, 40))
    await fireEvent(surface, pointerEvent('pointerleave', 40, 40))
    await fireEvent(surface, pointerEvent('pointerup', 60, 60))

    expect(onDropCard).toHaveBeenCalledExactlyOnceWith('T-1', { region: null, x: 40, y: 40 })
  })

  it('writes the drop once when the gesture is cancelled', async () => {
    const { surface, onDropCard } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 40, 40))
    await fireEvent(surface, pointerEvent('pointercancel', 40, 40))

    expect(onDropCard).toHaveBeenCalledExactlyOnceWith('T-1', { region: null, x: 40, y: 40 })
  })

  it('drags a card by what the pointer travelled on a zoomed canvas', async () => {
    const { surface, onDropCard, viewport } = renderCanvas()
    viewport.zoomIn()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(surface, pointerEvent('pointermove', 50, 25))
    await fireEvent(surface, pointerEvent('pointerup', 50, 25))

    expect(onDropCard).toHaveBeenCalledExactlyOnceWith('T-1', { region: null, x: 40, y: 20 })
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

  it('draws one band per curated label in curated order, with Other last', () => {
    renderCanvas({ regions: assembleRegions(banded, ['auth', 'api']) })

    expect(bandTitles()).toEqual(['auth', 'api', OTHER_REGION_TITLE])
  })

  it('draws a band for a curated label no Task carries', () => {
    renderCanvas({ regions: assembleRegions(banded, ['auth', 'ops']) })

    expect(bandTitles()).toEqual(['auth', 'ops', OTHER_REGION_TITLE])
  })

  it('draws every band the full width of the map', () => {
    const { layer } = renderCanvas({ regions: assembleRegions(banded, ['auth', 'api']) })

    for (const band of screen.getAllByTestId('task-map-region')) {
      expect(band.style.width).toBe(layer.style.width)
    }
  })

  it('stacks the bands down the map, none overlapping the one above it', () => {
    renderCanvas({ regions: assembleRegions(banded, ['auth', 'api']) })

    const edges = screen.getAllByTestId('task-map-region').map((band) => ({
      top: Number.parseFloat(band.style.top),
      bottom: Number.parseFloat(band.style.top) + Number.parseFloat(band.style.height),
    }))

    for (const [index, band] of edges.slice(1).entries()) {
      expect(band.top).toBeGreaterThanOrEqual(edges[index].bottom)
    }
  })

  it('draws an arrow between two cards sitting in different bands', () => {
    renderCanvas({
      regions: assembleRegions(banded, ['auth', 'api']),
      drawn: selectArrows(banded),
    })

    const [arrow] = screen.getAllByTestId('task-map-arrow')
    expect(arrow.dataset.arrow).toBe('T-1->T-2')
    expect(arrow.getAttribute('d')).toBeTruthy()
  })
})
