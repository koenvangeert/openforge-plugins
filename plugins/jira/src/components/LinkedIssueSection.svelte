<script lang="ts">
  import { onMount } from 'svelte'
  import Link from '@lucide/svelte/icons/link'
  import { collapsedSections, isSectionCollapsed, pluginSectionKey } from '@openforge-app/plugin-sdk/collapsibleSectionState'
  import type { PluginTaskUISectionProps } from '@openforge-app/plugin-sdk/frontend'
  import CollapsibleSection from '@openforge-app/plugin-sdk/ui/CollapsibleSection.svelte'
  import { isValidIssueKey } from '../lib/issueKey'
  import type { JiraIssue } from '../lib/jiraTypes'
  import { REFRESH_EVENT } from '../lib/protocol'
  import {
    clearLink,
    type IssueSnapshot,
    loadIssue,
    readIssueSnapshot,
    readLinkedKey,
    saveLinkedKey,
    suggestIssueKey,
  } from '../lib/taskLink'

  type TaskScope = { taskId: string; isCurrent: () => boolean }

  /**
   * A silent load neither shows the busy state nor reports an error: it is
   * revalidating something the user is already reading, and disturbing that is
   * the churn this section is meant to avoid.
   */
  type LoadPolicy = { loud: boolean; checkSnapshot: boolean }

  type LoadAttempt = { taskId: string; loud: boolean; generation: number; isCurrent: () => boolean }

  let { api, context, taskId }: PluginTaskUISectionProps = $props()

  let initialized = $state(false)
  let linkedKey = $state<string | null>(null)
  let issue = $state<JiraIssue | null>(null)
  let refreshedAt = $state<string | null>(null)
  let inputKey = $state('')
  let suggestion = $state<string | null>(null)
  let linking = $state(false)
  let unlinking = $state(false)
  let error = $state<string | null>(null)
  let currentLoad = $state.raw<LoadAttempt | null>(null)
  let lifecycleGeneration = 0
  let refreshGeneration = 0
  let loadedTaskId: string | null = null
  let sectionKey = $derived(pluginSectionKey(context.pluginId, 'linked-issue'))
  let expanded = $derived(!isSectionCollapsed($collapsedSections, sectionKey))
  let observedExpanded: boolean | null = null
  let loading = $derived(currentLoad?.loud === true)

  /** Capture the Task this work was started for, so a late result can ask whether the section still wants it. */
  function captureTask(): TaskScope {
    const expectedTaskId = taskId
    const expectedLifecycle = lifecycleGeneration
    return {
      taskId: expectedTaskId,
      isCurrent: () => taskId === expectedTaskId && lifecycleGeneration === expectedLifecycle,
    }
  }

  function beginLoad(key: string, loud: boolean): LoadAttempt {
    const scope = captureTask()
    const generation = ++refreshGeneration
    currentLoad = {
      taskId: scope.taskId,
      loud,
      generation,
      isCurrent: () => scope.isCurrent() && refreshGeneration === generation && linkedKey === key,
    }
    return currentLoad
  }

  /** Only the newest load owns the busy state, so a superseded one settling must not release it. */
  function endLoad(attempt: LoadAttempt) {
    if (currentLoad?.generation === attempt.generation) currentLoad = null
  }

  /** Retire the in-flight load: nothing it returns may paint, and it stops owning the busy state. */
  function retireLoad() {
    ++refreshGeneration
    currentLoad = null
  }

  /**
   * A read that succeeded outranks a stale alert, even a silent one: the section
   * must not report a failure it has since disproved.
   */
  function paint(snapshot: IssueSnapshot) {
    issue = snapshot.issue
    refreshedAt = snapshot.refreshedAt
    error = null
  }

  async function load(key: string, { loud, checkSnapshot }: LoadPolicy) {
    const attempt = beginLoad(key, loud)
    if (loud) error = null
    try {
      if (checkSnapshot) {
        const { snapshot, needsJiraRead } = await readIssueSnapshot(api, attempt.taskId, key)
        if (!attempt.isCurrent()) return
        if (!needsJiraRead) {
          paint(snapshot)
          return
        }
      }
      const result = await loadIssue(api, attempt.taskId, key)
      if (!attempt.isCurrent()) return
      if (result.ok) paint(result)
      else if (loud) error = result.message
    } catch (cause) {
      if (loud && attempt.isCurrent()) error = unexpectedMessage(cause, 'Could not refresh the Jira Issue')
    } finally {
      endLoad(attempt)
    }
  }

  async function refresh({ force = false }: { force?: boolean } = {}) {
    const key = linkedKey
    if (!key) return
    await load(key, { loud: force || issue === null, checkSnapshot: !force })
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

  async function offerSuggestion(scope: TaskScope) {
    const hint = await suggestIssueKey(api, scope.taskId)
    if (!scope.isCurrent() || linkedKey) return
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
    const scope = captureTask()
    try {
      await saveLinkedKey(api, scope.taskId, key)
      if (!scope.isCurrent()) return
      linkedKey = key
      suggestion = null
      issue = null
      refreshedAt = null
      await refresh({ force: true })
    } catch (cause) {
      if (scope.isCurrent()) error = unexpectedMessage(cause, 'Could not link the Jira Issue')
    } finally {
      if (scope.isCurrent()) linking = false
    }
  }

  async function unlink() {
    const scope = captureTask()
    // Retire before the await: until `clearLink` lands, `linkedKey` still matches
    // what the in-flight load was started for.
    retireLoad()
    unlinking = true
    error = null
    try {
      await clearLink(api, scope.taskId)
      if (!scope.isCurrent()) return
      linkedKey = null
      issue = null
      refreshedAt = null
      inputKey = ''
      await offerSuggestion(scope)
    } catch (cause) {
      if (scope.isCurrent()) error = unexpectedMessage(cause, 'Could not unlink the Jira Issue')
    } finally {
      if (scope.isCurrent()) unlinking = false
    }
  }

  async function openInJira() {
    if (!issue) return
    try {
      await api.system.openUrl(issue.url)
    } catch (cause) {
      error = unexpectedMessage(cause, 'Could not open the Jira Issue')
    }
  }

  /** Retire every scope: a late result must never paint into a section that has moved on. */
  function invalidate() {
    ++lifecycleGeneration
    retireLoad()
  }

  async function initialize() {
    invalidate()
    const scope = captureTask()
    initialized = false
    linkedKey = null
    issue = null
    refreshedAt = null
    inputKey = ''
    suggestion = null
    linking = false
    unlinking = false
    error = null

    try {
      const key = await readLinkedKey(api, scope.taskId)
      if (!scope.isCurrent()) return
      linkedKey = key
      if (!key) {
        initialized = true
        await offerSuggestion(scope)
        return
      }
      const { snapshot, needsJiraRead } = await readIssueSnapshot(api, scope.taskId, key)
      if (!scope.isCurrent()) return
      if (snapshot) paint(snapshot)
      initialized = true
      if (expanded && needsJiraRead) await load(key, { loud: snapshot === null, checkSnapshot: false })
    } catch (cause) {
      if (scope.isCurrent()) {
        initialized = true
        error = unexpectedMessage(cause, 'Could not load the Issue Link')
      }
    }
  }

  onMount(() => {
    const subscription = api.events.on(REFRESH_EVENT, () => void refresh({ force: true }))
    return () => {
      invalidate()
      void subscription.dispose()
    }
  })

  /**
   * Initialize once per Task. The host re-renders this section on store ticks
   * that have nothing to do with the Task (it hands over a fresh context object
   * every time), and re-running the reset on each of those repainted the
   * placeholder and dropped the suggested Key: the constant flashing an unlinked
   * Task showed. The Task's identity is the only thing that warrants a reload.
   */
  $effect(() => {
    const nextTaskId = taskId
    if (nextTaskId === loadedTaskId) return
    loadedTaskId = nextTaskId
    void initialize()
  })

  /**
   * Revalidate on reopen. The shared section chrome owns the toggle, so the
   * collapsed-state transition is the only signal left that the body came back
   * on screen; the mount transition is excluded because `initialize` covers it.
   */
  $effect(() => {
    const nextExpanded = expanded
    const wasExpanded = observedExpanded
    observedExpanded = nextExpanded
    if (wasExpanded === null || wasExpanded === nextExpanded || !nextExpanded) return
    if (initialized && linkedKey) void refresh()
  })
</script>

<CollapsibleSection {sectionKey} title="Linked Issue" cardId="linked-issue">
  {#snippet icon()}<Link size={14} />{/snippet}
  <div class="py-2" aria-busy={loading}>
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
</CollapsibleSection>
