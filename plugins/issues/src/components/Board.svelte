<script lang="ts">
  import { Plus } from '@lucide/svelte'
  import type { BoardCard, BoardColumn } from '../lib/board'
  import type { SearchTerms } from '../lib/search'
  import Card from './Card.svelte'
  import ColorPicker from './ColorPicker.svelte'
  import IssueContextMenu from './IssueContextMenu.svelte'

  interface Props {
    columns: BoardColumn[]
    repo: string
    onCardClick: (card: BoardCard, column: BoardColumn) => void
    onOpenUrl: (url: string) => void
    onCopyLink: (issueNumber: number) => void
    onRecolor: (label: string, color: string) => void
    busy?: boolean
    onStart: (card: BoardCard) => void
    onAddCard: (label: string) => void
    /** Move a dragged card from one column's label to another's. */
    onMoveCard: (issueNumber: number, fromLabel: string, toLabel: string) => void
    /** Active search terms, forwarded to each Card for highlighting. */
    terms?: SearchTerms
  }

  let {
    columns,
    repo,
    onCardClick,
    onOpenUrl,
    onCopyLink,
    onRecolor,
    busy = false,
    onStart,
    onAddCard,
    onMoveCard,
    terms = [],
  }: Props = $props()

  let openColorLabel = $state<string | null>(null)
  // The card currently being dragged, and the label of the column it's hovering over
  // (a valid drop target only — the column it came from never lights up). Column-to-
  // column moves only: this board has no manual card ordering (see lib/board.ts), so
  // there's nothing to persist for a drop back inside the same column.
  let draggedCard = $state<{ issueNumber: number; fromLabel: string } | null>(null)
  let dragOverLabel = $state<string | null>(null)
  let contextMenu = $state<{ visible: boolean; x: number; y: number; card: BoardCard | null }>({
    visible: false,
    x: 0,
    y: 0,
    card: null,
  })

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

  function pickColor(label: string, color: string) {
    openColorLabel = null
    onRecolor(label, color)
  }

  function openContextMenu(event: MouseEvent, card: BoardCard) {
    event.preventDefault()
    event.stopPropagation()
    contextMenu = { visible: true, x: event.clientX, y: event.clientY, card }
  }

  function closeContextMenu() {
    contextMenu = { ...contextMenu, visible: false }
  }

  function runStart() {
    const card = contextMenu.card
    closeContextMenu()
    if (card) onStart(card)
  }

  function addCard(event: MouseEvent, label: string) {
    event.stopPropagation()
    onAddCard(label)
  }

  function handleDragStart(event: DragEvent, card: BoardCard, column: BoardColumn) {
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

  function handleDrop(event: DragEvent, column: BoardColumn) {
    event.preventDefault()
    const dragged = draggedCard
    draggedCard = null
    dragOverLabel = null
    if (!dragged || dragged.fromLabel === column.label) return
    onMoveCard(dragged.issueNumber, dragged.fromLabel, column.label)
  }
</script>

<div class="issues-board p-4">
  {#each columns as column (column.label || 'other')}
    <div
      class="issues-column flex-col rounded-box border border-base-300 bg-base-200"
      style={columnTint(column.color)}
    >
      <div class="flex items-center gap-2 px-3 py-2 border-b border-base-300/60">
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
        <span class="badge badge-ghost badge-sm ml-auto shrink-0">{column.cards.length}</span>
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
      <!-- Drop target for a dragged card; there's no native ARIA role for this, mirroring
           the same tradeoff Card.svelte makes for its pointer-only click target. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex flex-col gap-2 p-2 overflow-y-auto rounded-box transition-colors {dropTargetClass(
          column.label,
        )}"
        ondragover={(e) => handleDragOver(e, column)}
        ondragleave={() => handleDragLeave(column)}
        ondrop={(e) => handleDrop(e, column)}
      >
        {#each column.cards as card (card.issueNumber)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            draggable={!busy}
            class="cursor-grab active:cursor-grabbing"
            class:opacity-40={draggedCard?.issueNumber === card.issueNumber}
            ondragstart={(e) => handleDragStart(e, card, column)}
            ondragend={handleDragEnd}
          >
            <Card
              {card}
              {repo}
              {terms}
              onOpen={() => {
                closeContextMenu()
                onCardClick(card, column)
              }}
              {onOpenUrl}
              {onCopyLink}
              onContextMenu={(event) => openContextMenu(event, card)}
            />
          </div>
        {/each}
        {#if column.cards.length === 0}
          <p class="text-xs text-base-content/40 text-center py-4 m-0">No issues</p>
        {/if}
      </div>
    </div>
  {/each}

  <IssueContextMenu
    visible={contextMenu.visible}
    x={contextMenu.x}
    y={contextMenu.y}
    disabled={busy}
    onClose={closeContextMenu}
    onStart={runStart}
  />
</div>

<style>
  /* Masonry-style packing: trays flow into as many ~300px tracks as fit the width and
     stack vertically, so a short tray doesn't leave a tall gap. Height must stay auto —
     the scrolling ancestor (IssuesView's content pane) is what scrolls, not this element.
     A constrained height here would make the browser open extra tracks off to the right
     to fit everything within that height, turning the board into sideways-scrolling
     columns instead of a page that only scrolls down. */
  .issues-board {
    columns: 300px;
    column-gap: 0.75rem;
  }

  .issues-column {
    break-inside: avoid;
    display: inline-flex;
    margin-bottom: 0.75rem;
    vertical-align: top;
    width: 100%;
  }
</style>
