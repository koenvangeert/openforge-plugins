<script lang="ts">
  import NotebookPen from '@lucide/svelte/icons/notebook-pen'
  import type { PluginTaskUISectionProps } from '@openforge-app/plugin-sdk/frontend'
  import HandoffNotesTaskPane from './HandoffNotesTaskPane.svelte'
  import './HandoffNotesTaskView.css'

  let { api, taskId, projectId }: PluginTaskUISectionProps = $props()

  let expanded = $state(true)
  let contentId = $derived(`handoff-notes-section-${taskId}`)
</script>

<section class="handoff-section" data-task-info-card="handoff-notes" data-card-sizing="natural" aria-label="Handoff Notes">
  <div class="handoff-section-header" class:collapsed={!expanded}>
    <h3 class="handoff-section-heading">
      <button
        type="button"
        class="handoff-section-toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        onclick={() => { expanded = !expanded }}
      >
        <span class="handoff-section-chevron" class:collapsed={!expanded} aria-hidden="true">▾</span>
        <span class="handoff-section-icon" aria-hidden="true">
          <NotebookPen size={14} />
        </span>
        <span class="handoff-section-title">Handoff Notes</span>
      </button>
    </h3>
  </div>

  {#if expanded}
    <div id={contentId} class="handoff-section-content">
      <HandoffNotesTaskPane {api} {taskId} {projectId} layout="task-info" />
    </div>
  {/if}
</section>
