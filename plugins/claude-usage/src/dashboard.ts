import { attribute, attributionKey, type Attribution, type AttributionMap } from './attribution'
import {
  addCost,
  addTokens,
  costOf,
  EMPTY_COST,
  EMPTY_TOKENS,
  isPricedModel,
  normalizeModelId,
  totalCost,
  type CostBreakdown,
  type TokenTotals,
} from './pricing'
import { iterateRows, type SpendIndex } from './spendIndex'

export interface SpendFigure {
  total: number
  breakdown: CostBreakdown
  tokens: TokenTotals
}

export interface DailySpend {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string
  total: number
  breakdown: CostBreakdown
}

export interface ScopeSpend {
  key: string
  label: string
  projectName: string | null
  total: number
}

export interface ModelSpend {
  model: string
  total: number
  tokens: number
}

export interface UnpricedModel {
  model: string
  tokens: number
}

export interface SpendDashboardData {
  generatedAt: number
  totals: { allTime: SpendFigure; last30Days: SpendFigure; last7Days: SpendFigure; today: SpendFigure }
  runRatePerDay: number
  dailySeries: DailySpend[]
  byProject: ScopeSpend[]
  byTask: ScopeSpend[]
  byModel: ModelSpend[]
  unpricedModels: UnpricedModel[]
  unattributed: SpendFigure
  transcriptCount: number
  earliestDay: string | null
  latestDay: string | null
}

const DAY_MS = 86_400_000
export const DAILY_SERIES_DAYS = 30
const TOP_TASKS = 15

function emptyFigure(): SpendFigure {
  return { total: 0, breakdown: { ...EMPTY_COST }, tokens: { ...EMPTY_TOKENS } }
}

function addToFigure(figure: SpendFigure, cost: CostBreakdown | null, tokens: TokenTotals): void {
  figure.tokens = addTokens(figure.tokens, tokens)
  if (!cost) return
  figure.breakdown = addCost(figure.breakdown, cost)
  figure.total += totalCost(cost)
}

/** `YYYY-MM-DD` in the host's own timezone, so DST shifts are handled by Date. */
export function localDayOf(timestamp: number): string {
  const date = new Date(timestamp)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function utcHourToTimestamp(utcHour: string): number {
  return Date.parse(`${utcHour}:00:00.000Z`)
}

function scopeLabel(attribution: Attribution): { label: string; projectName: string | null } {
  switch (attribution.kind) {
    case 'task':
      return { label: attribution.taskTitle, projectName: attribution.projectName }
    case 'project':
      return { label: attribution.projectName, projectName: null }
    case 'unattributed':
      return { label: 'Outside OpenForge', projectName: null }
  }
}

export function buildDashboard(
  index: SpendIndex,
  attributionMap: AttributionMap,
  now: number,
): SpendDashboardData {
  const totals = {
    allTime: emptyFigure(),
    last30Days: emptyFigure(),
    last7Days: emptyFigure(),
    today: emptyFigure(),
  }
  const unattributed = emptyFigure()
  const daily = new Map<string, { total: number; breakdown: CostBreakdown }>()
  const projects = new Map<string, ScopeSpend>()
  const tasks = new Map<string, ScopeSpend>()
  const models = new Map<string, ModelSpend>()
  const unpriced = new Map<string, number>()
  let earliestDay: string | null = null
  let latestDay: string | null = null

  const todayStart = startOfLocalDay(now)
  const sevenDayStart = todayStart - 6 * DAY_MS
  const thirtyDayStart = todayStart - (DAILY_SERIES_DAYS - 1) * DAY_MS

  for (const row of iterateRows(index)) {
    const timestamp = utcHourToTimestamp(row.utcHour)
    if (Number.isNaN(timestamp)) continue
    const day = localDayOf(timestamp)
    if (!earliestDay || day < earliestDay) earliestDay = day
    if (!latestDay || day > latestDay) latestDay = day

    const model = normalizeModelId(row.model)
    const cost = costOf(row.model, row.tokens)
    const tokenCount =
      row.tokens.input +
      row.tokens.output +
      row.tokens.cacheWrite5m +
      row.tokens.cacheWrite1h +
      row.tokens.cacheRead

    if (!isPricedModel(row.model)) {
      if (tokenCount > 0) unpriced.set(model, (unpriced.get(model) ?? 0) + tokenCount)
    } else {
      const existing = models.get(model) ?? { model, total: 0, tokens: 0 }
      existing.total += cost ? totalCost(cost) : 0
      existing.tokens += tokenCount
      models.set(model, existing)
    }

    addToFigure(totals.allTime, cost, row.tokens)
    if (timestamp >= thirtyDayStart) addToFigure(totals.last30Days, cost, row.tokens)
    if (timestamp >= sevenDayStart) addToFigure(totals.last7Days, cost, row.tokens)
    if (timestamp >= todayStart) addToFigure(totals.today, cost, row.tokens)

    if (cost && timestamp >= thirtyDayStart) {
      const bucket = daily.get(day) ?? { total: 0, breakdown: { ...EMPTY_COST } }
      bucket.breakdown = addCost(bucket.breakdown, cost)
      bucket.total += totalCost(cost)
      daily.set(day, bucket)
    }

    const attribution = attribute(attributionMap, row.cwd)
    const spend = cost ? totalCost(cost) : 0
    if (attribution.kind === 'unattributed') {
      addToFigure(unattributed, cost, row.tokens)
    }
    const { label, projectName } = scopeLabel(attribution)
    if (attribution.kind === 'task') {
      const key = attributionKey(attribution)
      const entry = tasks.get(key) ?? { key, label, projectName, total: 0 }
      entry.total += spend
      tasks.set(key, entry)
    }
    const projectKey =
      attribution.kind === 'unattributed' ? 'unattributed' : `project:${attribution.projectId}`
    const projectDisplay = attribution.kind === 'task' ? attribution.projectName : label
    const projectEntry = projects.get(projectKey) ?? {
      key: projectKey,
      label: projectDisplay,
      projectName: null,
      total: 0,
    }
    projectEntry.total += spend
    projects.set(projectKey, projectEntry)
  }

  const dailySeries: DailySpend[] = []
  for (let offset = DAILY_SERIES_DAYS - 1; offset >= 0; offset -= 1) {
    const day = localDayOf(todayStart - offset * DAY_MS)
    const bucket = daily.get(day)
    dailySeries.push({ day, total: bucket?.total ?? 0, breakdown: bucket?.breakdown ?? { ...EMPTY_COST } })
  }

  const byDescendingTotal = (left: { total: number }, right: { total: number }) => right.total - left.total

  return {
    generatedAt: now,
    totals,
    runRatePerDay: totals.last7Days.total / 7,
    dailySeries,
    byProject: [...projects.values()].filter((entry) => entry.total > 0).sort(byDescendingTotal),
    byTask: [...tasks.values()].filter((entry) => entry.total > 0).sort(byDescendingTotal).slice(0, TOP_TASKS),
    byModel: [...models.values()].filter((entry) => entry.tokens > 0).sort(byDescendingTotal),
    unpricedModels: [...unpriced.entries()]
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((left, right) => right.tokens - left.tokens),
    unattributed,
    transcriptCount: index.transcripts.size,
    earliestDay,
    latestDay,
  }
}

export interface TaskSpendData {
  taskId: string
  found: boolean
  total: number
}

export function buildTaskSpend(
  index: SpendIndex,
  attributionMap: AttributionMap,
  taskId: string,
): TaskSpendData {
  let total = 0
  let found = false

  for (const row of iterateRows(index)) {
    if (Number.isNaN(utcHourToTimestamp(row.utcHour))) continue
    const attribution = attribute(attributionMap, row.cwd)
    if (attribution.kind !== 'task' || attribution.taskId !== taskId) continue
    found = true
    const cost = costOf(row.model, row.tokens)
    if (cost) total += totalCost(cost)
  }

  return { taskId, found, total }
}
