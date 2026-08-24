<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginTaskUISectionProps } from '@openforge-app/plugin-sdk/frontend'
  import { isValidIssueKey } from '../lib/issueKey'
  import type { JiraIssue } from '../lib/jiraTypes'
  import { REFRESH_EVENT } from '../lib/protocol'
  import {
    clearLink,
    loadIssue,
    readIssueSnapshot,
    readLinkedKey,
    saveLinkedKey,
    suggestIssueKey,
  } from '../lib/taskLink'

  let { api, taskId }: PluginTaskUISectionProps = $props()

  let expanded = $state(true)
  let initialized = $state(false)
  let linkedKey = $state<string | null>(null)
  let issue = $state<JiraIssue | null>(null)
  let refreshedAt = $state<string | null>(null)
  let inputKey = $state('')
  let suggestion = $state<string | null>(null)
  let loading = $state(false)
  let linking = $state(false)
  let unlinking = $state(false)
  let error = $state<string | null>(null)
  let refreshGeneration = 0
  let lifecycleGeneration = 0
  let contentId = $derived(`jira-linked-issue-${taskId}`)

  function isCurrentTask(expectedTaskId: string, expectedLifecycle: number): boolean {
    return taskId === expectedTaskId && lifecycleGeneration === expectedLifecycle
  }

  function descriptionExcerpt(descriptionHtml: string): string {
    if (!descriptionHtml) return 'No description.'
    const container = document.createElement('div')
    container.innerHTML = descriptionHtml
    const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return 'No description.'
    return text.length > 240 ? `${text.slice(0, 237).trimEnd()}…` : text
  }

  function formatRefreshTime(value: string | null): string {
    if (!value) return 'Not refreshed yet'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Refresh time unavailable'
    return `Last refreshed ${date.toLocaleString()}`
  }

  function unexpectedMessage(cause: unknown, action: string): string {
    const detail = cause instanceof Error ? cause.message.trim() : ''
    return detail ? `${action}: ${detail}` : action
  }

  /**
   * Load the linked Issue. A silent load neither shows the busy state nor
   * reports an error: it is revalidating something the user is already reading,
   * and disturbing that is the churn this section is meant to avoid.
   */
  async function refresh({ force = false }: { force?: boolean } = {}) {
    const key = linkedKey
    if (!key) return

    const silent = !force && issue !== null
    const expectedTaskId = taskId
    const expectedLifecycle = lifecycleGeneration
    const generation = ++refreshGeneration
    if (!silent) {
      loading = true
      error = null
    }
    try {
      const result = await loadIssue(api, expectedTaskId, key, { force })
      if (!isCurrentTask(expectedTaskId, expectedLifecycle) || generation !== refreshGeneration || linkedKey !== key) return
      if (result.ok) {
        issue = result.issue
        refreshedAt = result.refreshedAt
        // A read that succeeded outranks a stale alert, even a silent one: the
        // section must not report a failure it has since disproved.
        error = null
      } else if (!silent) {
        error = result.message
      }
    } catch (cause) {
      if (!silent && isCurrentTask(expectedTaskId, expectedLifecycle) && generation === refreshGeneration && linkedKey === key) {
        error = unexpectedMessage(cause, 'Could not refresh the Jira Issue')
      }
    } finally {
      if (isCurrentTask(expectedTaskId, expectedLifecycle) && generation === refreshGeneration) loading = false
    }
  }

  async function offerSuggestion(expectedTaskId = taskId, expectedLifecycle = lifecycleGeneration) {
    const hint = await suggestIssueKey(api, expectedTaskId)
    if (!isCurrentTask(expectedTaskId, expectedLifecycle) || linkedKey) return
    suggestion = hint
    if (hint) inputKey = hint
  }

  async function link() {
    const key = inputKey.trim().toUpperCase()
    if (!isValidIssueKey(key)) {
      error = 'Enter a valid Issue Key like PROJ-123.'
      return
    }

    linking = true
    error = null
    const expectedTaskId = taskId
    const expectedLifecycle = lifecycleGeneration
    try {
      await saveLinkedKey(api, expectedTaskId, key)
      if (!isCurrentTask(expectedTaskId, expectedLifecycle)) return
      linkedKey = key
      suggestion = null
      issue = null
      refreshedAt = null
      await refresh({ force: true })
    } catch (cause) {
      if (isCurrentTask(expectedTaskId, expectedLifecycle)) {
        error = unexpectedMessage(cause, 'Could not link the Jira Issue')
      }
    } finally {
      if (isCurrentTask(expectedTaskId, expectedLifecycle)) linking = false
    }
  }

  async function unlink() {
    const expectedTaskId = taskId
    const expectedLifecycle = lifecycleGeneration
    ++refreshGeneration
    loading = false
    unlinking = true
    error = null
    try {
      await clearLink(api, expectedTaskId)
      if (!isCurrentTask(expectedTaskId, expectedLifecycle)) return
      linkedKey = null
      issue = null
      refreshedAt = null
      inputKey = ''
      await offerSuggestion(expectedTaskId, expectedLifecycle)
    } catch (cause) {
      if (isCurrentTask(expectedTaskId, expectedLifecycle)) {
        error = unexpectedMessage(cause, 'Could not unlink the Jira Issue')
      }
    } finally {
      if (isCurrentTask(expectedTaskId, expectedLifecycle)) unlinking = false
    }
  }

  function toggleExpanded() {
    expanded = !expanded
    if (expanded && initialized && linkedKey) void refresh()
  }

  async function openInJira() {
    if (!issue) return
    try {
      await api.system.openUrl(issue.url)
    } catch (cause) {
      error = unexpectedMessage(cause, 'Could not open the Jira Issue')
    }
  }

  onMount(() => {
    const subscription = api.events.on(REFRESH_EVENT, () => void refresh({ force: true }))
    return () => {
      void subscription.dispose()
    }
  })

  $effect(() => {
    const expectedTaskId = taskId
    const expectedLifecycle = ++lifecycleGeneration
    ++refreshGeneration
    initialized = false
    linkedKey = null
    issue = null
    refreshedAt = null
    inputKey = ''
    suggestion = null
    loading = false
    linking = false
    unlinking = false
    error = null

    void (async () => {
      try {
        const key = await readLinkedKey(api, expectedTaskId)
        if (!isCurrentTask(expectedTaskId, expectedLifecycle)) return
        linkedKey = key
        if (key) {
          const cached = await readIssueSnapshot(api, expectedTaskId, key)
          if (!isCurrentTask(expectedTaskId, expectedLifecycle)) return
          issue = cached?.issue ?? null
          refreshedAt = cached?.refreshedAt ?? null
          initialized = true
          if (expanded) await refresh()
        } else {
          initialized = true
          await offerSuggestion(expectedTaskId, expectedLifecycle)
        }
      } catch (cause) {
        if (isCurrentTask(expectedTaskId, expectedLifecycle)) {
          initialized = true
          error = unexpectedMessage(cause, 'Could not load the Issue Link')
        }
      }
    })()

    return () => {
      if (lifecycleGeneration === expectedLifecycle) {
        ++lifecycleGeneration
        ++refreshGeneration
      }
    }
  })
</script>

<section
  data-task-info-card="linked-issue"
  data-card-sizing="natural"
  class="shrink-0 overflow-hidden rounded-lg border border-base-300/70 bg-base-100"
  aria-label="Linked Issue"
>
  <h3 class="m-0">
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-base-content hover:bg-base-200/40 focus-visible:ring-2 focus-visible:ring-primary"
      aria-expanded={expanded}
      aria-controls={contentId}
      onclick={toggleExpanded}
    >
      <span
        class="shrink-0 text-[0.7rem] leading-none text-base-content/40 transition-transform duration-150 {expanded ? '' : '-rotate-90'}"
        aria-hidden="true"
      >▾</span>
      <span class="truncate">Linked Issue</span>
    </button>
  </h3>

  {#if expanded}
    <div id={contentId} class="border-t border-base-300/70 px-3 py-2" aria-busy={loading}>
      {#if !initialized}
        <p class="m-0 text-sm text-base-content/60">Loading Issue Link…</p>
      {:else if linkedKey}
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-sm font-semibold text-base-content">{linkedKey}</span>
            {#if issue}<span class="badge badge-outline badge-sm">{issue.status}</span>{/if}
          </div>

          {#if issue}
            <p class="m-0 text-sm font-medium text-base-content">{issue.summary}</p>
            <p class="m-0 text-sm text-base-content/70">{descriptionExcerpt(issue.descriptionHtml)}</p>
          {:else if loading}
            <p class="m-0 text-sm text-base-content/60">Loading {linkedKey}…</p>
          {/if}

          {#if error}<p class="alert alert-error m-0 py-2 text-sm" role="alert">{error}</p>{/if}

          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs text-base-content/50">{formatRefreshTime(refreshedAt)}</span>
            <div class="flex flex-wrap items-center gap-1">
              {#if issue}
                <button class="btn btn-ghost btn-xs" type="button" onclick={openInJira}>
                  Open in Jira
                </button>
              {/if}
              <button class="btn btn-ghost btn-xs" type="button" onclick={() => void refresh({ force: true })} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button class="btn btn-ghost btn-xs" type="button" onclick={() => void unlink()} disabled={unlinking}>
                {unlinking ? 'Unlinking…' : 'Unlink'}
              </button>
            </div>
          </div>
        </div>
      {:else}
        <div class="flex flex-col gap-2">
          <p class="m-0 text-sm text-base-content/60">This Task isn't linked to a Jira Issue.</p>
          {#if suggestion}
            <p class="m-0 text-xs text-base-content/60">
              Suggested from Task text: <strong class="font-mono text-base-content">{suggestion}</strong>. Confirm to link.
            </p>
          {/if}
          <form class="flex flex-wrap items-end gap-2" onsubmit={(event) => { event.preventDefault(); void link() }}>
            <label class="form-control min-w-32 flex-1 gap-1">
              <span class="text-xs text-base-content/60">Issue Key</span>
              <input
                class="input input-bordered input-sm w-full"
                type="text"
                placeholder="PROJ-123"
                autocomplete="off"
                bind:value={inputKey}
              />
            </label>
            <button class="btn btn-primary btn-sm" type="submit" disabled={linking}>
              {linking ? 'Linking…' : 'Link Issue'}
            </button>
          </form>
          {#if error}<p class="alert alert-error m-0 py-2 text-sm" role="alert">{error}</p>{/if}
        </div>
      {/if}
    </div>
  {/if}
</section>
