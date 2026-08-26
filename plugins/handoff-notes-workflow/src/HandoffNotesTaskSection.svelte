<script lang="ts">
  import type { PluginTaskUISectionProps } from '@openforge-app/plugin-sdk/frontend'
  import HandoffNotesTaskPane from './HandoffNotesTaskPane.svelte'

  let { api, taskId, projectId }: PluginTaskUISectionProps = $props()
</script>

<section class="handoff-section" data-task-info-card="handoff-notes" data-card-sizing="natural" aria-label="Handoff Notes">
  <header class="handoff-section-header">
    <h3>Handoff Notes</h3>
  </header>
  <HandoffNotesTaskPane {api} {taskId} {projectId} layout="task-info" />
</section>
