<script lang="ts">
  import PluginSidebarLink from '@openforge-app/plugin-sdk/ui/PluginSidebarLink.svelte'
  import ChartColumnBig from '@lucide/svelte/icons/chart-column-big'
  import type { PluginSidebarNavigationProps } from '@openforge-app/plugin-sdk/frontend'
  import { formatMoney } from './format'
  import { fetchDashboard } from './usageClient'

  let { api, active, collapsed, view, onActivate }: PluginSidebarNavigationProps = $props()

  const REFRESH_INTERVAL_MS = 60_000

  let last30Days = $state<number | null>(null)

  $effect(() => {
    let disposed = false
    const read = async () => {
      try {
        const dashboard = await fetchDashboard(api)
        if (!disposed) last30Days = dashboard.totals.last30Days.total
      } catch {
        if (!disposed) last30Days = null
      }
    }
    void read()
    const timer = setInterval(read, REFRESH_INTERVAL_MS)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  })
</script>

<PluginSidebarLink
  accessibleName={last30Days === null ? view.title : `${view.title}, ${formatMoney(last30Days)} in the last 30 days`}
  {active}
  {collapsed}
  {onActivate}
>
  {#snippet leading()}
    <ChartColumnBig size={18} aria-hidden="true" />
  {/snippet}
  {#snippet label()}
    {view.title}
  {/snippet}
  {#snippet trailing()}
    {#if last30Days !== null}
      <span class="text-xs tabular-nums text-base-content/45">{formatMoney(last30Days)}</span>
    {/if}
  {/snippet}
</PluginSidebarLink>
