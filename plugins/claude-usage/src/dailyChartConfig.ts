import type { CostBreakdown } from './pricing'
import type { DailySpend } from './dashboard'
import { formatDayLabel, formatMoney } from './format'

export interface ChartSeries {
  key: keyof CostBreakdown
  label: string
  cssVariable: string
}

export const CHART_SERIES: readonly ChartSeries[] = [
  { key: 'cacheRead', label: 'Cache read', cssVariable: '--color-info' },
  { key: 'cacheWrite', label: 'Cache write', cssVariable: '--color-accent' },
  { key: 'output', label: 'Output', cssVariable: '--color-primary' },
  { key: 'input', label: 'Input', cssVariable: '--color-secondary' },
]

export interface ChartPalette {
  series: Record<string, string>
  text: string
  grid: string
  surface: string
}

export interface DailyChartData {
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    backgroundColor: string
    borderWidth: number
    borderRadius: number
    stack: string
  }>
}

/**
 * Stacked bottom-up, so the series order here is the visual order from the axis
 * upward and reversing it would put the largest slice on top.
 */
export function buildDailyChartData(series: DailySpend[], palette: ChartPalette): DailyChartData {
  return {
    labels: series.map((day) => formatDayLabel(day.day)),
    datasets: CHART_SERIES.map((entry) => ({
      label: entry.label,
      data: series.map((day) => day.breakdown[entry.key]),
      backgroundColor: palette.series[entry.key] ?? palette.text,
      borderWidth: 0,
      borderRadius: 2,
      stack: 'spend',
    })),
  }
}

export function dayTotal(series: DailySpend[], index: number): number {
  return series[index]?.total ?? 0
}

export function tooltipTitle(series: DailySpend[], index: number): string {
  const day = series[index]
  if (!day) return ''
  return `${formatDayLabel(day.day)} · ${formatMoney(day.total)}`
}

export function tooltipLine(label: string, value: number, total: number): string {
  if (value <= 0) return ''
  const share = total > 0 ? Math.round((value / total) * 100) : 0
  return `${label}: ${formatMoney(value)} (${share}%)`
}
