import { describe, expect, it, vi } from 'vitest'
import { createSpendService, SPEND_INDEX_PATH, type SpendServiceDependencies } from './spendService'
import type { TranscriptFileSystem } from './scanner'

const ROOT = '/home/dev/.claude/projects'
const NOW = Date.parse('2026-08-27T12:00:00.000Z')

function usageLine(id: string, output: number, cwd: string): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-27T09:15:00.000Z',
    cwd,
    message: { id, model: 'claude-opus-5', usage: { input_tokens: 0, output_tokens: output } },
  })
}

function fakeExternal(files: Record<string, string>): TranscriptFileSystem {
  return {
    async readDir({ path }) {
      if (path) return []
      return Object.entries(files).map(([name, content]) => ({
        name,
        path: name,
        isDir: false,
        size: content.length,
        modifiedAt: 1,
      }))
    },
    readTextFileChunks({ path }) {
      const content = files[path] ?? ''
      return (async function* () {
        yield content
      })()
    },
  }
}

function harness(overrides: Partial<SpendServiceDependencies> = {}) {
  const written: Array<{ path: string; content: string }> = []
  const dependencies: SpendServiceDependencies = {
    userData: {
      readTextFile: vi.fn(async () => {
        throw new Error('ENOENT')
      }),
      writeTextFile: vi.fn(async (request) => {
        written.push(request)
      }),
    },
    external: fakeExternal({ 'a.jsonl': usageLine('msg_1', 1_000_000, '/worktrees/KVG-1') }),
    projects: { list: vi.fn(async () => [{ id: 'P-1', name: 'frontend', path: '/code/frontend' }]) },
    tasks: {
      list: vi.fn(async () => [
        { id: 'T-1', title: 'Fix the panel', initial_prompt: 'ignored', project_id: 'P-1' },
      ]),
      getWorkspace: vi.fn(async () => ({ workspace_path: '/worktrees/KVG-1', project_id: 'P-1' })),
    },
    root: ROOT,
    now: () => NOW,
    ...overrides,
  }
  return { dependencies, written, service: createSpendService(dependencies) }
}

describe('createSpendService', () => {
  it('scans, persists, and then reports the spend it found', async () => {
    const { service, written } = harness()

    const result = await service.refresh()
    const dashboard = await service.getDashboard()

    expect(result).toMatchObject({ transcriptsRead: 1, responsesIndexed: 1 })
    expect(written).toHaveLength(1)
    expect(written[0]!.path).toBe(SPEND_INDEX_PATH)
    expect(dashboard.totals.allTime.total).toBe(25)
    expect(dashboard.byTask).toEqual([
      { key: 'task:T-1', label: 'Fix the panel', projectName: 'frontend', total: 25 },
    ])
  })

  it('does not rewrite the index when a scan read nothing new', async () => {
    const { service, written } = harness()
    await service.refresh()

    await service.refresh()

    expect(written).toHaveLength(1)
  })

  it('starts from an empty index when no persisted one exists yet', async () => {
    const { service } = harness()

    expect((await service.getDashboard()).totals.allTime.total).toBe(0)
  })

  it('resumes from the persisted index so pruned transcripts still count', async () => {
    const seeded = harness()
    await seeded.service.refresh()
    const persisted = seeded.written[0]!.content

    const reopened = harness({
      userData: { readTextFile: vi.fn(async () => persisted), writeTextFile: vi.fn(async () => {}) },
      external: fakeExternal({}),
    })

    expect((await reopened.service.getDashboard()).totals.allTime.total).toBe(25)
  })

  it('falls back to the task prompt when a task has no explicit title', async () => {
    const { service } = harness({
      tasks: {
        list: vi.fn(async () => [
          { id: 'T-1', title: null, initial_prompt: 'Stop the panel flashing\nmore detail', project_id: 'P-1' },
        ]),
        getWorkspace: vi.fn(async () => ({ workspace_path: '/worktrees/KVG-1', project_id: 'P-1' })),
      },
    })
    await service.refresh()

    expect((await service.getDashboard()).byTask[0]!.label).toBe('Stop the panel flashing')
  })

  it('still reports totals when attribution cannot be resolved', async () => {
    const onError = vi.fn()
    const { service } = harness({
      projects: {
        list: vi.fn(async () => {
          throw new Error('host unavailable')
        }),
      },
      onError,
    })
    await service.refresh()

    const dashboard = await service.getDashboard()

    expect(dashboard.totals.allTime.total).toBe(25)
    expect(dashboard.unattributed.total).toBe(25)
    expect(onError).toHaveBeenCalled()
  })

  it('reuses one attribution lookup across dashboard reads inside the cache window', async () => {
    const { service, dependencies } = harness()
    await service.refresh()

    await service.getDashboard()
    await service.getDashboard()

    expect(dependencies.projects.list).toHaveBeenCalledTimes(1)
  })

  it('reports rather than throws when the index cannot be written', async () => {
    const onError = vi.fn()
    const { service } = harness({
      userData: {
        readTextFile: vi.fn(async () => {
          throw new Error('ENOENT')
        }),
        writeTextFile: vi.fn(async () => {
          throw new Error('EROFS')
        }),
      },
      onError,
    })

    await expect(service.refresh()).resolves.toMatchObject({ transcriptsRead: 1 })
    expect(onError).toHaveBeenCalledWith('failed to persist the spend index', expect.any(Error))
  })
})
