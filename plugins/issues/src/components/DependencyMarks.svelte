<script lang="ts">
  import type { IssueRelation } from '../lib/board'
  import { relationLabel, relationWindow, sameRepo } from '../lib/dependency'

  interface Props {
    blockedBy: IssueRelation[]
    blocking: IssueRelation[]
    blockedByOpenCount: number
    blockingOpenCount: number
    repo: string
    onOpenUrl: (url: string) => void
    onRevealIssue?: (issueNumber: number) => boolean
  }

  let {
    blockedBy,
    blocking,
    blockedByOpenCount,
    blockingOpenCount,
    repo,
    onOpenUrl,
    onRevealIssue = () => false,
  }: Props = $props()

  let blockedWindow = $derived(relationWindow(blockedBy, blockedByOpenCount))
  let blockingWindow = $derived(relationWindow(blocking, blockingOpenCount))

  function openRelation(relation: IssueRelation): void {
    if (sameRepo(relation.repo, repo) && onRevealIssue(relation.number)) return
    onOpenUrl(relation.htmlUrl)
  }

  function relationName(relation: IssueRelation, kind: 'blocked' | 'blocking'): string {
    const label = relationLabel(relation, repo)
    const title = relation.title ? ` ${relation.title}` : ''
    if (sameRepo(relation.repo, repo)) {
      return kind === 'blocked'
        ? `Show ${label}${title}, which blocks this issue`
        : `Show ${label}${title}, which this issue blocks`
    }
    return kind === 'blocked'
      ? `Open ${label}${title} on GitHub. It blocks this issue.`
      : `Open ${label}${title} on GitHub. This issue blocks it.`
  }
</script>

{#if blockedByOpenCount > 0}
  <!-- Clicks here must not open the card. The buttons inside are the controls. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dep-marks" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
    {#if blockedWindow.shown.length === 0}
      <span class="dep-chip dep-chip-blocked">Blocked by {blockedByOpenCount}</span>
    {:else}
      <span class="dep-chip dep-chip-blocked">Blocked by</span>
      {#each blockedWindow.shown as relation (relation.repo + relation.number)}
        <button
          type="button"
          class="dep-chip dep-chip-blocked"
          aria-label={relationName(relation, 'blocked')}
          title={relation.title || relationLabel(relation, repo)}
          onclick={() => openRelation(relation)}
        >{relationLabel(relation, repo)}</button>
      {/each}
      {#if blockedWindow.extra > 0}
        <span class="dep-chip dep-chip-blocked" title="{blockedWindow.extra} more blocking issues">+{blockedWindow.extra}</span>
      {/if}
    {/if}
  </div>
{/if}
{#if blockingOpenCount > 0}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dep-marks" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
    {#if blockingWindow.shown.length === 0}
      <span class="dep-chip dep-chip-blocking">Blocks {blockingOpenCount}</span>
    {:else}
      <span class="dep-chip dep-chip-blocking">Blocks</span>
      {#each blockingWindow.shown as relation (relation.repo + relation.number)}
        <button
          type="button"
          class="dep-chip dep-chip-blocking"
          aria-label={relationName(relation, 'blocking')}
          title={relation.title || relationLabel(relation, repo)}
          onclick={() => openRelation(relation)}
        >{relationLabel(relation, repo)}</button>
      {/each}
      {#if blockingWindow.extra > 0}
        <span class="dep-chip dep-chip-blocking" title="{blockingWindow.extra} more blocked issues">+{blockingWindow.extra}</span>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .dep-marks {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .dep-chip {
    display: inline-flex;
    align-items: center;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 999px;
    border: 1px solid transparent;
    padding: 0 0.4rem;
    font-size: 0.6875rem;
    line-height: 1.35rem;
    font-weight: 500;
  }

  button.dep-chip {
    cursor: pointer;
  }

  button.dep-chip:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .dep-chip-blocked {
    background-color: color-mix(in srgb, var(--color-warning) 22%, var(--color-base-100));
    border-color: color-mix(in srgb, var(--color-warning) 55%, var(--color-base-300));
    color: color-mix(in srgb, var(--color-warning) 28%, var(--color-base-content));
  }

  .dep-chip-blocking {
    background-color: color-mix(in srgb, var(--color-info) 16%, var(--color-base-100));
    border-color: color-mix(in srgb, var(--color-info) 45%, var(--color-base-300));
    color: color-mix(in srgb, var(--color-info) 28%, var(--color-base-content));
  }

  button.dep-chip-blocked:hover,
  button.dep-chip-blocking:hover {
    filter: brightness(0.96);
  }

  @media (prefers-reduced-motion: reduce) {
    button.dep-chip {
      transition: none;
    }
  }
</style>
