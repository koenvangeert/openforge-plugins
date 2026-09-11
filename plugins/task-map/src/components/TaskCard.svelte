<script lang="ts">
  import { CARD_HEIGHT, CARD_WIDTH, type MapCard } from '../lib/cards'

  interface Props {
    card: MapCard
    onOpen: (taskId: string) => void
  }

  let { card, onOpen }: Props = $props()

  const statusLabel = $derived(card.status === 'doing' ? 'Doing' : 'Backlog')
</script>

<button
  type="button"
  class="task-map-card"
  data-task-id={card.taskId}
  data-status={card.status}
  style="left: {card.x}px; top: {card.y}px; width: {CARD_WIDTH}px; height: {CARD_HEIGHT}px"
  onclick={() => onOpen(card.taskId)}
>
  <span class="task-map-card-title">{card.label}</span>
  <span class="task-map-card-status">{statusLabel}</span>
</button>

<style>
  .task-map-card {
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--of-space2);
    padding: var(--of-space3);
    text-align: left;
    cursor: pointer;
    background: var(--of-surface-raised);
    color: var(--of-text);
    border: var(--of-border-width) solid var(--of-border);
    border-left-width: 3px;
    border-radius: var(--of-radius-container);
    box-shadow: var(--of-shadow-surface);
    transition: box-shadow var(--of-duration-fast) var(--of-ease-standard);
  }

  .task-map-card:hover {
    box-shadow: var(--of-shadow-raised);
  }

  .task-map-card:focus-visible {
    outline: var(--of-focus-width) solid var(--of-focus-ring);
    outline-offset: 2px;
  }

  .task-map-card[data-status='doing'] {
    border-left-color: var(--of-status-running);
  }

  .task-map-card[data-status='backlog'] {
    border-left-color: var(--of-status-neutral);
  }

  .task-map-card-title {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    font-size: var(--of-text-sm);
    line-height: var(--of-line-height-sm);
    font-weight: var(--of-weight-medium);
  }

  .task-map-card-status {
    align-self: flex-start;
    padding: 0 var(--of-space2);
    font-size: var(--of-text-xs);
    line-height: var(--of-line-height-xs);
    border-radius: var(--of-radius-round);
  }

  .task-map-card[data-status='doing'] .task-map-card-status {
    background: var(--of-status-running-subtle);
    color: var(--of-on-status-running);
  }

  .task-map-card[data-status='backlog'] .task-map-card-status {
    background: var(--of-status-neutral-subtle);
    color: var(--of-on-status-neutral);
  }
</style>
