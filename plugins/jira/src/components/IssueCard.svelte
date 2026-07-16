<script lang="ts">
  import type { JiraIssue } from '../lib/jiraTypes'

  // `issue.descriptionHtml` is already sanitized by the caller (taskLink.loadIssue)
  // via @openforge-app/plugin-sdk/sanitize before it reaches this component.
  let { issue, onOpen }: { issue: JiraIssue; onOpen: (url: string) => void } = $props()
</script>

<article class="issue">
  <header>
    <button class="key" type="button" onclick={() => onOpen(issue.url)} title="Open in Jira">
      {issue.key}
    </button>
    <span class="status">{issue.status}</span>
  </header>
  <h2 class="summary">{issue.summary}</h2>
  <dl class="meta">
    <div><dt>Type</dt><dd>{issue.issueType}</dd></div>
    <div><dt>Assignee</dt><dd>{issue.assignee ?? 'Unassigned'}</dd></div>
  </dl>
  {#if issue.descriptionHtml}
    <div class="description">{@html issue.descriptionHtml}</div>
  {:else}
    <p class="empty">No description.</p>
  {/if}
</article>

<style>
  .issue { display: flex; flex-direction: column; gap: 0.5rem; }
  header { display: flex; align-items: center; gap: 0.5rem; }
  .key { font-weight: 600; background: none; border: none; padding: 0; color: inherit; cursor: pointer; text-decoration: underline; }
  .status { font-size: 0.8rem; padding: 0.1rem 0.4rem; border: 1px solid currentColor; border-radius: 0.25rem; opacity: 0.8; }
  .summary { font-size: 1rem; margin: 0; }
  .meta { display: flex; gap: 1.5rem; margin: 0; font-size: 0.85rem; }
  .meta dt { opacity: 0.6; }
  .meta dd { margin: 0; }
  .description { font-size: 0.9rem; line-height: 1.5; }
  .description :global(img) { max-width: 100%; }
  .empty { opacity: 0.6; font-style: italic; }
</style>
