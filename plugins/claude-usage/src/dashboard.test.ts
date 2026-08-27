import { describe, expect, it } from 'vitest'
import { buildAttributionMap } from './attribution'
import { buildDashboard, buildTaskSpend, localDayOf } from './dashboard'
import { emptySpendIndex, indexTranscript, mergeTranscript } from './spendIndex'
import type { BilledResponse } from './transcript'

const NOW = Date.parse('2026-08-27T12:00:00.000Z')

const map = buildAttributionMap({
  projects: [{ id: 'P-1', name: 'frontend', path: '/code/frontend' }],
  tasks: [{ id: 'T-1', title: 'Fix the panel', projectId: 'P-1', workspacePath: '/worktrees/KVG-1' }],
})

function response(overrides: Partial<BilledResponse> = {}): BilledResponse {
  return {
    messageId: 'msg_1',
    model: 'claude-opus-5',
    timestamp: NOW,
    cwd: '/worktrees/KVG-1',
    tokens: { input: 0, output: 1_000_000, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 },
    ...overrides,
  }
}

function indexOf(...responses: BilledResponse[]) {
  const index = emptySpendIndex()
  responses.forEach((entry, position) => {
    mergeTranscript(index, `t${position}.jsonl`, indexTranscript([entry], { sizeBytes: 1, modifiedAt: 1 }))
  })
  return index
}

describe('buildDashboard', () => {
  it('reports the same spend in every window that contains the response', () => {
    const dashboard = buildDashboard(indexOf(response()), map, NOW)

    expect(dashboard.totals.today.total).toBe(25)
    expect(dashboard.totals.last7Days.total).toBe(25)
    expect(dashboard.totals.allTime.total).toBe(25)
    expect(dashboard.runRatePerDay).toBeCloseTo(25 / 7)
  })

  it('excludes spend older than a window from that window but keeps it in all-time', () => {
    const old = response({ timestamp: NOW - 45 * 86_400_000 })

    const dashboard = buildDashboard(indexOf(old), map, NOW)

    expect(dashboard.totals.last30Days.total).toBe(0)
    expect(dashboard.totals.allTime.total).toBe(25)
  })

  it('rolls task spend up into its project', () => {
    const dashboard = buildDashboard(indexOf(response(), response({ cwd: '/code/frontend' })), map, NOW)

    expect(dashboard.byProject).toEqual([{ key: 'project:P-1', label: 'frontend', projectName: null, total: 50 }])
    expect(dashboard.byTask).toEqual([
      { key: 'task:T-1', label: 'Fix the panel', projectName: 'frontend', total: 25 },
    ])
  })

  it('reports spend outside every project instead of hiding it', () => {
    const dashboard = buildDashboard(indexOf(response({ cwd: '/elsewhere' })), map, NOW)

    expect(dashboard.unattributed.total).toBe(25)
    expect(dashboard.byProject).toEqual([
      { key: 'unattributed', label: 'Outside OpenForge', projectName: null, total: 25 },
    ])
  })

  it('names an unpriced model and leaves its tokens out of every spend figure', () => {
    const dashboard = buildDashboard(indexOf(response({ model: 'claude-unreleased-9' })), map, NOW)

    expect(dashboard.unpricedModels).toEqual([{ model: 'claude-unreleased-9', tokens: 1_000_000 }])
    expect(dashboard.totals.allTime.total).toBe(0)
    expect(dashboard.byModel).toEqual([])
  })

  it('omits a zero-token model from the unpriced warning, since it costs nothing either way', () => {
    const free = response({
      model: '<synthetic>',
      tokens: { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 },
    })

    expect(buildDashboard(indexOf(free), map, NOW).unpricedModels).toEqual([])
  })

  it('emits one series point per local day, including days with no spend', () => {
    const dashboard = buildDashboard(indexOf(response()), map, NOW)

    expect(dashboard.dailySeries).toHaveLength(30)
    expect(dashboard.dailySeries.at(-1)).toMatchObject({ day: localDayOf(NOW), total: 25 })
    expect(dashboard.dailySeries.slice(0, -1).every((day) => day.total === 0)).toBe(true)
  })

  it('splits spend across the cost components that produced it', () => {
    const mixed = response({
      tokens: { input: 1_000_000, output: 1_000_000, cacheWrite5m: 1_000_000, cacheWrite1h: 0, cacheRead: 1_000_000 },
    })

    expect(buildDashboard(indexOf(mixed), map, NOW).totals.allTime.breakdown).toEqual({
      input: 5,
      output: 25,
      cacheWrite: 6.25,
      cacheRead: 0.5,
    })
  })

  it('counts the transcripts behind the figures', () => {
    expect(buildDashboard(indexOf(response(), response()), map, NOW).transcriptCount).toBe(2)
  })

  it('returns zeroed totals for an empty index rather than failing', () => {
    const dashboard = buildDashboard(emptySpendIndex(), map, NOW)

    expect(dashboard.totals.allTime.total).toBe(0)
    expect(dashboard.byProject).toEqual([])
    expect(dashboard.earliestDay).toBeNull()
  })
})

describe('buildTaskSpend', () => {
  it('prices only the responses billed inside the task worktree', () => {
    const index = indexOf(response(), response({ messageId: 'msg_2', cwd: '/code/frontend' }))

    expect(buildTaskSpend(index, map, 'T-1')).toEqual({ taskId: 'T-1', found: true, total: 25 })
  })

  it('sums every response in the worktree, not just the most recent', () => {
    const index = indexOf(response(), response({ messageId: 'msg_2' }))

    expect(buildTaskSpend(index, map, 'T-1').total).toBe(50)
  })

  it('answers a task with no transcripts without inventing a figure', () => {
    expect(buildTaskSpend(indexOf(response()), map, 'T-unknown')).toEqual({
      taskId: 'T-unknown',
      found: false,
      total: 0,
    })
  })

  it('claims a task it has rows for even when they priced to nothing', () => {
    const free = response({ model: '<synthetic>' })

    expect(buildTaskSpend(indexOf(free), map, 'T-1')).toEqual({ taskId: 'T-1', found: true, total: 0 })
  })
})
