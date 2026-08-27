<script lang="ts">
  import { ChevronDown, ChevronRight, ExternalLink, Copy, MoreVertical } from '@lucide/svelte'
  import type { BoardCard } from '../lib/board'
  import { cardExcerpt, type SearchTerms } from '../lib/search'
  import { valueBandColor } from '../lib/valueColor'
  import HighlightedText from './HighlightedText.svelte'
  import SubIssueList from './SubIssueList.svelte'

  interface Props {
    card: BoardCard
    repo: string
    onOpen: () => void
    onOpenUrl: (url: string) => void
    onCopyLink: (issueNumber: number) => void
    onContextMenu: (event: MouseEvent) => void
    /** Active search terms, for title highlighting and the body-match excerpt. */
    terms?: SearchTerms
    expanded?: boolean
    onToggleExpand?: (issueNumber: number) => void
    onOpenChild?: (card: BoardCard) => void
    onChildContextMenu?: (event: MouseEvent, card: BoardCard) => void
    isExpanded?: (issueNumber: number) => boolean
  }

  let {
    card,
    repo,
    onOpen,
    onOpenUrl,
    onCopyLink,
    onContextMenu,
    terms = [],
    expanded = false,
    onToggleExpand,
    onOpenChild,
    onChildContextMenu,
    isExpanded,
  }: Props = $props()

  let issueUrl = $derived(`https://github.com/${repo}/issues/${card.issueNumber}`)
  let excerpt = $derived(cardExcerpt(card, terms))

  // Soft-tint the value badge with its priority-band color, the same
  // color-mix-over-theme-token approach Board.svelte uses for label swatches.
  function valueBadgeStyle(value: number): string {
    const hex = valueBandColor(value)
    return `background-color: color-mix(in srgb, #${hex} 18%, var(--color-base-100)); border-color: color-mix(in srgb, #${hex} 50%, var(--color-base-300)); color: color-mix(in srgb, #${hex} 70%, var(--color-base-content));`
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

  let nestedCount = $derived(card.subIssues.length)
  let expandLabel = $derived(
    nestedCount === 1
      ? `${expanded ? 'Hide' : 'Show'} 1 sub-issue of #${card.issueNumber}`
      : `${expanded ? 'Hide' : 'Show'} ${nestedCount} sub-issues of #${card.issueNumber}`,
  )
</script>

<article
  class="card card-compact bg-base-100 border border-base-300 shadow-sm hover:border-primary/50 transition-colors"
  oncontextmenu={onContextMenu}
>
  <div class="card-body p-3 gap-2">
    <div class="flex items-start gap-1">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex-1 min-w-0 flex flex-col gap-2 cursor-pointer"
        role="button"
        tabindex="0"
        onclick={onOpen}
        onkeydown={handleKeydown}
      >
        <div class="flex items-start gap-2">
          <span class="text-sm font-medium text-base-content flex-1 min-w-0 break-words">
            <HighlightedText text={card.title} {terms} />
          </span>
          {#if card.value !== null}
            <span
              class="badge badge-sm shrink-0 font-semibold"
              style={valueBadgeStyle(card.value)}
              title="Value"
            >{card.value}</span>
          {/if}
        </div>
        {#if excerpt}
          <p class="text-xs text-base-content/60 break-words m-0">
            <HighlightedText text={excerpt} {terms} />
          </p>
        {/if}
        <div class="flex items-center gap-1">
          <span class="text-xs text-base-content/40">#{card.issueNumber}</span>
          {#if card.parentIssueNumber !== null}
            <span class="text-xs text-base-content/50">Parent #{card.parentIssueNumber}</span>
          {/if}
          {#if card.subIssuesSummary}
            <span
              class="badge badge-ghost badge-xs tabular-nums"
              title="Sub-issue progress"
              aria-label={`${card.subIssuesSummary.completed} of ${card.subIssuesSummary.total} sub-issues complete`}
            >{card.subIssuesSummary.completed}/{card.subIssuesSummary.total}</span>
          {/if}
          {#if card.taskLink}
            <span class="badge badge-outline badge-xs" title="OpenForge task">{card.taskLink.taskId}</span>
          {/if}
        </div>
      </div>
      <div class="ml-auto flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          title="Issue actions"
          aria-label="Issue actions"
          onclick={(e) => { e.stopPropagation(); onContextMenu(e) }}
        >
          <MoreVertical size={14} />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          title="Open issue on GitHub"
          aria-label="Open issue on GitHub"
          onclick={(e) => { e.stopPropagation(); onOpenUrl(issueUrl) }}
        >
          <ExternalLink size={14} />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          title="Copy issue link"
          aria-label="Copy issue link"
          onclick={(e) => { e.stopPropagation(); onCopyLink(card.issueNumber) }}
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
    {#if nestedCount > 0 && onToggleExpand && onOpenChild && onChildContextMenu && isExpanded}
      <button
        type="button"
        class="btn btn-ghost btn-xs justify-start gap-1 h-7 min-h-0 px-1 self-start"
        aria-expanded={expanded}
        aria-label={expandLabel}
        onclick={(event) => {
          event.stopPropagation()
          onToggleExpand(card.issueNumber)
        }}
      >
        {#if expanded}
          <ChevronDown size={14} />
        {:else}
          <ChevronRight size={14} />
        {/if}
        <span>{nestedCount} {nestedCount === 1 ? 'sub-issue' : 'sub-issues'}</span>
      </button>
      {#if expanded}
        <SubIssueList
          issues={card.subIssues}
          parentNumber={card.issueNumber}
          {terms}
          {isExpanded}
          onToggleExpand={onToggleExpand}
          onOpen={onOpenChild}
          onContextMenu={onChildContextMenu}
        />
      {/if}
    {/if}
  </div>
</article>
