<script lang="ts">
  import type { DependencyArrow } from '../lib/arrows'
  import {
    mapExtent,
    REGION_HEADING_HEIGHT,
    regionCards,
    regionTitle,
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
  }

  let { regions, arrows, viewport, onOpenTask }: Props = $props()

  let surface = $state<HTMLElement | null>(null)
  let panOrigin: { x: number; y: number } | null = $state(null)

  const extent = $derived(mapExtent(regions))
  const cards = $derived(regionCards(regions))

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
    {#each regions as region (region.label)}
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
