<script lang="ts">
  import { ChevronDown, ChevronRight, ExternalLink, Copy, MoreVertical } from '@lucide/svelte'
  import type { BoardCard } from '../lib/board'
  import { cardExcerpt, type SearchTerms } from '../lib/search'
  import { valueBandColor } from '../lib/valueColor'
  import HighlightedText from './HighlightedText.svelte'
  import LinkedPullRequestLinks from './LinkedPullRequestLinks.svelte'
  import SubIssueList from './SubIssueList.svelte'
  import ValuePicker from './ValuePicker.svelte'

  interface Props {
    card: BoardCard
    repo: string
    onOpen: () => void
    onOpenUrl: (url: string) => void
    onOpenTask: (taskId: string) => void
    onCopyLink: (issueNumber: number) => void
    onSetValue: (issueNumber: number, value: number | null) => void
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
    onOpenTask,
    onCopyLink,
    onSetValue,
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
  let valuePickerOpen = $state(false)

  function pickValue(value: number | null) {
    valuePickerOpen = false
    onSetValue(card.issueNumber, value)
  }

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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex flex-col gap-2 min-w-0 cursor-pointer"
      role="button"
      tabindex="0"
      onclick={onOpen}
      onkeydown={handleKeydown}
    >
      <div class="flex items-start gap-2">
        <span class="text-sm font-medium text-base-content flex-1 min-w-0 break-words">
          <HighlightedText text={card.title} {terms} />
        </span>
        <!-- Wrapping stopPropagation keeps every click here — opening the picker,
             picking a number, dismissing it — from also bubbling to onOpen above.
             The span itself carries no interaction of its own; the button and
             picker inside it are the real (keyboard-operable) controls. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span class="relative inline-flex shrink-0" onclick={(e) => e.stopPropagation()}>
          <button
            type="button"
            class="badge badge-sm font-semibold cursor-pointer hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary {card.value === null
              ? 'badge-ghost opacity-60'
              : ''}"
            style={card.value !== null ? valueBadgeStyle(card.value) : ''}
            title={card.value !== null ? `Value: ${card.value}. Click to change.` : 'Set value'}
            aria-label={card.value !== null ? `Value: ${card.value}. Click to change.` : 'Set value'}
            aria-haspopup="listbox"
            aria-expanded={valuePickerOpen}
            onclick={() => (valuePickerOpen = !valuePickerOpen)}
          >{card.value ?? '+'}</button>
          {#if valuePickerOpen}
            <ValuePicker current={card.value} onPick={pickValue} onClose={() => (valuePickerOpen = false)} />
          {/if}
        </span>
      </div>
      {#if excerpt}
        <p class="text-xs text-base-content/60 break-words m-0">
          <HighlightedText text={excerpt} {terms} />
        </p>
      {/if}
      <!-- Ticket number and per-card actions share this row — keeping the actions off
           the title row above is what lets the title use the card's full width. -->
      <div class="flex items-center gap-1 flex-wrap">
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
        <LinkedPullRequestLinks pullRequests={card.linkedPullRequests} {onOpenUrl} />
        {#if card.taskLink}
          <!-- Bind the id here: the click handler runs later, and a board refresh that
               clears taskLink in between would otherwise dereference null. -->
          {@const taskId = card.taskLink.taskId}
          {@const taskTitle = card.taskLink.title}
          <button
            type="button"
            class="issue-meta-chip badge badge-outline badge-xs font-normal shrink-0 cursor-pointer"
            title="OpenForge task"
            aria-label={taskTitle ? `Open OpenForge task ${taskId}: ${taskTitle}` : `Open OpenForge task ${taskId}`}
            onclick={(event) => {
              event.stopPropagation()
              onOpenTask(taskId)
            }}
            onkeydown={(event) => event.stopPropagation()}
          >{taskId}</button>
        {/if}
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
          {onOpenUrl}
        />
      {/if}
    {/if}
  </div>
</article>

<style>
  /* Task id and linked-PR chips share one hover/focus treatment so they read as the same control. */
  :global(.issue-meta-chip) {
    transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease;
  }

  :global(.issue-meta-chip:hover),
  :global(.issue-meta-chip:focus-visible) {
    border-color: color-mix(in srgb, var(--color-primary) 70%, var(--color-base-300));
    background-color: color-mix(in srgb, var(--color-primary) 14%, var(--color-base-100));
    color: color-mix(in srgb, var(--color-primary) 80%, var(--color-base-content));
  }

  :global(.issue-meta-chip:focus-visible) {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.issue-meta-chip) {
      transition: none;
    }
  }
</style>
