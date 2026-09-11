// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import TaskMapCanvas from './TaskMapCanvas.svelte'
import { useMapViewport } from './useMapViewport.svelte'
import { placeCards } from '../lib/cards'
import { selectArrows, type DependencyArrow } from '../lib/arrows'
import { buildTaskDetail } from '../__fixtures__/tasks'

const tasks = [
  buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' }),
  buildTaskDetail({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
]
const cards = placeCards(tasks)
const arrows = selectArrows(tasks)

function renderCanvas({ drawn = arrows }: { drawn?: DependencyArrow[] } = {}) {
  const onOpenTask = vi.fn()
  const viewport = useMapViewport()
  render(TaskMapCanvas, { props: { cards, arrows: drawn, viewport, onOpenTask } })
  return {
    viewport,
    onOpenTask,
    surface: screen.getByTestId('task-map-surface'),
    layer: screen.getByTestId('task-map-layer'),
  }
}

// jsdom implements no PointerEvent, so a MouseEvent carries the clientX/clientY the
// pan handlers read while still dispatching under the pointer event's own name.
function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
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

  it('does not pan a drag that starts on a card', async () => {
    const { layer } = renderCanvas()

    const card = screen.getByRole('button', { name: /Rotate the tokens/ })
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    await fireEvent(card, pointerEvent('pointermove', 40, 40))

    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)')
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
