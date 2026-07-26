import { describe, expect, it } from 'vitest'
import {
  computeLabelUsage,
  readColumnLabels,
  readValues,
  resolveColumnLabels,
  writeColumnLabels,
  writeValue,
} from './boardStore'
import type { Issue, RepoLabel } from '../lib/types'

/** An in-memory stand-in for the host's project-scoped plugin storage. */
function fakeStorage(seed: Record<string, unknown> = {}) {
  const projects = new Map<string, Map<string, unknown>>()
  const scopeFor = (projectId: string) => {
    let scope = projects.get(projectId)
    if (!scope) {
      scope = new Map(Object.entries(seed))
      projects.set(projectId, scope)
    }
    return scope
  }
  return {
    global: { get: async () => null, set: async () => {}, delete: async () => {} },
    task: () => ({ get: async () => null, set: async () => {}, delete: async () => {} }),
    project: (projectId: string) => ({
      get: async (key: string) => (scopeFor(projectId).get(key) ?? null) as never,
      set: async (key: string, value: unknown) => void scopeFor(projectId).set(key, value),
      delete: async (key: string) => void scopeFor(projectId).delete(key),
    }),
  }
}

const issue = (number: number, labels: string[]): Issue => ({
  number,
  title: `Issue ${number}`,
  body: null,
  state: 'open',
  html_url: `https://github.com/acme/repo/issues/${number}`,
  labels: labels.map((name) => ({ name, color: 'ffffff' })),
})

const repoLabels: RepoLabel[] = [
  { name: 'feature', color: '00ff00' },
  { name: 'bug', color: 'ff0000' },
  { name: 'stale', color: 'cccccc' },
]

describe('computeLabelUsage', () => {
  it('marks labels carried by any open issue, preserving repo-label order', () => {
    const usage = computeLabelUsage(repoLabels, [issue(1, ['feature']), issue(2, ['feature', 'bug'])])

    expect(usage).toEqual([
      { name: 'feature', color: '00ff00', used: true },
      { name: 'bug', color: 'ff0000', used: true },
      { name: 'stale', color: 'cccccc', used: false },
    ])
  })
})

describe('values', () => {
  it('starts empty and round-trips a value', async () => {
    const storage = fakeStorage()

    expect(await readValues(storage as never, 'P-1')).toEqual({})

    await writeValue(storage as never, 'P-1', 7, 5)

    expect(await readValues(storage as never, 'P-1')).toEqual({ '7': 5 })
  })

  it('clears a value by dropping its entry rather than storing null', async () => {
    const storage = fakeStorage()
    await writeValue(storage as never, 'P-1', 7, 5)

    await writeValue(storage as never, 'P-1', 7, null)

    expect(await readValues(storage as never, 'P-1')).toEqual({})
  })

  it('rejects values outside 1..10', async () => {
    const storage = fakeStorage()

    await expect(writeValue(storage as never, 'P-1', 7, 0)).rejects.toThrow(/between 1 and 10/)
    await expect(writeValue(storage as never, 'P-1', 7, 11)).rejects.toThrow(/between 1 and 10/)
    await expect(writeValue(storage as never, 'P-1', 7, 1.5)).rejects.toThrow(/between 1 and 10/)
  })

  it('keeps values separate per project', async () => {
    const storage = fakeStorage()

    await writeValue(storage as never, 'P-1', 7, 5)
    await writeValue(storage as never, 'P-2', 7, 9)

    expect(await readValues(storage as never, 'P-1')).toEqual({ '7': 5 })
    expect(await readValues(storage as never, 'P-2')).toEqual({ '7': 9 })
  })
})

describe('resolveColumnLabels', () => {
  it('seeds from the labels in use on first open and persists the seed', async () => {
    const storage = fakeStorage()
    const issues = [issue(1, ['feature']), issue(2, ['bug'])]

    const columns = await resolveColumnLabels(storage as never, 'P-1', repoLabels, issues)

    expect(columns).toEqual(['feature', 'bug'])
    expect(await readColumnLabels(storage as never, 'P-1')).toEqual(['feature', 'bug'])
  })

  it('never re-seeds a board the user deliberately cleared', async () => {
    const storage = fakeStorage()
    await writeColumnLabels(storage as never, 'P-1', [])

    const columns = await resolveColumnLabels(storage as never, 'P-1', repoLabels, [issue(1, ['feature'])])

    expect(columns).toEqual([])
  })

  it('returns the curated columns untouched once they exist', async () => {
    const storage = fakeStorage()
    await writeColumnLabels(storage as never, 'P-1', ['bug', 'feature'])

    const columns = await resolveColumnLabels(storage as never, 'P-1', repoLabels, [issue(1, ['stale'])])

    expect(columns).toEqual(['bug', 'feature'])
  })
})
