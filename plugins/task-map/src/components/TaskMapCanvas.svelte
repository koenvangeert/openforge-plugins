<script lang="ts">
  import type { DependencyArrow } from '../lib/arrows'
  import type { CardPosition, MapCard } from '../lib/cards'
  import {
    bandCards,
    bandKey,
    bandOrigin,
    bandTitle,
    BAND_HEADING_HEIGHT,
    dragCardTo,
    mapExtent,
    moveBand,
    resizeBand,
    type MapBand,
    type MapSize,
  } from '../lib/bands'
  import type { CanvasPoint } from '../lib/viewport'
  import type { MapViewport } from './useMapViewport.svelte'
  import TaskCard from './TaskCard.svelte'
  import TaskMapArrows from './TaskMapArrows.svelte'

  interface Props {
    bands: MapBand[]
    arrows: DependencyArrow[]
    viewport: MapViewport
    onOpenTask: (taskId: string) => void
    onDropCard: (position: CardPosition) => void
    onDropBand: (label: string | null, point: CanvasPoint) => void
    onSizeBand: (label: string | null, size: MapSize) => void
  }

  type Gesture =
    | { kind: 'card'; key: string; pointer: CanvasPoint; origin: CanvasPoint; position: CardPosition | null }
    | { kind: 'band'; label: string | null; pointer: CanvasPoint; origin: CanvasPoint; point: CanvasPoint | null }
    | { kind: 'resize'; label: string | null; pointer: CanvasPoint; origin: MapSize; size: MapSize | null }

  const DRAG_THRESHOLD = 4

  let { bands, arrows, viewport, onOpenTask, onDropCard, onDropBand, onSizeBand }: Props = $props()

  let surface = $state<HTMLElement | null>(null)
  let panOrigin: CanvasPoint | null = $state(null)
  let gesture = $state<Gesture | null>(null)
  let dragged = false

  const placed = $derived(previewOf(gesture))
  const cards = $derived(bandCards(placed))
  const extent = $derived(mapExtent(placed))
  const draggingKey = $derived(gesture?.kind === 'card' && gesture.position ? gesture.key : null)

  function shiftedBand(band: MapBand, point: CanvasPoint): MapBand {
    const [moved] = moveBand([band], band.label, point)
    const dx = moved.x - band.x
    const dy = moved.y - band.y
    return {
      ...band,
      ...moved,
      cards: band.cards.map((card) => ({ ...card, x: card.x + dx, y: card.y + dy })),
    }
  }

  // A resize is previewed as the outline alone. Reflowing the rows needs the Task
  // set the canvas does not hold, so the model does it once on release.
  function sizedBand(band: MapBand, size: MapSize): MapBand {
    const [resized] = resizeBand([band], band.label, size)
    return { ...band, ...resized }
  }

  function movedCard(band: MapBand, position: CardPosition): MapBand {
    const origin = bandOrigin(band)
    return {
      ...band,
      cards: band.cards.map((card) =>
        card.taskId === position.taskId
          ? { ...card, x: origin.x + position.x, y: origin.y + position.y }
          : card,
      ),
    }
  }

  function previewOf(active: Gesture | null): MapBand[] {
    if (active?.kind === 'band' && active.point) {
      const point = active.point
      return bands.map((band) => (band.label === active.label ? shiftedBand(band, point) : band))
    }
    if (active?.kind === 'resize' && active.size) {
      const size = active.size
      return bands.map((band) => (band.label === active.label ? sizedBand(band, size) : band))
    }
    if (active?.kind === 'card' && active.position) {
      const position = active.position
      return bands.map((band) => (band.label === position.band ? movedCard(band, position) : band))
    }
    return bands
  }

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

  function pressed(event: PointerEvent, attribute: string): HTMLElement | null {
    const target = event.target instanceof Element ? event.target.closest(`[${attribute}]`) : null
    return target instanceof HTMLElement ? target : null
  }

  function travelled(event: PointerEvent, from: CanvasPoint): number {
    return Math.abs(event.clientX - from.x) + Math.abs(event.clientY - from.y)
  }

  function movedBy(event: PointerEvent, from: CanvasPoint): CanvasPoint {
    return {
      x: (event.clientX - from.x) / viewport.scale,
      y: (event.clientY - from.y) / viewport.scale,
    }
  }

  function bandUnder(element: HTMLElement | null, attribute: 'bandHandle' | 'bandResize') {
    const key = element?.dataset[attribute]
    return key === undefined ? null : (bands.find((band) => bandKey(band.label) === key) ?? null)
  }

  function beginGesture(event: PointerEvent): Gesture | null {
    const handle = pressed(event, 'data-band-resize')
    const heading = pressed(event, 'data-band-handle')
    const card = pressed(event, 'data-card-key')
    const band = bandUnder(handle, 'bandResize') ?? bandUnder(heading, 'bandHandle')

    if (handle && band) {
      return {
        kind: 'resize',
        label: band.label,
        pointer: { x: event.clientX, y: event.clientY },
        origin: { width: band.width, height: band.height },
        size: null,
      }
    }
    if (heading && band) {
      return {
        kind: 'band',
        label: band.label,
        pointer: { x: event.clientX, y: event.clientY },
        origin: { x: band.x, y: band.y },
        point: null,
      }
    }
    if (card?.dataset.cardKey) {
      const placedCard = cards.find((candidate) => candidate.key === card.dataset.cardKey)
      if (!placedCard) return null
      return {
        kind: 'card',
        key: placedCard.key,
        pointer: { x: event.clientX, y: event.clientY },
        origin: { x: placedCard.x, y: placedCard.y },
        position: null,
      }
    }
    return null
  }

  function handlePointerDown(event: PointerEvent): void {
    const started = beginGesture(event)
    if (started) {
      // Without capture a drag towards the canvas edge ends the moment the
      // pointer crosses it, stranding the rest of the gesture.
      surface?.setPointerCapture?.(event.pointerId)
      gesture = started
      return
    }
    panOrigin = { x: event.clientX, y: event.clientY }
  }

  function advance(event: PointerEvent, active: Gesture): Gesture | null {
    const moved = movedBy(event, active.pointer)

    if (active.kind === 'card') {
      const position = dragCardTo(bands, active.key, {
        x: active.origin.x + moved.x,
        y: active.origin.y + moved.y,
      })
      return position ? { ...active, position } : null
    }
    if (active.kind === 'band') {
      return { ...active, point: { x: active.origin.x + moved.x, y: active.origin.y + moved.y } }
    }
    return {
      ...active,
      size: { width: active.origin.width + moved.x, height: active.origin.height + moved.y },
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (gesture) {
      if (!isUnderway(gesture) && travelled(event, gesture.pointer) < DRAG_THRESHOLD) return
      gesture = advance(event, gesture) ?? gesture
      return
    }
    if (!panOrigin) return
    viewport.pan(event.clientX - panOrigin.x, event.clientY - panOrigin.y)
    panOrigin = { x: event.clientX, y: event.clientY }
  }

  function isUnderway(active: Gesture): boolean {
    if (active.kind === 'card') return active.position !== null
    if (active.kind === 'band') return active.point !== null
    return active.size !== null
  }

  function endGesture(): void {
    const active = gesture
    dragged = Boolean(active && isUnderway(active))

    if (active?.kind === 'card' && active.position) onDropCard(active.position)
    if (active?.kind === 'band' && active.point) onDropBand(active.label, active.point)
    if (active?.kind === 'resize' && active.size) onSizeBand(active.label, active.size)

    gesture = null
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
    {#each placed as band (band.label)}
      <div
        class="task-map-band"
        data-testid="task-map-band"
        data-other={band.label === null ? 'true' : 'false'}
        style="left: {band.x}px; top: {band.y}px; width: {band.width}px; height: {band.height}px"
      >
        <h2
          class="task-map-band-heading"
          data-band-handle={bandKey(band.label)}
          style="height: {BAND_HEADING_HEIGHT}px"
        >
          {bandTitle(band)}
        </h2>
        <span
          class="task-map-band-resize"
          data-band-resize={bandKey(band.label)}
          aria-hidden="true"
        ></span>
      </div>
    {/each}
    <TaskMapArrows {arrows} {cards} {extent} />
    {#each cards as card (card.key)}
      <TaskCard {card} dragging={card.key === draggingKey} onOpen={onOpenTask} />
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

  /* An outline, not a filled row: Bands may overlap, and a fill would hide one. */
  .task-map-band {
    position: absolute;
    border: var(--of-border-width) solid var(--of-border);
    border-radius: var(--of-radius-container);
  }

  .task-map-band-heading {
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
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .task-map-band[data-other='true'] .task-map-band-heading {
    color: var(--of-text-muted);
  }

  .task-map-band-resize {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 12px;
    height: 12px;
    background: var(--of-surface-raised);
    border: var(--of-border-width) solid var(--of-border-strong);
    border-radius: var(--of-radius-round);
    cursor: nwse-resize;
    touch-action: none;
  }
</style>
