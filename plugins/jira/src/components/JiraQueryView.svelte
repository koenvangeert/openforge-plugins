<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginViewProps } from '@openforge-app/plugin-sdk/frontend'
  import type { JiraErrorCode, JiraSearchRow } from '../lib/jiraTypes'
  import { readLastJql, runQuery } from '../lib/jqlQuery'
  import { REFRESH_EVENT } from '../lib/protocol'

  let { api }: PluginViewProps = $props()

  let jql = $state('')
  let rows = $state<JiraSearchRow[]>([])
  let loading = $state(false)
  let hasRun = $state(false)
  let error = $state<{ code: JiraErrorCode; message: string } | null>(null)

  async function run() {
    loading = true
    error = null
    const result = await runQuery(api, jql)
    loading = false
    hasRun = true
    if (result.ok) {
      rows = result.rows
    } else {
      rows = []
      error = { code: result.error, message: result.message }
    }
  }

  function onKeydown(event: KeyboardEvent) {
    // Cmd/Ctrl+Enter runs the query; plain Enter stays a newline for multi-line JQL.
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void run()
    }
  }

  onMount(() => {
    void (async () => {
      jql = await readLastJql(api)
      if (jql.trim().length > 0) await run()
    })()
    const subscription = api.events.on(REFRESH_EVENT, () => void run())
    return () => void subscription.dispose()
  })
</script>

<section class="flex flex-col gap-3 p-4 h-full min-h-0">
  <header class="flex items-center justify-between gap-2 shrink-0">
    <h2 class="text-sm font-semibold text-base-content/80">Jira issues</h2>
    {#if hasRun && !loading && !error}
      <span class="text-xs text-base-content/50">{rows.length} result{rows.length === 1 ? '' : 's'}</span>
    {/if}
  </header>

  <div class="flex flex-col gap-2 shrink-0">
    <textarea
      class="textarea textarea-bordered w-full font-mono text-xs leading-relaxed"
      rows="3"
      placeholder="assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
      bind:value={jql}
      onkeydown={onKeydown}
    ></textarea>
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs text-base-content/40">⌘/Ctrl + Enter to run</span>
      <button class="btn btn-primary btn-sm" onclick={() => void run()} disabled={loading}>
        {#if loading}<span class="loading loading-spinner loading-xs"></span>{/if}
        {loading ? 'Searching…' : 'Run'}
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert alert-error text-sm py-2">{error.message}</div>
  {:else if loading}
    <div class="flex items-center gap-2 text-sm text-base-content/60">
      <span class="loading loading-spinner loading-sm"></span> Searching…
    </div>
  {:else if hasRun && rows.length === 0}
    <p class="text-sm text-base-content/60">No issues match this query.</p>
  {:else if rows.length > 0}
    <ul class="flex flex-col gap-1 overflow-auto min-h-0">
      {#each rows as row (row.key)}
        <li>
          <button
            class="btn btn-ghost btn-sm w-full h-auto py-2 justify-start gap-2 normal-case font-normal"
            onclick={() => void api.system.openUrl(row.url)}
            title="Open {row.key} in Jira"
          >
            <span class="badge badge-primary badge-sm shrink-0">{row.key}</span>
            <span class="flex-1 text-left truncate">{row.summary}</span>
            <span class="badge badge-ghost badge-sm shrink-0">{row.status}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
