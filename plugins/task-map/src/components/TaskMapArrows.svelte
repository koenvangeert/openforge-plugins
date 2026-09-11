<script lang="ts">
  import { routeArrows, type DependencyArrow } from '../lib/arrows'
  import { mapExtent, type MapCard } from '../lib/cards'

  interface Props {
    arrows: DependencyArrow[]
    cards: MapCard[]
  }

  let { arrows, cards }: Props = $props()

  const routed = $derived(routeArrows(arrows, cards))
  const extent = $derived(mapExtent(cards))
</script>

<svg
  class="task-map-arrows"
  data-testid="task-map-arrows"
  width={extent.width}
  height={extent.height}
  viewBox="0 0 {extent.width} {extent.height}"
  aria-hidden="true"
>
  <defs>
    <marker
      id="task-map-arrowhead"
      markerWidth="8"
      markerHeight="8"
      refX="7"
      refY="4"
      orient="auto"
    >
      <path class="task-map-arrowhead" d="M0 1 L7 4 L0 7 z" />
    </marker>
  </defs>
  {#each routed as arrow (arrow.key)}
    <path
      class="task-map-arrow"
      data-testid="task-map-arrow"
      data-arrow={arrow.key}
      d={arrow.path}
      marker-end="url(#task-map-arrowhead)"
    />
  {/each}
</svg>

<style>
  /* Above the cards: an opaque card would otherwise hide any arrow crossing it. */
  .task-map-arrows {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: visible;
    pointer-events: none;
  }

  .task-map-arrow {
    fill: none;
    stroke: var(--of-border-strong);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .task-map-arrowhead {
    fill: var(--of-border-strong);
  }
</style>
