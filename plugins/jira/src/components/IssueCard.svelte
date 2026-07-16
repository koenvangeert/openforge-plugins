<script lang="ts">
  import type { JiraIssue } from '../lib/jiraTypes'

  // `issue.descriptionHtml` is already sanitized by the caller (taskLink.loadIssue)
  // via @openforge-app/plugin-sdk/sanitize before it reaches this component.
  let { issue, onOpen }: { issue: JiraIssue; onOpen: (url: string) => void } = $props()
</script>

<article class="flex flex-col gap-2">
  <header class="flex items-center gap-2">
    <button
      class="btn btn-link btn-sm h-auto min-h-0 p-0 font-semibold text-base-content underline"
      type="button"
      onclick={() => onOpen(issue.url)}
      title="Open in Jira"
    >
      {issue.key}
    </button>
    <span class="badge badge-outline badge-sm opacity-80">{issue.status}</span>
  </header>
  <h2 class="m-0 text-base">{issue.summary}</h2>
  <dl class="m-0 flex gap-6 text-sm">
    <div><dt class="text-base-content/60">Type</dt><dd class="m-0">{issue.issueType}</dd></div>
    <div>
      <dt class="text-base-content/60">Assignee</dt>
      <dd class="m-0">{issue.assignee ?? 'Unassigned'}</dd>
    </div>
    <div>
      <dt class="text-base-content/60">Priority</dt>
      <dd class="m-0">{issue.priority ?? 'None'}</dd>
    </div>
  </dl>
  {#if issue.descriptionHtml}
    <div class="markdown-body">{@html issue.descriptionHtml}</div>
  {:else}
    <p class="text-base-content/60 italic">No description.</p>
  {/if}
</article>
