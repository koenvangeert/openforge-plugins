<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginTaskPaneProps } from '@openforge-app/plugin-sdk/frontend'
  import { isValidIssueKey } from '../lib/issueKey'
  import type { JiraErrorCode, JiraIssue } from '../lib/jiraTypes'
  import {
    clearLink,
    loadIssue,
    readCachedIssue,
    readLinkedKey,
    saveLinkedKey,
    suggestIssueKey,
  } from '../lib/taskLink'
  import { REFRESH_EVENT } from '../lib/protocol'
  import IssueCard from './IssueCard.svelte'

  let { api, taskId }: PluginTaskPaneProps = $props()

  let linkedKey = $state<string | null>(null)
  let issue = $state<JiraIssue | null>(null)
  let inputKey = $state('')
  let suggestion = $state<string | null>(null)
  let loading = $state(false)
  let error = $state<{ code: JiraErrorCode | 'invalid-key'; message: string } | null>(null)

  async function refresh() {
    if (!linkedKey) return
    loading = true
    error = null
    const result = await loadIssue(api, taskId, linkedKey)
    loading = false
    if (result.ok) {
      issue = result.issue
    } else {
      error = { code: result.error, message: result.message }
    }
  }

  async function offerSuggestion() {
    suggestion = await suggestIssueKey(api, taskId)
    if (suggestion) inputKey = suggestion
  }

  async function link() {
    const key = inputKey.trim().toUpperCase()
    if (!isValidIssueKey(key)) {
      error = { code: 'invalid-key', message: 'Enter a valid issue key like PROJ-123.' }
      return
    }
    linkedKey = key
    await saveLinkedKey(api, taskId, key)
    await refresh()
  }

  async function unlink() {
    await clearLink(api, taskId)
    linkedKey = null
    issue = null
    error = null
    await offerSuggestion()
  }

  onMount(() => {
    void (async () => {
      linkedKey = await readLinkedKey(api, taskId)
      if (linkedKey) {
        issue = await readCachedIssue(api, taskId)
        await refresh()
      } else {
        await offerSuggestion()
      }
    })()
    const subscription = api.events.on(REFRESH_EVENT, () => void refresh())
    return () => void subscription.dispose()
  })
</script>

<section class="flex flex-col gap-3 p-3">
  {#if linkedKey}
    <div class="flex items-center justify-between gap-2">
      <span>Linked to <strong>{linkedKey}</strong></span>
      <span class="flex gap-2">
        <button class="btn btn-primary btn-sm" type="button" onclick={() => void refresh()} disabled={loading}>
          {#if loading}<span class="loading loading-spinner loading-xs"></span>{/if}
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button class="btn btn-ghost btn-sm" type="button" onclick={() => void unlink()}>Unlink</button>
      </span>
    </div>

    {#if error}
      <p class="alert alert-error py-2 text-sm" role="alert">{error.message}</p>
    {/if}

    {#if issue}
      <IssueCard {issue} onOpen={(url) => void api.system.openUrl(url)} />
    {:else if loading}
      <p class="text-sm text-base-content/60">Loading {linkedKey}…</p>
    {:else if !error}
      <p class="text-sm text-base-content/60">No issue data yet.</p>
    {/if}
  {:else}
    <div class="flex flex-col gap-3">
      <p class="text-sm text-base-content/60">This task isn't linked to a Jira issue yet.</p>
      {#if suggestion}
        <p class="text-sm">
          Suggested from the task text: <strong>{suggestion}</strong> — confirm to link.
        </p>
      {/if}
      <div class="flex items-center gap-2">
        <label class="text-xs text-base-content/70" for="jira-key-input">Issue key</label>
        <input
          class="input input-bordered input-sm flex-1"
          id="jira-key-input"
          type="text"
          placeholder="PROJ-123"
          bind:value={inputKey}
          onkeydown={(event) => { if (event.key === 'Enter') void link() }}
        />
        <button class="btn btn-primary btn-sm" type="button" onclick={() => void link()}>Link</button>
      </div>
      {#if error}
        <p class="alert alert-error py-2 text-sm" role="alert">{error.message}</p>
      {/if}
    </div>
  {/if}
</section>
