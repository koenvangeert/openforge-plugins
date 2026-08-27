<script lang="ts">
  import PluginPageHeader from '@openforge-app/plugin-sdk/ui/PluginPageHeader.svelte'
  import PluginViewState from '@openforge-app/plugin-sdk/ui/PluginViewState.svelte'
  import type { PluginViewProps } from '@openforge-app/plugin-sdk/frontend'
  import DailySpendChart from './DailySpendChart.svelte'
  import type { SpendDashboardData, SpendFigure } from './dashboard'
  import { formatDayLabel, formatMoney, formatShare, formatTokens } from './format'
  import { CHART_SERIES } from './dailyChartConfig'
  import { fetchDashboard, refreshDashboard } from './usageClient'

  let { api }: PluginViewProps = $props()

  let dashboard = $state<SpendDashboardData | null>(null)
  let error = $state<string | null>(null)
  let refreshing = $state(false)

  const DASHBOARD_POLL_MS = 60_000

  const peakDay = $derived(Math.max(...(dashboard?.dailySeries.map((day) => day.total) ?? [0]), 0))

  const COMPONENTS = CHART_SERIES.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: `var(${entry.cssVariable})`,
  }))

  async function load(): Promise<void> {
    try {
      dashboard = await fetchDashboard(api)
      error = null
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
  }

  async function rescan(): Promise<void> {
    refreshing = true
    try {
      dashboard = (await refreshDashboard(api)).dashboard
      error = null
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      refreshing = false
    }
  }

  /**
   * The backend rebuilds the index on its own interval, so an open page has to
   * re-read it or it shows whatever was true when it mounted.
   */
  $effect(() => {
    void load()
    const poll = setInterval(() => void load(), DASHBOARD_POLL_MS)
    return () => clearInterval(poll)
  })

  function componentTotal(figure: SpendFigure, key: (typeof COMPONENTS)[number]['key']): number {
    return figure.breakdown[key]
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-base-100">
  <PluginPageHeader
    title="Claude usage"
    subtitle={dashboard
      ? `${dashboard.transcriptCount} transcripts indexed${dashboard.earliestDay ? ` · ${formatDayLabel(dashboard.earliestDay)} to ${formatDayLabel(dashboard.latestDay ?? dashboard.earliestDay)}` : ''}`
      : null}
  >
    {#snippet actions()}
      <button class="btn btn-sm" type="button" onclick={rescan} disabled={refreshing}>
        {refreshing ? 'Scanning…' : 'Rescan transcripts'}
      </button>
    {/snippet}
  </PluginPageHeader>

  <PluginViewState
    loading={dashboard === null && error === null}
    loadingLabel="Reading Claude Code transcripts…"
    {error}
    errorTitle="Cannot read usage"
    onRetry={load}
  >
    {#if dashboard}
      <div class="usage-content min-h-0 flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {#if dashboard.unpricedModels.length > 0}
          <div class="alert alert-warning" role="status">
            <span>
              Excluded from every figure below, because the price table has no entry for
              {#each dashboard.unpricedModels as unpriced, index (unpriced.model)}
                <strong>{unpriced.model}</strong> ({formatTokens(unpriced.tokens)} tokens){index <
                dashboard.unpricedModels.length - 1
                  ? ', '
                  : ''}
              {/each}.
            </span>
          </div>
        {/if}

        <section class="usage-stat-grid gap-4">
          {#each [
            { label: 'Today', figure: dashboard.totals.today },
            { label: 'Last 7 days', figure: dashboard.totals.last7Days },
            { label: 'Last 30 days', figure: dashboard.totals.last30Days },
            { label: 'All recorded', figure: dashboard.totals.allTime },
          ] as card (card.label)}
            <div class="rounded-lg border border-base-300 bg-base-200 p-4">
              <div class="text-xs uppercase tracking-wide text-base-content/55">{card.label}</div>
              <div class="mt-1 text-3xl font-semibold tabular-nums text-base-content">
                {formatMoney(card.figure.total)}
              </div>
              <div class="mt-1 text-xs text-base-content/55">
                {formatTokens(
                  card.figure.tokens.input +
                    card.figure.tokens.output +
                    card.figure.tokens.cacheWrite5m +
                    card.figure.tokens.cacheWrite1h +
                    card.figure.tokens.cacheRead,
                )} tokens
              </div>
            </div>
          {/each}
        </section>

        <section class="rounded-lg border border-base-300 bg-base-200 p-4">
          <div class="flex items-baseline justify-between gap-4">
            <h3 class="m-0 text-sm font-semibold text-base-content">Daily spend</h3>
            <span class="text-xs text-base-content/55">
              {formatMoney(dashboard.runRatePerDay)}/day over the last 7 days · {formatMoney(peakDay)} peak
            </span>
          </div>
          <div class="mt-4">
            <DailySpendChart series={dashboard.dailySeries} />
          </div>
          <div class="mt-3 flex flex-wrap gap-4 text-xs text-base-content/70">
            {#each COMPONENTS as component (component.key)}
              <span class="flex items-center gap-1.5">
                <span class="h-2.5 w-2.5 rounded-sm" style={`background:${component.color}`}></span>
                {component.label}
                <span class="tabular-nums text-base-content/45">
                  {formatShare(
                    componentTotal(dashboard.totals.allTime, component.key),
                    dashboard.totals.allTime.total,
                  )}
                </span>
              </span>
            {/each}
          </div>
        </section>

        <div class="usage-split-grid gap-6">
          <section class="rounded-lg border border-base-300 bg-base-200 p-4">
            <h3 class="m-0 text-sm font-semibold text-base-content">By project</h3>
            <ul class="mt-3 flex flex-col gap-2 p-0 m-0 list-none">
              {#each dashboard.byProject as scope (scope.key)}
                <li class="flex flex-col gap-1">
                  <div class="flex items-baseline justify-between gap-3 text-sm">
                    <span class="truncate text-base-content">{scope.label}</span>
                    <span class="shrink-0 tabular-nums text-base-content/70">{formatMoney(scope.total)}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-base-300">
                    <div
                      class="h-full rounded-full bg-primary"
                      style={`width:${(scope.total / (dashboard.byProject[0]?.total ?? 1)) * 100}%`}
                    ></div>
                  </div>
                </li>
              {:else}
                <li class="text-sm text-base-content/55">No priced spend recorded yet.</li>
              {/each}
            </ul>
            {#if dashboard.unattributed.total > 0}
              <p class="mt-3 m-0 text-xs text-base-content/45">
                {formatMoney(dashboard.unattributed.total)} ran outside any OpenForge project or task.
              </p>
            {/if}
          </section>

          <section class="rounded-lg border border-base-300 bg-base-200 p-4">
            <h3 class="m-0 text-sm font-semibold text-base-content">Top tasks</h3>
            <ul class="mt-3 flex flex-col gap-2 p-0 m-0 list-none">
              {#each dashboard.byTask as scope (scope.key)}
                <li class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="min-w-0">
                    <span class="block truncate text-base-content">{scope.label}</span>
                    {#if scope.projectName}
                      <span class="block truncate text-xs text-base-content/45">{scope.projectName}</span>
                    {/if}
                  </span>
                  <span class="shrink-0 tabular-nums text-base-content/70">{formatMoney(scope.total)}</span>
                </li>
              {:else}
                <li class="text-sm text-base-content/55">No task-attributed spend recorded yet.</li>
              {/each}
            </ul>
          </section>
        </div>

        <section class="rounded-lg border border-base-300 bg-base-200 p-4">
          <h3 class="m-0 text-sm font-semibold text-base-content">By model</h3>
          <table class="mt-2 w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-base-content/45">
                <th class="py-1 font-medium">Model</th>
                <th class="py-1 text-right font-medium">Tokens</th>
                <th class="py-1 text-right font-medium">Spend</th>
                <th class="py-1 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {#each dashboard.byModel as model (model.model)}
                <tr class="border-t border-base-300">
                  <td class="py-1.5 text-base-content">{model.model}</td>
                  <td class="py-1.5 text-right tabular-nums text-base-content/70">{formatTokens(model.tokens)}</td>
                  <td class="py-1.5 text-right tabular-nums text-base-content/70">{formatMoney(model.total)}</td>
                  <td class="py-1.5 text-right tabular-nums text-base-content/45">
                    {formatShare(model.total, dashboard.totals.allTime.total)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>

        <p class="m-0 text-xs text-base-content/45">
          Priced at Anthropic list rates from the transcripts in <code>~/.claude/projects</code>. Claude Code
          prunes those after about a month; the index keeps what it already read, so earlier periods survive
          here but cannot be recomputed.
        </p>
      </div>
    {/if}
  </PluginViewState>
</div>

<style>
  .usage-content {
    container-type: inline-size;
  }

  .usage-stat-grid,
  .usage-split-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  @container (min-width: 40rem) {
    .usage-stat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (min-width: 64rem) {
    .usage-stat-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .usage-split-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
