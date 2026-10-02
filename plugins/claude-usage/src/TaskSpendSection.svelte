<script lang="ts">
  import ChartColumnBig from '@lucide/svelte/icons/chart-column-big'
  import type { PluginTaskUISectionProps } from '@openforge-app/plugin-sdk/frontend'
  import type { TaskSpendData } from './dashboard'
  import { formatMoney } from './format'
  import { fetchTaskSpend } from './usageClient'

  let { api, taskId }: PluginTaskUISectionProps = $props()

  let spend = $state<TaskSpendData | null>(null)
  let loadedTaskId: string | null = null

  /**
   * A Task with no Claude Code session recorded against it reads as a dash, not
   * as a zero: no OpenForge Task ran for free.
   */
  const amount = $derived(spend === null ? '…' : spend.found ? formatMoney(spend.total) : '—')

  /**
   * The host hands over a fresh context object on unrelated store ticks, so
   * keying this on the Task's identity is what stops the figure re-fetching and
   * flashing while the user is reading it.
   */
  $effect(() => {
    const nextTaskId = taskId
    if (nextTaskId === loadedTaskId) return
    loadedTaskId = nextTaskId
    spend = null
    void fetchTaskSpend(api, nextTaskId)
      .then((result) => {
        if (loadedTaskId === nextTaskId) spend = result
      })
      .catch(() => {
        if (loadedTaskId === nextTaskId) spend = null
      })
  })
</script>

<section data-task-info-card="claude-usage" data-card-sizing="natural" data-card-layout="row" aria-label="Claude usage">
  <div class="row">
    <span class="caret-column" aria-hidden="true"></span>
    <span class="icon" aria-hidden="true"><ChartColumnBig size={14} /></span>
    <h3>Claude usage</h3>
    <span class="amount">{amount}</span>
  </div>
</section>

<style>
  section { --section-inset: .75rem; flex-shrink: 0; overflow: hidden; padding: var(--of-space4) var(--section-inset); border: var(--of-border-width) solid color-mix(in oklab, var(--of-border) 70%, transparent); border-radius: var(--of-radius-control); background: var(--of-surface); }
  .row { display: flex; align-items: center; gap: var(--of-space4); font-size: var(--of-text-md); line-height: 1.25rem; color: var(--of-text); }
  .caret-column { width: .75rem; flex-shrink: 0; }
  .icon { display: flex; flex-shrink: 0; align-items: center; color: color-mix(in oklab, var(--of-text) 50%, transparent); }
  h3 { margin: 0; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: inherit; font-weight: 600; }
  .amount { flex-shrink: 0; font-variant-numeric: tabular-nums; }
</style>
