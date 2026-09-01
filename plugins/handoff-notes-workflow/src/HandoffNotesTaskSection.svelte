<script lang="ts">
  import NotebookPen from '@lucide/svelte/icons/notebook-pen'
  import { pluginSectionKey } from '@openforge-app/plugin-sdk/collapsibleSectionState'
  import type { PluginTaskUISectionProps } from '@openforge-app/plugin-sdk/frontend'
  import CollapsibleSection from '@openforge-app/plugin-sdk/ui/CollapsibleSection.svelte'
  import HandoffNotesTaskPane from './HandoffNotesTaskPane.svelte'
  import './HandoffNotesTaskView.css'

  let { api, context, taskId, projectId }: PluginTaskUISectionProps = $props()

  let sectionKey = $derived(pluginSectionKey(context.pluginId, 'handoff-notes'))
</script>

<CollapsibleSection {sectionKey} title="Handoff Notes" cardId="handoff-notes">
  {#snippet icon()}<NotebookPen size={14} />{/snippet}
  <HandoffNotesTaskPane {api} {taskId} {projectId} layout="task-info" />
</CollapsibleSection>
