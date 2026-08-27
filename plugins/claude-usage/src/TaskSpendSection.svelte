<script lang="ts">
  import ChartColumnBig from '@lucide/svelte/icons/chart-column-big'
  import type { PluginTaskUISectionProps } from '@openforge-app/plugin-sdk/frontend'
  import type { TaskSpendData } from './dashboard'
  import { formatMoney } from './format'
  import { fetchTaskSpend } from './usageClient'

  let { api, taskId }: PluginTaskUISectionProps = $props()

  let spend = $state<TaskSpendData | null>(null)
  let loadedTaskId: string | null = null

  const amount = $derived(spend?.found ? formatMoney(spend.total) : spend ? '$0.00' : '…')

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
        if (taskId === nextTaskId) spend = result
      })
      .catch(() => {
        if (taskId === nextTaskId) spend = null
      })
  })
</script>

<!--
  Header geometry and inset are the host's own info-section contract, copied
  class for class so this row lines up with Details and Dependencies.
-->
<section
  data-task-info-card="claude-usage"
  data-card-sizing="natural"
  class="shrink-0 overflow-hidden rounded-lg border border-base-300/70 bg-base-100 [--section-inset:0.75rem] [--section-caret-column:1.25rem]"
  aria-label="Claude usage"
>
  <div class="flex items-center gap-2 px-[var(--section-inset)] py-2 text-sm">
    <!-- Holds the caret column the collapsible sections occupy, so this row's icon
         lines up with theirs instead of sitting one column to the left. -->
    <span class="w-3 shrink-0" aria-hidden="true"></span>
    <span class="flex shrink-0 items-center text-base-content/50" aria-hidden="true">
      <ChartColumnBig size={14} />
    </span>
    <span class="min-w-0 flex-1 truncate font-semibold text-base-content">Claude usage</span>
    <span class="shrink-0 tabular-nums text-base-content">{amount}</span>
  </div>
</section>
