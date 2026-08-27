<script lang="ts">
  import { ChevronDown, ChevronRight } from '@lucide/svelte'
  import type { BoardCard } from '../lib/board'
  import { cardExcerpt, type SearchTerms } from '../lib/search'
  import HighlightedText from './HighlightedText.svelte'
  import SubIssueList from './SubIssueList.svelte'

  interface Props {
    issues: BoardCard[]
    parentNumber: number
    terms?: SearchTerms
    onOpen: (card: BoardCard) => void
    onContextMenu: (event: MouseEvent, card: BoardCard) => void
    isExpanded: (issueNumber: number) => boolean
    onToggleExpand: (issueNumber: number) => void
  }

  let { issues, parentNumber, terms = [], onOpen, onContextMenu, isExpanded, onToggleExpand }: Props =
    $props()

  function handleKeydown(event: KeyboardEvent, card: BoardCard) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(card)
    }
  }

  function expandLabel(issue: BoardCard, expanded: boolean): string {
    const count = issue.subIssues.length
    const noun = count === 1 ? 'sub-issue' : 'sub-issues'
    return `${expanded ? 'Hide' : 'Show'} ${count} ${noun} of #${issue.issueNumber}`
  }
</script>

<ul class="sub-issue-list" aria-label={`Sub-issues of #${parentNumber}`}>
  {#each issues as issue (issue.issueNumber)}
    {@const excerpt = cardExcerpt(issue, terms)}
    {@const expanded = isExpanded(issue.issueNumber)}
    <li class="sub-issue-item">
      <div class="sub-issue-line">
        {#if issue.subIssues.length > 0}
          <button
            type="button"
            class="sub-issue-toggle"
            aria-expanded={expanded}
            aria-label={expandLabel(issue, expanded)}
            onclick={(event) => {
              event.stopPropagation()
              onToggleExpand(issue.issueNumber)
            }}
          >
            {#if expanded}
              <ChevronDown size={14} />
            {:else}
              <ChevronRight size={14} />
            {/if}
          </button>
        {:else}
          <span class="sub-issue-toggle-spacer" aria-hidden="true"></span>
        {/if}
        <div
          class="sub-issue-row"
          role="button"
          tabindex="0"
          aria-label={`Issue #${issue.issueNumber}: ${issue.title}`}
          onclick={() => onOpen(issue)}
          onkeydown={(event) => handleKeydown(event, issue)}
          oncontextmenu={(event) => onContextMenu(event, issue)}
        >
          <div class="sub-issue-main">
            <span class="sub-issue-number">#{issue.issueNumber}</span>
            <span class="sub-issue-title">
              <HighlightedText text={issue.title} {terms} />
            </span>
            {#if issue.subIssuesSummary}
              <span
                class="badge badge-ghost badge-xs tabular-nums shrink-0"
                aria-label={`${issue.subIssuesSummary.completed} of ${issue.subIssuesSummary.total} sub-issues complete`}
              >{issue.subIssuesSummary.completed}/{issue.subIssuesSummary.total}</span>
            {/if}
          </div>
          {#if excerpt}
            <p class="sub-issue-excerpt">
              <HighlightedText text={excerpt} {terms} />
            </p>
          {/if}
        </div>
      </div>
      {#if issue.subIssues.length > 0 && expanded}
        <SubIssueList
          issues={issue.subIssues}
          parentNumber={issue.issueNumber}
          {terms}
          {isExpanded}
          {onToggleExpand}
          {onOpen}
          {onContextMenu}
        />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .sub-issue-list {
    list-style: none;
    margin: 0;
    padding: 0.15rem 0 0 0.45rem;
    border-left: 1px solid color-mix(in srgb, var(--color-base-content) 18%, var(--color-base-300));
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .sub-issue-item {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sub-issue-line {
    display: flex;
    align-items: flex-start;
    gap: 0.1rem;
    min-width: 0;
  }

  .sub-issue-toggle,
  .sub-issue-toggle-spacer {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.28rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: color-mix(in srgb, var(--color-base-content) 55%, transparent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .sub-issue-toggle:hover,
  .sub-issue-toggle:focus-visible {
    color: var(--color-base-content);
    background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
    outline: none;
  }

  .sub-issue-toggle:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .sub-issue-toggle-spacer {
    cursor: default;
  }

  .sub-issue-row {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.28rem 0.4rem;
    border-radius: 0.35rem;
    cursor: pointer;
  }

  .sub-issue-row:hover,
  .sub-issue-row:focus-visible {
    background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
    outline: none;
  }

  .sub-issue-row:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .sub-issue-main {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    min-width: 0;
  }

  .sub-issue-number {
    flex-shrink: 0;
    font-size: 0.75rem;
    line-height: 1.3;
    color: color-mix(in srgb, var(--color-base-content) 55%, transparent);
  }

  .sub-issue-title {
    flex: 1;
    min-width: 0;
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.35;
    color: var(--color-base-content);
    overflow-wrap: anywhere;
  }

  .sub-issue-excerpt {
    margin: 0;
    font-size: 0.7rem;
    line-height: 1.3;
    color: color-mix(in srgb, var(--color-base-content) 62%, transparent);
  }
</style>
