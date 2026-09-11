<script lang="ts">
  import type { DependencyArrow } from '../lib/arrows'
  import type { CardPosition, MapCard } from '../lib/cards'
  import {
    dragCardTo,
    mapExtent,
    REGION_HEADING_HEIGHT,
    regionCards,
    regionTitle,
    withDraggedCard,
    type CanvasPoint,
    type MapRegion,
  } from '../lib/regions'
  import type { MapViewport } from './useMapViewport.svelte'
  import TaskCard from './TaskCard.svelte'
  import TaskMapArrows from './TaskMapArrows.svelte'

  interface Props {
    regions: MapRegion[]
    arrows: DependencyArrow[]
    viewport: MapViewport
    onOpenTask: (taskId: string) => void
    onDropCard: (taskId: string, position: CardPosition) => void
  }

  interface CardDrag {
    taskId: string
    pointer: CanvasPoint
    origin: CanvasPoint
    position: CardPosition | null
  }

  const DRAG_THRESHOLD = 4

  let { regions, arrows, viewport, onOpenTask, onDropCard }: Props = $props()

  let surface = $state<HTMLElement | null>(null)
  let panOrigin: CanvasPoint | null = $state(null)
  let drag = $state<CardDrag | null>(null)
  let dragged = false

  const placed = $derived(
    drag?.position ? withDraggedCard(regions, drag.taskId, drag.position) : regions,
  )
  const cards = $derived(regionCards(placed))
  const extent = $derived(mapExtent(placed))

  $effect(() => {
    viewport.attach(surface)
    return () => viewport.attach(null)
  })

  function handleWheel(event: WheelEvent): void {
    event.preventDefault()
    const bounds = surface?.getBoundingClientRect()
    viewport.zoomByWheel(event.deltaY, {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    })
  }

  function pressedCard(event: PointerEvent): MapCard | null {
    const pressed = event.target instanceof Element ? event.target.closest('[data-task-id]') : null
    const taskId = pressed instanceof HTMLElement ? pressed.dataset.taskId : undefined
    return cards.find((card) => card.taskId === taskId) ?? null
  }

  function handlePointerDown(event: PointerEvent): void {
    const card = pressedCard(event)
    if (card) {
      // Without capture a drag towards the canvas edge ends the moment the
      // pointer crosses it, stranding the rest of the gesture.
      surface?.setPointerCapture?.(event.pointerId)
      drag = {
        taskId: card.taskId,
        pointer: { x: event.clientX, y: event.clientY },
        origin: { x: card.x, y: card.y },
        position: null,
      }
      return
    }
    panOrigin = { x: event.clientX, y: event.clientY }
  }

  function dragCard(event: PointerEvent, gesture: CardDrag): void {
    const travelled =
      Math.abs(event.clientX - gesture.pointer.x) + Math.abs(event.clientY - gesture.pointer.y)
    if (!gesture.position && travelled < DRAG_THRESHOLD) return

    const position = dragCardTo(regions, gesture.taskId, {
      x: gesture.origin.x + (event.clientX - gesture.pointer.x) / viewport.scale,
      y: gesture.origin.y + (event.clientY - gesture.pointer.y) / viewport.scale,
    })
    if (!position) return

    drag = { ...gesture, position }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (drag) {
      dragCard(event, drag)
      return
    }
    if (!panOrigin) return
    viewport.pan(event.clientX - panOrigin.x, event.clientY - panOrigin.y)
    panOrigin = { x: event.clientX, y: event.clientY }
  }

  function endGesture(): void {
    dragged = Boolean(drag?.position)
    if (drag?.position) onDropCard(drag.taskId, drag.position)
    drag = null
    panOrigin = null
  }

  function handleClickCapture(event: MouseEvent): void {
    const fromPointer = event.detail > 0
    if (dragged && fromPointer) event.stopPropagation()
  }
</script>

<div
  bind:this={surface}
  class="task-map-surface"
  data-testid="task-map-surface"
  data-panning={panOrigin ? 'true' : 'false'}
  role="presentation"
  onwheel={handleWheel}
  onclickcapture={handleClickCapture}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={endGesture}
  onpointerleave={endGesture}
  onpointercancel={endGesture}
>
  <div
    class="task-map-layer"
    data-testid="task-map-layer"
    style="width: {extent.width}px; height: {extent.height}px; transform: {viewport.transform}"
  >
    {#each placed as region (region.label)}
      <div
        class="task-map-region"
        data-testid="task-map-region"
        data-other={region.label === null ? 'true' : 'false'}
        style="top: {region.y}px; height: {region.height}px; width: {extent.width}px"
      >
        <h2 class="task-map-region-heading" style="height: {REGION_HEADING_HEIGHT}px">
          {regionTitle(region)}
        </h2>
      </div>
    {/each}
    <TaskMapArrows {arrows} {cards} {extent} />
    {#each cards as card (card.taskId)}
      <TaskCard {card} dragging={card.taskId === drag?.taskId} onOpen={onOpenTask} />
    {/each}
  </div>
</div>

<style>
  .task-map-surface {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--of-canvas);
    cursor: grab;
    touch-action: none;
  }

  .task-map-surface[data-panning='true'] {
    cursor: grabbing;
  }

  .task-map-layer {
    position: relative;
    transform-origin: 0 0;
  }

  .task-map-region {
    position: absolute;
    left: 0;
    background: var(--of-surface-subtle);
    border: var(--of-border-width) solid var(--of-border);
    border-radius: var(--of-radius-container);
  }

  .task-map-region-heading {
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0 var(--of-space3);
    font-size: var(--of-text-xs);
    line-height: var(--of-line-height-xs);
    font-weight: var(--of-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--of-text-secondary);
  }

  .task-map-region[data-other='true'] .task-map-region-heading {
    color: var(--of-text-muted);
  }
</style>
