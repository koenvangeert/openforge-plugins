<script lang="ts">
  import type { PluginTaskPaneProps } from '@openforge-app/plugin-sdk/frontend'
  import MarkdownContent from '@openforge-app/plugin-sdk/ui/MarkdownContent.svelte'
  import './HandoffNotesTaskView.css'
  import { loadHandoffNotes, messageFrom } from './handoffNotes'
  import { createHandoffNotesLoadTracker } from './handoffNotesViewState'
  import {
    HANDOFF_NOTES_UPDATED_EVENT,
    type HandoffNotesUpdatedEvent,
  } from './handoffNotesStorage'

  interface Props extends Pick<PluginTaskPaneProps, 'api' | 'taskId' | 'projectId'> {
    layout?: 'tab' | 'task-info'
  }

  let { api, taskId, projectId, layout = 'tab' }: Props = $props()

  const loadTracker = createHandoffNotesLoadTracker()
  let requestSequence = 0
  let loadedTaskId: string | null = null
  let loadedProjectId: string | null = null
  let hasLoaded = false
  let loading = $state(true)
  let unavailableMessage = $state<string | null>(null)
  let loadError = $state<string | null>(null)
  let notes = $state('')

  /**
   * Load once per Task/Project pair. The host re-renders this pane on store
   * ticks unrelated to the Task, handing over a fresh api object each time, and
   * reloading on those re-fetched the notes and flashed the placeholder.
   */
  $effect(() => {
    const selectedTaskId = taskId
    const activeProjectId = projectId
    if (hasLoaded && selectedTaskId === loadedTaskId && activeProjectId === loadedProjectId) return
    hasLoaded = true
    loadedTaskId = selectedTaskId
    loadedProjectId = activeProjectId
    const request = ++requestSequence
    void load(selectedTaskId, activeProjectId, request)
  })

  $effect(() => {
    const selectedTaskId = taskId
    const activeProjectId = projectId
    const subscription = api.events.on<HandoffNotesUpdatedEvent>(
      HANDOFF_NOTES_UPDATED_EVENT,
      ({ taskId: updatedTaskId }) => {
        if (updatedTaskId !== selectedTaskId) return
        const request = ++requestSequence
        void load(selectedTaskId, activeProjectId, request)
      },
    )

    return () => { void subscription.dispose() }
  })

  async function load(selectedTaskId: string, activeProjectId: string | null, request: number) {
    if (loadTracker.shouldShowLoading(selectedTaskId, activeProjectId)) {
      loading = true
      unavailableMessage = null
      loadError = null
      notes = ''
    }

    try {
      const result = await loadHandoffNotes(api, selectedTaskId, activeProjectId)
      if (request !== requestSequence) return

      if (result.status === 'unavailable') {
        unavailableMessage = result.message
        loadError = null
        notes = ''
        return
      }

      unavailableMessage = null
      loadError = null
      notes = result.notes
    } catch (cause) {
      if (request !== requestSequence) return
      unavailableMessage = null
      loadError = messageFrom(cause)
      notes = ''
    } finally {
      if (request === requestSequence) {
        loadTracker.markLoaded(selectedTaskId, activeProjectId)
        loading = false
      }
    }
  }
</script>

<section class="handoff-pane" class:task-info={layout === 'task-info'} aria-label="Handoff Notes">
  {#if loading}
    <div class="state-card" role="status">Loading Handoff Notes…</div>
  {:else if unavailableMessage}
    <div class="state-card unavailable" role="status">
      <strong>Handoff Notes are unavailable</strong>
      <span>{unavailableMessage}</span>
    </div>
  {:else if loadError}
    <div class="state-card error" role="alert">
      <strong>Could not load Handoff Notes</strong>
      <span>{loadError}</span>
    </div>
  {:else if !notes}
    <div class="state-card empty" role="status">
      <strong>No handoff notes yet</strong>
      <span>The agent adds notes when work is handed off.</span>
    </div>
  {:else}
    <article class="notes" aria-label="Agent-maintained Handoff Notes">
      <MarkdownContent content={notes} onOpenUrl={(url) => api.system.openUrl(url)} />
    </article>
  {/if}
</section>
