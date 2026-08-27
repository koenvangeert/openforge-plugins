<script lang="ts">
  import {
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    LinearScale,
    Tooltip,
    type ChartConfiguration,
  } from 'chart.js'
  import type { DailySpend } from './dashboard'
  import { formatMoney } from './format'
  import {
    buildDailyChartData,
    CHART_SERIES,
    dayTotal,
    tooltipLine,
    tooltipTitle,
    type ChartPalette,
  } from './dailyChartConfig'

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

  let { series }: { series: DailySpend[] } = $props()

  let canvas: HTMLCanvasElement | null = $state(null)
  let chart: Chart<'bar'> | null = null

  function readPalette(element: HTMLElement): ChartPalette {
    const styles = getComputedStyle(element)
    const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
    return {
      series: Object.fromEntries(
        CHART_SERIES.map((entry) => [entry.key, read(entry.cssVariable, '#6366f1')]),
      ),
      text: read('--color-base-content', '#1f2937'),
      grid: read('--color-base-300', '#e5e7eb'),
      surface: read('--color-base-100', '#ffffff'),
    }
  }

  function configuration(palette: ChartPalette): ChartConfiguration<'bar'> {
    const muted = `color-mix(in oklab, ${palette.text} 55%, transparent)`
    return {
      type: 'bar',
      data: buildDailyChartData(series, palette),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { color: palette.grid },
            ticks: { color: muted, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 8 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: palette.grid, drawTicks: false },
            border: { display: false },
            ticks: {
              color: muted,
              font: { size: 10 },
              padding: 6,
              callback: (value) => formatMoney(Number(value)),
            },
          },
        },
        plugins: {
          tooltip: {
            backgroundColor: palette.surface,
            titleColor: palette.text,
            bodyColor: palette.text,
            borderColor: palette.grid,
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            callbacks: {
              title: (items) => tooltipTitle(series, items[0]?.dataIndex ?? -1),
              label: (item) =>
                tooltipLine(item.dataset.label ?? '', item.parsed.y ?? 0, dayTotal(series, item.dataIndex)),
            },
            filter: (item) => (item.parsed.y ?? 0) > 0,
          },
        },
      },
    }
  }

  $effect(() => {
    const target = canvas
    if (!target) return
    chart?.destroy()
    chart = new Chart(target, configuration(readPalette(target)))
    return () => {
      chart?.destroy()
      chart = null
    }
  })
</script>

<div class="usage-chart-frame">
  <canvas bind:this={canvas} aria-label="Daily spend for the last 30 days"></canvas>
</div>

<style>
  .usage-chart-frame {
    position: relative;
    height: 15rem;
  }
</style>
