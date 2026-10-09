<script lang="ts">
  import { ChevronRight, Plus } from '@lucide/svelte'
  import { flattenCards, type BoardCard, type BoardColumn } from '../lib/board'
  import {
    dependencyEdges,
    measureBoardArrows,
    peerIssueNumbers,
    type DrawnDependencyArrow,
  } from '../lib/dependencyArrows'
  import { countColumnResults, type SearchTerms } from '../lib/search'
  import Card from './Card.svelte'
  import ColorPicker from './ColorPicker.svelte'

  interface Props {
    columns: BoardColumn[]
    repo: string
    onCardClick: (card: BoardCard, column: BoardColumn) => void
    onOpenUrl: (url: string) => void
    onOpenTask: (taskId: string) => void
    onCopyLink: (issueNumber: number) => void
    onSetValue: (issueNumber: number, value: number | null) => void
    onRecolor: (label: string, color: string) => void
    busy?: boolean
    onStart: (card: BoardCard) => void
    onAddCard: (label: string) => void
    /** Move a dragged card from one column's label to another's. */
    onMoveCard: (issueNumber: number, fromLabel: string, toLabel: string) => void
    /** Active search terms, forwarded to each Card for highlighting. */
    terms?: SearchTerms
    /** Labels of the columns that show only their header. */
    collapsedLabels?: ReadonlySet<string>
    onToggleCollapsed: (label: string) => void
    /**
     * Whether a card is a filter result, not only context around one. A column's count
     * includes only these cards, so it shows the filtered total while the column is
     * collapsed.
     */
    isResult?: (card: BoardCard) => boolean
  }

  let {
    columns,
    repo,
    onCardClick,
    onOpenUrl,
    onOpenTask,
    onCopyLink,
    onSetValue,
    onRecolor,
    busy = false,
    onStart,
    onAddCard,
    onMoveCard,
    terms = [],
    collapsedLabels = new Set<string>(),
    onToggleCollapsed,
    isResult = () => true,
  }: Props = $props()

  let openColorLabel = $state<string | null>(null)
  let wrapEl = $state<HTMLDivElement | null>(null)
  let arrows = $state<DrawnDependencyArrow[]>([])
  let focusedIssue = $state<number | null>(null)
  const markerId = `issues-dep-arrow-${Math.random().toString(36).slice(2)}`
  // The card currently being dragged, and the label of the column it's hovering over
  // (a valid drop target only — the column it came from never lights up). Column-to-
  // column moves only: this board has no manual card ordering (see lib/board.ts), so
  // there's nothing to persist for a drop back inside the same column.
  let draggedCard = $state<{ issueNumber: number; fromLabel: string } | null>(null)
  let dragOverLabel = $state<string | null>(null)
  // Sub-issue trees start collapsed so a parent with many children does not fill
  // the column. Search expands every node so a match in a nested card is visible.
  let expandedIssueNumbers = $state(new Set<number>())

  const HEX6 = /^[0-9a-fA-F]{6}$/

  // GitHub label colors are data; apply a soft theme-aware tint from the API value
  // only. color-mix blends the hex into a daisyUI semantic base color.
  function columnTint(color: string | null): string {
    if (!color || !HEX6.test(color)) return ''
    return `background-color: color-mix(in srgb, #${color} 12%, var(--color-base-200)); border-color: color-mix(in srgb, #${color} 30%, var(--color-base-300));`
  }

  function swatchStyle(color: string | null): string {
    if (!color || !HEX6.test(color)) return ''
    return `background-color: #${color};`
  }

  // Highlight a column's card list only while a card from a *different* column is
  // being dragged over it — the source column never lights up as its own target.
  function dropTargetClass(label: string): string {
    return dragOverLabel === label ? 'outline-2 outline-dashed outline-primary bg-primary/10' : ''
  }

  function issueCountLabel(count: number): string {
    return count === 1 ? '1 issue' : `${count} issues`
  }

  function pickColor(label: string, color: string) {
    openColorLabel = null
    onRecolor(label, color)
  }

  function addCard(event: MouseEvent, label: string) {
    event.stopPropagation()
    onAddCard(label)
  }

  function isExpanded(issueNumber: number): boolean {
    return terms.length > 0 || expandedIssueNumbers.has(issueNumber)
  }

  function toggleExpanded(issueNumber: number): void {
    if (terms.length > 0) return
    const next = new Set(expandedIssueNumbers)
    if (next.has(issueNumber)) next.delete(issueNumber)
    else next.add(issueNumber)
    expandedIssueNumbers = next
  }

  function handleDragStart(event: DragEvent, card: BoardCard, column: BoardColumn) {
    const target = event.target
    if (target instanceof Element && (target.closest('.sub-issue-row') || target.closest('button'))) {
      event.preventDefault()
      return
    }
    draggedCard = { issueNumber: card.issueNumber, fromLabel: column.label }
    event.dataTransfer?.setData('text/plain', String(card.issueNumber))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    draggedCard = null
    dragOverLabel = null
  }

  // Dropping is only offered over a column other than the one the card is being
  // dragged from — preventDefault is what tells the browser this is a valid target.
  function handleDragOver(event: DragEvent, column: BoardColumn) {
    if (!draggedCard || draggedCard.fromLabel === column.label) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dragOverLabel = column.label
  }

  function handleDragLeave(column: BoardColumn) {
    if (dragOverLabel === column.label) dragOverLabel = null
  }

  const boardEdges = $derived.by(() => {
    const cards = columns.flatMap((column) => column.cards)
    const onBoard = new Set(flattenCards(cards).map((card) => card.issueNumber))
    return dependencyEdges(cards, repo, onBoard)
  })
  const peerNumbers = $derived(
    focusedIssue === null ? new Set<number>() : new Set(peerIssueNumbers(boardEdges, focusedIssue)),
  )

  function issueNumberFromTarget(target: EventTarget | null): number | null {
    if (!(target instanceof Element)) return null
    const node = target.closest('[data-issue-number]')
    if (!(node instanceof HTMLElement)) return null
    const issueNumber = Number(node.dataset.issueNumber)
    return Number.isInteger(issueNumber) ? issueNumber : null
  }

  function trackPointer(event: MouseEvent | FocusEvent): void {
    const issueNumber = issueNumberFromTarget(event.target)
    if (issueNumber !== null) focusedIssue = issueNumber
  }

  function clearPointer(event: MouseEvent | FocusEvent): void {
    const next = event.relatedTarget
    if (next instanceof Node && wrapEl?.contains(next)) return
    focusedIssue = null
  }

  function revealIssue(issueNumber: number): boolean {
    const node = wrapEl?.querySelector(`[data-issue-number="${issueNumber}"]`)
    if (!(node instanceof HTMLElement)) return false
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    try {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
    } catch {
      // Some hosts reject the options object. The highlight still shows the card.
    }
    focusedIssue = issueNumber
    return true
  }

  function arrowIsActive(arrow: DrawnDependencyArrow): boolean {
    return focusedIssue !== null && (arrow.blocker === focusedIssue || arrow.blocked === focusedIssue)
  }

  $effect(() => {
    const node = wrapEl
    // Re-measure when the card tree opens or the columns change.
    void columns
    void expandedIssueNumbers
    if (!node) {
      arrows = []
      return
    }
    const measure = () => {
      arrows = measureBoardArrows(node, columns, repo)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(node)
    return () => observer.disconnect()
  })

  function handleDrop(event: DragEvent, column: BoardColumn) {
    event.preventDefault()
    const dragged = draggedCard
    draggedCard = null
    dragOverLabel = null
    if (!dragged || dragged.fromLabel === column.label) return
    onMoveCard(dragged.issueNumber, dragged.fromLabel, column.label)
  }
</script>

<!-- The arrow layer is a sibling of the column layout. A child of `.issues-board` would fall into one CSS column. -->
<!-- Hover and focus only emphasize dependency arrows. This wrapper is not a control. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="issues-board-wrap"
  class:issues-dep-active={focusedIssue !== null}
  bind:this={wrapEl}
  onmouseover={trackPointer}
  onmouseleave={clearPointer}
  onfocusin={trackPointer}
  onfocusout={clearPointer}
>
<div class="issues-board p-4">
  {#each columns as column (column.label || 'other')}
    {@const collapsed = collapsedLabels.has(column.label)}
    {@const count = countColumnResults(column.cards, isResult)}
    <!-- The whole column is the drop target for a dragged card, so a collapsed column
         takes a drop on its header. There's no native ARIA role for this, mirroring the
         same tradeoff Card.svelte makes for its pointer-only click target. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="issues-column flex-col rounded-box border border-base-300 bg-base-200"
      style={columnTint(column.color)}
      ondragover={(e) => handleDragOver(e, column)}
      ondragleave={() => handleDragLeave(column)}
      ondrop={(e) => handleDrop(e, column)}
    >
      <div
        class="flex items-center gap-2 py-2 pl-1.5 pr-3 transition-colors {collapsed
          ? `rounded-box ${dropTargetClass(column.label)}`
          : 'border-b border-base-300/60'}"
      >
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square shrink-0"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${column.title}` : `Collapse ${column.title}`}
          title={collapsed ? `Expand "${column.title}"` : `Collapse "${column.title}"`}
          onclick={() => onToggleCollapsed(column.label)}
        >
          <ChevronRight size={14} class="transition-transform {collapsed ? '' : 'rotate-90'}" />
        </button>
        {#if !column.isOther}
          <span class="relative inline-flex shrink-0">
            <button
              type="button"
              class="h-3.5 w-3.5 rounded-md border border-base-content/20 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary"
              style={swatchStyle(column.color)}
              aria-label={`Change color of ${column.title}`}
              title={`Change "${column.title}" color`}
              onclick={(e) => {
                e.stopPropagation()
                openColorLabel = openColorLabel === column.label ? null : column.label
              }}
            ></button>
            {#if openColorLabel === column.label}
              <ColorPicker
                current={column.color}
                onPick={(color) => pickColor(column.label, color)}
                onClose={() => (openColorLabel = null)}
              />
            {/if}
          </span>
        {/if}
        <span class="text-sm font-semibold text-base-content truncate">{column.title}</span>
        <span class="badge badge-ghost badge-sm ml-auto shrink-0" title={issueCountLabel(count)}>{count}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square shrink-0"
          aria-label={column.isOther ? 'Create issue with no label' : `Create issue in ${column.title}`}
          title={column.isOther ? 'Create issue with no label' : `Create issue in ${column.title}`}
          disabled={busy}
          onclick={(e) => addCard(e, column.label)}
        >
          <Plus size={14} />
        </button>
      </div>
      {#if !collapsed}
        <div
          class="flex flex-col gap-2 p-2 overflow-y-auto rounded-box transition-colors {dropTargetClass(
            column.label,
          )}"
        >
          {#each column.cards as card (card.issueNumber)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              draggable={!busy}
              class="issue-group cursor-grab active:cursor-grabbing"
              class:opacity-40={draggedCard?.issueNumber === card.issueNumber}
              class:issues-dep-focus={focusedIssue === card.issueNumber}
              class:issues-dep-peer={peerNumbers.has(card.issueNumber)}
              data-issue-number={card.issueNumber}
              ondragstart={(e) => handleDragStart(e, card, column)}
              ondragend={handleDragEnd}
            >
              <Card
                {card}
                {repo}
                {terms}
                {busy}
                expanded={isExpanded(card.issueNumber)}
                {isExpanded}
                onToggleExpand={toggleExpanded}
                onOpen={() => onCardClick(card, column)}
                onOpenChild={(child) => onCardClick(child, column)}
                {onOpenUrl}
                {onOpenTask}
                {onCopyLink}
                {onSetValue}
                onStart={() => onStart(card)}
                onRevealIssue={revealIssue}
                isDependencyPeer={(issueNumber) => peerNumbers.has(issueNumber)}
                isDependencyFocus={(issueNumber) => focusedIssue === issueNumber}
              />
            </div>
          {/each}
          {#if column.cards.length === 0}
            <p class="text-xs text-base-content/40 text-center py-4 m-0">No issues</p>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
{#if arrows.length > 0}
  <svg class="dep-overlay" aria-hidden="true">
    <defs>
      <marker
        id={markerId}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto"
      >
        <path d="M 0 1.2 L 9 5 L 0 8.8 Z" fill="currentColor" />
      </marker>
    </defs>
    {#each arrows as arrow (`${arrow.blocker}->${arrow.blocked}`)}
      <path class="dep-arrow" class:is-active={arrowIsActive(arrow)} d={arrow.d} marker-end="url(#{markerId})" />
    {/each}
  </svg>
{/if}
</div>

<style>
  /* Masonry-style packing: trays flow into as many ~300px tracks as fit the width and
     stack vertically, so a short tray doesn't leave a tall gap. Height must stay auto —
     the scrolling ancestor (IssuesView's content pane) is what scrolls, not this element.
     A constrained height here would make the browser open extra tracks off to the right
     to fit everything within that height, turning the board into sideways-scrolling
     columns instead of a page that only scrolls down. */
  .issues-board-wrap {
    position: relative;
  }

  .issues-board {
    columns: 300px;
    column-gap: 0.75rem;
  }

  .dep-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    z-index: 3;
    color: color-mix(in srgb, var(--color-warning) 48%, var(--color-base-content));
  }

  .dep-arrow {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    opacity: 0.55;
    transition: opacity 150ms ease;
  }

  .issues-dep-active .dep-arrow {
    opacity: 0.14;
  }

  .issues-dep-active .dep-arrow.is-active {
    opacity: 1;
    stroke-width: 2.25;
  }

  :global(.issues-dep-focus),
  :global(.issues-dep-peer) {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-warning) 62%, var(--color-base-content));
    border-radius: 0.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .dep-arrow {
      transition: none;
    }
  }

  .issues-column {
    break-inside: avoid;
    display: inline-flex;
    margin-bottom: 0.75rem;
    vertical-align: top;
    width: 100%;
  }

  .issue-group {
    display: flex;
    flex-direction: column;
  }
</style>
