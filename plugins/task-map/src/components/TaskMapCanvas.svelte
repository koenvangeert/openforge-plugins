<script lang="ts">
  import { mapExtent, type MapCard } from '../lib/cards'
  import type { MapViewport } from './useMapViewport.svelte'
  import TaskCard from './TaskCard.svelte'

  interface Props {
    cards: MapCard[]
    viewport: MapViewport
    onOpenTask: (taskId: string) => void
  }

  let { cards, viewport, onOpenTask }: Props = $props()

  let surface = $state<HTMLElement | null>(null)
  let panOrigin: { x: number; y: number } | null = $state(null)

  const extent = $derived(mapExtent(cards))

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

  function isCardPress(event: PointerEvent): boolean {
    return event.target instanceof Element && event.target.closest('[data-task-id]') !== null
  }

  function handlePointerDown(event: PointerEvent): void {
    if (isCardPress(event)) return
    panOrigin = { x: event.clientX, y: event.clientY }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!panOrigin) return
    viewport.pan(event.clientX - panOrigin.x, event.clientY - panOrigin.y)
    panOrigin = { x: event.clientX, y: event.clientY }
  }

  function endPan(): void {
    panOrigin = null
  }
</script>

<div
  bind:this={surface}
  class="task-map-surface"
  data-testid="task-map-surface"
  data-panning={panOrigin ? 'true' : 'false'}
  role="presentation"
  onwheel={handleWheel}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={endPan}
  onpointerleave={endPan}
  onpointercancel={endPan}
>
  <div
    class="task-map-layer"
    data-testid="task-map-layer"
    style="width: {extent.width}px; height: {extent.height}px; transform: {viewport.transform}"
  >
    {#each cards as card (card.taskId)}
      <TaskCard {card} onOpen={onOpenTask} />
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
</style>
