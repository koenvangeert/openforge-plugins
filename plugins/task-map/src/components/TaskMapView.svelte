<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Minus, Plus, Scan, Tags } from '@lucide/svelte'
  import type { PluginViewProps } from '@openforge-app/plugin-sdk/frontend'
  import IconButton from '@openforge-app/plugin-sdk/ui/IconButton.svelte'
  import PluginPageHeader from '@openforge-app/plugin-sdk/ui/PluginPageHeader.svelte'
  import PluginPageShell from '@openforge-app/plugin-sdk/ui/PluginPageShell.svelte'
  import PluginViewState from '@openforge-app/plugin-sdk/ui/PluginViewState.svelte'
  import BandSettingsModal from './BandSettingsModal.svelte'
  import TaskMapCanvas from './TaskMapCanvas.svelte'
  import { useMapViewport } from './useMapViewport.svelte'
  import { useTaskMap } from './useTaskMap.svelte'

  let { api, context }: PluginViewProps = $props()

  // `api` is stable for the plugin view lifetime; capture it once in the controller.
  // svelte-ignore state_referenced_locally
  const map = useTaskMap(api)
  const viewport = useMapViewport()

  let editingBands = $state(false)
  let savingBands = $state(false)
  let bandError = $state<string | null>(null)

  $effect(() => {
    map.activateProject(context.projectId)
    closeBandEditor()
  })

  function closeBandEditor(): void {
    editingBands = false
    savingBands = false
    bandError = null
  }

  async function saveBands(labels: string[]): Promise<void> {
    savingBands = true
    bandError = null
    try {
      await map.saveCuratedLabels(labels)
      closeBandEditor()
    } catch (cause) {
      bandError = String(cause instanceof Error ? cause.message : cause)
      savingBands = false
    }
  }

  function openTask(taskId: string): void {
    void api.navigation.navigate({ viewId: 'board', taskId })
  }

  onDestroy(() => {
    map.dispose()
  })
</script>

<PluginPageShell>
  {#snippet header()}
    <PluginPageHeader title="Task Map">
      {#snippet actions()}
        <div class="task-map-zoom">
          <IconButton
            label="Edit bands"
            size="sm"
            disabled={!map.hasProject}
            onClick={() => (editingBands = true)}
          >
            <Tags size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Zoom out" size="sm" disabled={!viewport.canZoomOut} onClick={viewport.zoomOut}>
            <Minus size={16} aria-hidden="true" />
          </IconButton>
          <span class="task-map-zoom-label" aria-live="polite">{viewport.zoomLabel}</span>
          <IconButton label="Zoom in" size="sm" disabled={!viewport.canZoomIn} onClick={viewport.zoomIn}>
            <Plus size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Reset view" size="sm" disabled={viewport.isReset} onClick={viewport.reset}>
            <Scan size={16} aria-hidden="true" />
          </IconButton>
        </div>
      {/snippet}
    </PluginPageHeader>
  {/snippet}
  {#snippet children()}
    {#if !map.hasProject}
      <PluginViewState
        empty
        emptyTitle="No Project selected"
        emptyDescription="Select a Project to see its Task Map."
      />
    {:else}
      <PluginViewState
        loading={map.isLoading}
        error={map.error}
        errorTitle="Unable to load the Task Map"
        onRetry={() => void map.reload()}
        empty={map.isEmpty}
        emptyTitle="No active Tasks"
        emptyDescription="Every Task in this Project is Completed."
      >
        <TaskMapCanvas
          bands={map.bands}
          arrows={map.arrows}
          {viewport}
          onOpenTask={openTask}
          onDropCard={map.dropCard}
          onDropBand={map.dropBand}
          onSizeBand={map.sizeBand}
        />
      </PluginViewState>
    {/if}
  {/snippet}
</PluginPageShell>

{#if editingBands && map.hasProject}
  <BandSettingsModal
    availableLabels={map.availableLabels}
    curatedLabels={map.curatedLabels}
    busy={savingBands}
    error={bandError}
    onClose={closeBandEditor}
    onSave={(labels) => void saveBands(labels)}
  />
{/if}

<style>
  .task-map-zoom {
    display: flex;
    align-items: center;
    gap: var(--of-space1);
  }

  .task-map-zoom-label {
    min-width: 3.5rem;
    text-align: center;
    font-size: var(--of-text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--of-text-secondary);
  }
</style>
